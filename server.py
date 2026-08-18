"""HTTP bridge between the Self-RAG LangGraph agent and the frontend.

The graph in workflow.py is a self-correcting loop: it rewrites the query,
retrieves, enriches, re-ranks, then grades the retrieval 1-10 and loops back
to the rewriter when the grade is below 5. That loop is the interesting part
of the system, so this server streams every node transition to the client as
Server-Sent Events rather than hiding it behind a single blocking response.

Run:  uvicorn server:app --reload --port 8000
"""

from __future__ import annotations

import json
import os
import queue
import shutil
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from agents import load_documents
from workflow import app as rag_graph

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

MAX_UPLOAD_BYTES = 40 * 1024 * 1024

# Browsers block cross-origin calls, so the deployed frontend's origin has to be
# named explicitly. Comma-separated list in ALLOWED_ORIGINS; defaults to the
# local dev server. Set this to your Render static-site URL in production.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if o.strip()
]

api = FastAPI(title="Cortex — Self-RAG Console API", version="1.0.0")

api.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────
# Corpus cache
#
# load_documents() re-parses every PDF on each call, which is wasted work
# when the corpus has not changed. Cache the parsed documents and invalidate
# on any mutation of data/ (upload or delete).
# ─────────────────────────────────────────────────────────────────────────

_corpus_lock = threading.Lock()
_corpus_cache: list | None = None


def corpus_fingerprint() -> tuple:
    return tuple(
        sorted((f.name, f.stat().st_size, int(f.stat().st_mtime)) for f in DATA_DIR.glob("*.pdf"))
    )


_corpus_fp: tuple = ()


def get_corpus() -> list:
    """Parsed documents, re-read only when data/ has actually changed."""
    global _corpus_cache, _corpus_fp
    with _corpus_lock:
        fp = corpus_fingerprint()
        if _corpus_cache is None or fp != _corpus_fp:
            _corpus_cache = load_documents()
            _corpus_fp = fp
        return _corpus_cache


def invalidate_corpus() -> None:
    global _corpus_cache
    with _corpus_lock:
        _corpus_cache = None


# ─────────────────────────────────────────────────────────────────────────
# Documents
# ─────────────────────────────────────────────────────────────────────────


class DocumentOut(BaseModel):
    name: str
    filename: str
    size_bytes: int
    uploaded_at: str


def describe(path: Path) -> DocumentOut:
    st = path.stat()
    return DocumentOut(
        name=path.stem.replace("_", " "),
        filename=path.name,
        size_bytes=st.st_size,
        uploaded_at=datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
    )


@api.get("/api/documents", response_model=list[DocumentOut])
def list_documents() -> list[DocumentOut]:
    return [describe(f) for f in sorted(DATA_DIR.glob("*.pdf"))]


@api.post("/api/documents", response_model=list[DocumentOut])
async def upload_documents(files: list[UploadFile] = File(...)) -> list[DocumentOut]:
    saved: list[DocumentOut] = []

    for upload in files:
        name = Path(upload.filename or "").name
        if not name.lower().endswith(".pdf"):
            raise HTTPException(415, f"{name or 'file'} is not a PDF. This corpus accepts PDFs only.")

        target = DATA_DIR / name
        stem, suffix, n = target.stem, target.suffix, 2
        while target.exists():
            target = DATA_DIR / f"{stem}-{n}{suffix}"
            n += 1

        size = 0
        try:
            with target.open("wb") as out:
                while chunk := await upload.read(1 << 20):
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        raise HTTPException(413, f"{name} exceeds the 40 MB limit.")
                    out.write(chunk)
        except Exception:
            target.unlink(missing_ok=True)
            raise
        finally:
            await upload.close()

        saved.append(describe(target))

    invalidate_corpus()
    return saved


@api.delete("/api/documents/{filename}")
def delete_document(filename: str) -> dict[str, str]:
    target = (DATA_DIR / Path(filename).name).resolve()
    if target.parent != DATA_DIR.resolve() or not target.exists():
        raise HTTPException(404, "No such document.")
    target.unlink()
    invalidate_corpus()
    return {"status": "deleted", "filename": target.name}


# ─────────────────────────────────────────────────────────────────────────
# Chat — streamed graph execution
# ─────────────────────────────────────────────────────────────────────────


class ChatIn(BaseModel):
    query: str = Field(min_length=1, max_length=4000)


# Node id -> the label the console shows on the trace strip.
STAGE_LABELS = {
    "loader": "Corpus loaded",
    "general_responder": "Answered directly",
    "re_writer": "Query rewritten",
    "splitter": "Corpus chunked",
    "retriever": "Hybrid retrieval",
    "context_enrich": "Context enriched",
    "re_rank": "Chunks re-ranked",
    "evaluator": "Sufficiency graded",
    "formatter": "Answer composed",
}


def sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def sources_from(chunks: Any) -> list[str]:
    """Distinct source document names, in rank order."""
    out: list[str] = []
    for c in chunks or []:
        meta = getattr(c, "metadata", None) or {}
        src = meta.get("Source") or meta.get("source")
        if src and src not in out:
            out.append(str(src))
    return out


