# Cortex — Self-RAG Retrieval Console

Frontend for the Advanced Self-RAG + RAGAS agent in the parent directory.

Most RAG chat UIs show a spinner while the pipeline runs. This one shows the
pipeline. The graph in `../workflow.py` rewrites the query, retrieves, enriches,
re-ranks, then grades the retrieval 1–10 and **loops back to the rewriter when
the grade is below 5**. That self-correction is the most interesting property of
the system, so the interface makes it the centrepiece rather than hiding it.

## Running it

Two processes. From the **project root** (not this folder):

```bash
pip install -r requirements.txt
```

```bash
uvicorn server:app --reload --port 8000
```

Then the frontend:

```bash
npm --prefix frontend install
```

```bash
npm --prefix frontend run dev
```

Open http://localhost:5173.

> **Port note:** `8000` was occupied on this machine during setup, so
> `frontend/.env.local` pins the dev proxy to `8077`. Delete that file to go
> back to the default `8000`, or change `VITE_API_URL` to whichever port you
> run `uvicorn` on.

`OPENAI_API_KEY` is read from the project-root `.env`, same as before.

## What's here

| Feature | Notes |
|---|---|
| **Chat** | Ask the corpus. Questions are set in display serif, answers as prose — a thread reads like a transcript, not a bubble stack. |
| **Retrieval trace** | Under every answer: the real pipeline stages as ruler ticks, a 10-segment sufficiency meter, and a loop-back bracket when the graph retried. Expand for the rewritten queries, the evaluator's verdict and reasoning per pass, and which documents backed the answer. |
| **Live streaming** | Stages illuminate as each graph node completes, over SSE. A run takes 60–90s, so the trace doubles as honest progress. |
| **Chat history** | Threads in the left rail, grouped by recency, renameable and deletable. Persisted in `localStorage`. |
| **File upload** | Drag PDFs anywhere onto the window, or use the corpus drawer. Add/remove documents and the corpus re-indexes on the next question. |

## Architecture

```
frontend/src
├── App.tsx                     shell, streaming orchestration, drag-and-drop
├── index.css                   design tokens (palette, fluid type, spacing)
├── types.ts
├── lib/
│   ├── api.ts                  SSE client (EventSource can't POST, so hand-parsed)
│   ├── sessions.ts             thread store + localStorage persistence
│   └── useMediaQuery.ts
└── components/
    ├── RetrievalTrace.tsx      ← the signature
    ├── Message.tsx             question/answer rendering, citation marks
    ├── Composer.tsx
    ├── HistoryRail.tsx
    ├── CorpusDrawer.tsx
    ├── Opening.tsx
    └── Icons.tsx
```

`../server.py` is the bridge. `POST /api/chat` runs the graph on a worker thread
and streams one SSE frame per node transition; documents are `GET`/`POST`/`DELETE
/api/documents`. The parsed corpus is cached and invalidated whenever `data/`
changes, so the PDFs aren't re-parsed on every question.

## Design

Swiss-editorial lab instrument — a scientific readout rather than a chat toy.

- **Palette** — bone paper `#F4F1EA`, warm ink `#14140F`, one vermilion `#EA400D`,
  plus pine `#1F4D3A` and amber `#8A5A04` for the evaluator's verdict states.
  No blue, no violet, no gradients. Vermilion is the only accent and it is
  reserved for marks, the active stage, and primary actions.
- **Type** — Instrument Serif (display) × IBM Plex Sans (body) × IBM Plex Mono
  (labels and readouts). The mono is the instrument's voice: every small caps
  label in the UI is mono.
- **Accessibility** — WCAG 2.1 AA. All text and control edges verified against
  both grounds; `#EA400D` was chosen over a brighter `#FF4D1F` specifically
  because it clears 3:1 on paper *and* 4.5:1 on ink, letting one focus ring work
  everywhere. 44px touch targets on mobile, `inert` on off-screen panels,
  `prefers-reduced-motion` honoured throughout.

## Known limits in the agent (not the UI)

Three things I found in the pipeline while wiring this up. I left all of them
alone — they change retrieval behaviour and that's your call, not mine.

1. **Re-ranking is computed but never used.** `nodes.py:re_ranker` writes the
   top-5 to `State["scored_chunks"]`, but `formatter` reads
   `State["retrieved_data"]` — the full enriched set. So the answer is written
   from ~14–20 chunks, not the 5 best. Passing `scored_chunks` to the formatter
   is a one-line change and would likely improve answers and cut cost.
2. **The router's topic list is hardcoded.** `agents.py:rag_check` names the
   operating-systems syllabus explicitly in its prompt. Upload a PDF on any
   other subject and the router returns `NO_RAG`, so the question is answered
   from the model's own knowledge and your document is never searched. Uploads
   only really work for the topics in that prompt until it's generalised
   (deriving it from the corpus, or dropping the allowlist).
3. **The index is rebuilt every query.** `agents.py:retrieve` constructs the
   FAISS index and BM25 retriever on each call, and `re_rank` makes one LLM call
   per chunk. That's most of the 60–90s per question. Building the index once
   per corpus fingerprint would be the biggest single win.

## Changes made outside `frontend/`

- `server.py` — new; the HTTP/SSE bridge.
- `agents.py` — `load_documents()` now scans `data/*.pdf` instead of a fixed
  list of five filenames, so uploads join the corpus.
- `nodes.py` — `loader()` reuses pre-supplied docs when the caller provides them
  (lets the server cache the parsed corpus). Falls back to loading from disk.
- `requirements.txt` — added `fastapi`, `uvicorn[standard]`, `python-multipart`.
- `.gitignore` — ignore `frontend/node_modules`, `frontend/dist`, and the
  contents of `data/` while keeping the folder itself.
