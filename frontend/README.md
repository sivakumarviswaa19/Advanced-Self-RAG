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
uvicorn server:app --reload --port 8077
```

Then the frontend:

```bash
npm --prefix frontend install
```

```bash
npm --prefix frontend run dev
```

Open http://localhost:5173.

> **Why 8077 and not 8000?** Your CortexMail backend already runs on `8000`
> (`CortexMail/.venv/bin/uvicorn main:app --reload --port 8000`), so this API
> uses `8077` to avoid the clash. `frontend/.env.local` points the dev proxy
> there to match.
>
> To use a different port, change it in **both** places — the `uvicorn`
> command and `VITE_API_URL` in `frontend/.env.local` — or delete
> `.env.local` to fall back to the `8000` default once that port is free.

`OPENAI_API_KEY` is read from the project-root `.env`, same as before.

## Running it with Docker

From the project root, with `OPENAI_API_KEY` in `.env`:

```bash
docker compose up --build
```

Open http://localhost:8080. nginx serves the built UI and reverse-proxies
`/api` to the API container, so the browser talks to one origin and CORS never
comes into play — the same arrangement as the Vite dev proxy.

For hot reload against the containerised API instead:

```bash
docker compose --profile dev up
```

That serves Vite on http://localhost:5173.

`./data` is bind-mounted, so uploaded PDFs persist across `compose down` and
stay visible on the host.

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

## Known limits in the agent

### Fixed

- **Citations were meaningless.** `format()` interpolated a list of `Document`
  objects into the prompt, so the model saw each chunk's `repr` — including the
  uuid4 id FAISS assigns — and cited those uuids, or invented `[1]`/`[4]`
  indices that pointed at nothing. Chunks are now numbered and source-labelled
  before the prompt is built, so `[1]`/`[2]` resolve to a real document.
- **Re-ranking was computed and discarded.** `re_ranker` kept the best 5 chunks
  in `scored_chunks`, but `formatter` read `retrieved_data` — the full enriched
  set. The formatter now prefers `scored_chunks`, falling back to
  `retrieved_data` for the direct route where re-ranking never runs.

### Open

1. **The router's topic list is hardcoded.** `agents.py:rag_check` names the
   operating-systems syllabus explicitly in its prompt, so a question about any
   other subject returns `NO_RAG` — the question is answered from the model's
   own knowledge and your uploaded document is never searched. It is also
   unstable at the boundary: the same off-syllabus question can take the RAG
   path one time and the direct path the next. **This is the main thing limiting
   the upload feature.** Deriving the topic list from the corpus, or dropping
   the allowlist and always retrieving, would fix it.
2. **The index is rebuilt every query.** `agents.py:retrieve` constructs the
   FAISS index and BM25 retriever on each call, and `re_rank` makes one LLM call
   per chunk. That is most of the 60–90s per question. Caching the index per
   corpus fingerprint is the biggest single win available.
3. **The evaluator and the formatter now judge different sets.** `evaluator`
   grades `retrieved_data` (all ~17 chunks) while `formatter` answers from the
   re-ranked top 5. So a "sufficient" grade can be earned by evidence that
   didn't make the cut. Pointing the evaluator at `scored_chunks` too would make
   the loop grade exactly what it answers from — at the cost of probably
   retrying more often, since 5 chunks is a stricter bar.

## Changes made outside `frontend/`

- `server.py` — new; the HTTP/SSE bridge.
- `agents.py` — `load_documents()` now scans `data/*.pdf` instead of a fixed
  list of five filenames, so uploads join the corpus; `format()` numbers and
  labels the chunks so citations resolve to real documents.
- `nodes.py` — `loader()` reuses pre-supplied docs when the caller provides them
  (lets the server cache the parsed corpus); `formatter()` now reads the
  re-ranked `scored_chunks` instead of the full `retrieved_data`.
- `requirements.txt` — added `fastapi`, `uvicorn[standard]`, `python-multipart`.
- `.gitignore` — ignore `frontend/node_modules`, `frontend/dist`, and the
  contents of `data/` while keeping the folder itself.