def run_graph(query: str) -> Iterator[str]:
    """Execute the graph, translating node updates into SSE frames."""
    yield sse("open", {"query": query})

    # An empty corpus crashes deep inside FAISS: load_documents() returns [],
    # so there are no embeddings and faiss.IndexFlatL2(len(embeddings[0]))
    # raises IndexError. Fail here with something actionable instead.
    corpus = get_corpus()
    if not corpus:
        yield sse(
            "error",
            {
                "message": (
                    "The corpus is empty, so there is nothing to retrieve from. "
                    "Add a PDF using the corpus panel and ask again."
                )
            },
        )
        return

    state: dict[str, Any] = {
        "query": query,
        "iterations": 0,
        "docs": corpus,  # pre-parsed; loader() will reuse these
    }

    used_rag = False
    rewrites: list[str] = []
    verdicts: list[dict[str, Any]] = []
    sources: list[str] = []
    chunk_count = 0
    final = ""

    try:
        for update in rag_graph.stream(state, stream_mode="updates"):
            for node, delta in update.items():
                if not isinstance(delta, dict):
                    continue

                if node in ("re_writer", "retriever", "re_rank", "evaluator"):
                    used_rag = True

                yield sse(
                    "stage",
                    {"node": node, "label": STAGE_LABELS.get(node, node)},
                )

                if node == "re_writer" and delta.get("new_query"):
                    rewrites.append(delta["new_query"])
                    yield sse(
                        "rewrite",
                        {"query": delta["new_query"], "attempt": len(rewrites)},
                    )

                elif node == "retriever":
                    chunks = delta.get("retrieved_chunks") or []
                    chunk_count = len(chunks)
                    yield sse("retrieved", {"count": chunk_count})

                elif node == "re_rank":
                    top = delta.get("scored_chunks") or []
                    sources = sources_from(top)
                    yield sse("sources", {"sources": sources, "kept": len(top)})

                elif node == "evaluator":
                    verdict = {
                        "score": delta.get("feedback"),
                        "reason": delta.get("feedback_reason") or "",
                        "iteration": delta.get("iterations", len(verdicts) + 1),
                    }
                    verdicts.append(verdict)
                    yield sse("verdict", verdict)

                elif node == "formatter" and delta.get("final_ans"):
                    final = delta["final_ans"]

        if not final:
            raise RuntimeError("The graph finished without producing an answer.")

        yield sse("answer", {"text": final})
        yield sse(
            "done",
            {
                "route": "rag" if used_rag else "direct",
                "rewrites": rewrites,
                "verdicts": verdicts,
                "sources": sources,
                "chunks_retrieved": chunk_count,
                "attempts": max(len(verdicts), 1),
            },
        )

    except Exception as exc:  # surfaced in the UI, logged in full here
        traceback.print_exc()
        yield sse("error", {"message": f"{type(exc).__name__}: {exc}"})


@api.post("/api/chat")
def chat(body: ChatIn) -> StreamingResponse:
    """Stream the graph run as SSE.

    The graph is synchronous and CPU/IO heavy, so it runs on a worker thread
    and frames are handed back through a queue. This keeps the event loop free
    and lets frames reach the browser as each node completes.
    """
    frames: "queue.Queue[str | None]" = queue.Queue()

    def worker() -> None:
        try:
            for frame in run_graph(body.query.strip()):
                frames.put(frame)
        finally:
            frames.put(None)

    threading.Thread(target=worker, daemon=True).start()

    def stream() -> Iterator[str]:
        while (frame := frames.get()) is not None:
            yield frame

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api.get("/api")
def api_index() -> dict[str, Any]:
    """Describe the API. Served at /api so that / can host the UI bundle when
    one has been built (see the mount at the bottom of this file)."""
    return {
        "service": "Cortex — Self-RAG Console API",
        "note": "This is the API. The user interface runs on the Vite dev server.",
        "ui": "http://localhost:5173",
        "endpoints": {
            "POST /api/chat": "ask a question; streams the graph run as SSE",
            "GET /api/documents": "list the corpus",
            "POST /api/documents": "upload PDFs",
            "DELETE /api/documents/{filename}": "remove a document",
            "GET /api/health": "liveness + document count",
            "GET /docs": "interactive OpenAPI docs",
        },
    }


@api.get("/api/health")
def health() -> dict[str, Any]:
    docs = list(DATA_DIR.glob("*.pdf"))
    return {"status": "ok", "documents": len(docs)}


# ─────────────────────────────────────────────────────────────────────────
# Optional single-service mode
#
# If the frontend has been built, serve it from "/" so one deploy covers both
# the API and the UI — same origin, so CORS never applies and the root URL
# shows the app instead of JSON.
#
# Mounted last: "/" would otherwise shadow every /api route above it. When
# there is no build (normal local development, where Vite serves the UI on its
# own port), the mount is skipped and "/" describes the API instead.
# ─────────────────────────────────────────────────────────────────────────

FRONTEND_DIST = ROOT / "frontend" / "dist"

if (FRONTEND_DIST / "index.html").is_file():
    # html=True serves index.html for unknown paths, which a single-page app needs.
    api.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="ui")
else:

    @api.get("/")
    def no_ui_built() -> dict[str, Any]:
        return {
            "service": "Cortex — Self-RAG Console API",
            "note": (
                "No UI bundle found at frontend/dist. In development the UI is "
                "served by Vite on http://localhost:5173. To serve it from here "
                "instead, run: npm --prefix frontend run build"
            ),
            "api": "/api",
            "docs": "/docs",
        }


app = api
