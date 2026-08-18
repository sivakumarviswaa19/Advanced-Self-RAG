import { useCallback, useEffect, useRef, useState } from "react";
import { deleteDocument, listDocuments, streamChat, uploadDocuments } from "./lib/api";
import { uid, useSessions } from "./lib/sessions";
import type { DocumentMeta, LiveRun, StageId } from "./types";
import { Composer } from "./components/Composer";
import { CorpusDrawer } from "./components/CorpusDrawer";
import { HistoryRail } from "./components/HistoryRail";
import { MessageView } from "./components/Message";
import { Opening } from "./components/Opening";
import { Panel, Tray } from "./components/Icons";

export default function App() {
  const {
    sessions,
    active,
    activeId,
    setActiveId,
    createSession,
    removeSession,
    renameSession,
    appendMessage,
    updateMessage,
  } = useSessions();

  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [corpusOpen, setCorpusOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [live, setLive] = useState<LiveRun | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  /* ── Corpus ──────────────────────────────────────────────────────── */

  const refreshDocuments = useCallback(async () => {
    try {
      setDocuments(await listDocuments());
    } catch {
      /* server not up yet — the composer surfaces this on first send */
    }
  }, []);

  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  const handleUpload = useCallback(
    async (files: File[]) => {
      setUploading(true);
      setUploadError(null);
      try {
        await uploadDocuments(files);
        await refreshDocuments();
      } catch (err) {
        setUploadError((err as Error).message || "That upload didn't go through.");
      } finally {
        setUploading(false);
      }
    },
    [refreshDocuments],
  );

  const handleDelete = useCallback(
    async (filename: string) => {
      try {
        await deleteDocument(filename);
        await refreshDocuments();
      } catch (err) {
        setUploadError((err as Error).message || "Couldn't remove that document.");
      }
    },
    [refreshDocuments],
  );

  /* Drag a PDF anywhere onto the window and the drop target is the whole app. */
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        f.name.toLowerCase().endsWith(".pdf"),
      );
      if (files.length) {
        setCorpusOpen(true);
        void handleUpload(files);
      } else {
        setCorpusOpen(true);
        setUploadError("This corpus accepts PDFs only.");
      }
    };

    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [handleUpload]);

  /* ── Ask ─────────────────────────────────────────────────────────── */

  const busy = streamingId !== null;

  const ask = useCallback(
    async (query: string) => {
      if (busy || !active) return;
      const sid = active.id;
      const startedAt = Date.now();

      appendMessage(sid, { id: uid(), role: "user", text: query, createdAt: startedAt });

      const answerId = uid();
      appendMessage(sid, {
        id: answerId,
        role: "assistant",
        text: "",
        createdAt: Date.now(),
      });

      setStreamingId(answerId);
      setLive({
        reached: [],
        current: null,
        rewrites: [],
        verdicts: [],
        sources: [],
        chunks: 0,
        startedAt,
      });

      const controller = new AbortController();
      abort.current = controller;

      await streamChat(
        query,
        {
          onStage: (node: StageId) =>
            setLive((p) =>
              p
                ? {
                    ...p,
                    current: node,
                    reached: p.reached.includes(node) ? p.reached : [...p.reached, node],
                  }
                : p,
            ),
          onRewrite: (q, attempt) =>
            setLive((p) => (p ? { ...p, rewrites: [...p.rewrites, { query: q, attempt }] } : p)),
          onRetrieved: (count) => setLive((p) => (p ? { ...p, chunks: count } : p)),
          onSources: (sources) => setLive((p) => (p ? { ...p, sources } : p)),
          onVerdict: (v) => setLive((p) => (p ? { ...p, verdicts: [...p.verdicts, v] } : p)),
          onAnswer: (text) => updateMessage(sid, answerId, { text }),
          onDone: (s) =>
            updateMessage(sid, answerId, {
              elapsedMs: Date.now() - startedAt,
              trace: {
                route: s.route,
                rewrites: s.rewrites,
                verdicts: s.verdicts,
                sources: s.sources,
                chunksRetrieved: s.chunks_retrieved,
                attempts: s.attempts,
              },
            }),
          onError: (message) =>
            updateMessage(sid, answerId, { error: message, elapsedMs: Date.now() - startedAt }),
        },
        controller.signal,
      );

      setStreamingId(null);
      setLive(null);
      abort.current = null;
    },
    [active, busy, appendMessage, updateMessage],
  );

  const stop = useCallback(() => {
    abort.current?.abort();
    if (streamingId && active) {
      updateMessage(active.id, streamingId, { error: "Stopped before the answer arrived." });
    }
    setStreamingId(null);
    setLive(null);
  }, [active, streamingId, updateMessage]);

  /* Keep the newest turn in view as the run progresses — but leave the
     opening screen alone, which has nothing to follow. */
  const turnCount = active?.messages.length ?? 0;
  useEffect(() => {
    const el = scroller.current;
    if (!el || turnCount === 0) return;
    el.scrollTo({ top: el.scrollHeight, behavior: live ? "auto" : "smooth" });
  }, [turnCount, live?.current, live]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCorpusOpen(false);
        setRailOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const messages = active?.messages ?? [];

  return (
    <div className="flex h-full bg-ink">
      <HistoryRail
        sessions={sessions}
        activeId={activeId}
        corpusCount={documents.length}
        open={railOpen}
        onClose={() => setRailOpen(false)}
        onSelect={(id) => {
          setActiveId(id);
          setRailOpen(false);
        }}
        onCreate={() => {
          createSession();
          setRailOpen(false);
        }}
        onRename={renameSession}
        onDelete={removeSession}
        onOpenCorpus={() => setCorpusOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-paper md:border-l md:border-ink">
        {/* ── Top bar ─────────────────────────────────────────────── */}
        <header className="flex items-center gap-3 border-b border-rule px-4 py-3 md:px-10">
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label="Open chat history"
            className="-ml-2 inline-flex size-11 items-center justify-center text-muted transition-colors hover:text-ink md:hidden"
          >
            <Panel className="size-4" />
          </button>

          {/* Label · hairline · name — the same device as the rail wordmark,
              so the header belongs to the system instead of reading as a
              generic app bar. */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="tag hidden shrink-0 text-muted sm:inline">Thread</span>
            <span className="hidden h-3 w-px shrink-0 bg-rule sm:block" />
            <h1 className="truncate text-sm text-ink">{active?.title ?? "New thread"}</h1>
          </div>

          <button
            type="button"
            onClick={() => setCorpusOpen(true)}
            className="group relative inline-flex shrink-0 items-center gap-2 py-1"
          >
            <Tray className="size-3.5 text-signal-text" />
            <span className="tag text-muted transition-colors group-hover:text-ink">Corpus</span>
            <span className="tag text-ink tabular-nums">{documents.length}</span>
            <span className="absolute bottom-0 left-0 h-px w-full origin-left scale-x-0 bg-signal transition-transform duration-300 ease-[var(--ease-out-expo)] group-hover:scale-x-100" />
          </button>
        </header>

        {/* ── Conversation ────────────────────────────────────────── */}
        <div ref={scroller} className="scroll-slim flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <Opening
              corpusCount={documents.length}
              onPick={(q) => void ask(q)}
              onAddDocuments={() => setCorpusOpen(true)}
            />
          ) : (
            <div className="mx-auto max-w-[74ch] px-6 pb-14 pt-8 md:px-10">
              {messages.map((m, i) => (
                <div
                  key={m.id}
                  className={
                    i > 0 && m.role === "user"
                      ? "mt-12 border-t border-rule-soft pt-10"
                      : undefined
                  }
                >
                  <MessageView
                    message={m}
                    live={m.id === streamingId && live ? live : undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <Composer
          onSubmit={(q) => void ask(q)}
          onStop={stop}
          busy={busy}
          disabled={false}
          corpusCount={documents.length}
        />
      </div>

      <CorpusDrawer
        open={corpusOpen}
        documents={documents}
        busy={uploading}
        error={uploadError}
        onClose={() => {
          setCorpusOpen(false);
          setUploadError(null);
        }}
        onUpload={(files) => void handleUpload(files)}
        onDelete={(f) => void handleDelete(f)}
      />

      {/* ── Whole-window drop state ─────────────────────────────────── */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-paper/85 backdrop-blur-[2px]">
          <div className="border-2 border-dashed border-signal bg-paper px-14 py-11 text-center">
            <Tray className="mx-auto size-8 text-signal" />
            <p className="mt-4 font-display text-xl leading-none text-ink">
              Drop to add to the corpus
            </p>
            <p className="tag mt-2.5 text-muted">PDF only</p>
          </div>
        </div>
      )}
    </div>
  );
}
