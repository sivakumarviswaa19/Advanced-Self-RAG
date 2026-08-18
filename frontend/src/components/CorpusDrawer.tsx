import { useRef, useState } from "react";
import type { DocumentMeta } from "../types";
import { Alert, Close, Doc, Trash, Tray } from "./Icons";

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CorpusDrawer({
  open,
  documents,
  busy,
  error,
  onClose,
  onUpload,
  onDelete,
}: {
  open: boolean;
  documents: DocumentMeta[];
  busy: boolean;
  error: string | null;
  onClose(): void;
  onUpload(files: File[]): void;
  onDelete(filename: string): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const total = documents.reduce((n, d) => n + d.size_bytes, 0);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-ink/45 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-label="Corpus"
        aria-hidden={!open}
        /* Off-screen but still in the DOM: without `inert` every button in
           here stays keyboard-reachable, producing tab stops on an invisible
           panel (and aria-hidden with focusable children is invalid ARIA). */
        inert={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[26rem] flex-col border-l border-rule bg-paper transition-transform duration-400 ease-[var(--ease-out-expo)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between border-b border-rule px-6 py-5">
          <div>
            <p className="tag text-signal-text">Corpus</p>
            <h2 className="mt-1.5 font-display text-xl leading-none text-ink">
              {documents.length} {documents.length === 1 ? "document" : "documents"}
            </h2>
            <p className="tag mt-1.5 text-muted tabular-nums">{size(total)} indexed</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close corpus panel"
            className="-mr-2 -mt-1 inline-flex size-11 items-center justify-center text-muted transition-colors hover:text-ink"
          >
            <Close className="size-4" />
          </button>
        </header>

        <div className="px-6 py-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const files = Array.from(e.dataTransfer.files).filter((f) =>
                f.name.toLowerCase().endsWith(".pdf"),
              );
              if (files.length) onUpload(files);
            }}
            className={`relative border border-dashed px-5 py-7 text-center transition-colors duration-200 ${
              over ? "border-signal bg-signal-wash" : "border-rule-strong bg-paper-2"
            }`}
          >
            <Tray
              className={`mx-auto size-6 transition-colors ${over ? "text-signal-text" : "text-muted"}`}
            />
            <p className="mt-3 text-sm text-ink">
              Drop PDFs here, or{" "}
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="font-medium text-signal-text underline decoration-1 underline-offset-[3px] transition-colors hover:text-ink"
              >
                browse your files
              </button>
              .
            </p>
            <p className="tag mt-2 text-muted">PDF only · 40 MB each</p>

            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="sr-only"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) onUpload(files);
                e.target.value = "";
              }}
            />

            {busy && (
              <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-rule">
                <span
                  className="block h-full w-1/3 bg-signal"
                  style={{ animation: "sweep 1.05s linear infinite" }}
                />
              </div>
            )}
          </div>

          {busy && (
            <p className="tag mt-3 text-signal-text">Uploading and re-indexing…</p>
          )}

          {error && (
            <div className="mt-3 flex gap-2.5 border-l-2 border-signal bg-signal-wash px-3 py-2.5">
              <Alert className="mt-px size-4 shrink-0 text-signal-text" />
              <p className="text-sm text-ink">{error}</p>
            </div>
          )}
        </div>

        <div className="scroll-slim flex-1 overflow-y-auto border-t border-rule">
          {documents.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted">
              Nothing indexed yet. The retriever has nothing to search until you add a
              document.
            </p>
          ) : (
            <ul>
              {documents.map((d) => (
                <li
                  key={d.filename}
                  className="group flex items-center gap-3 border-b border-rule-soft px-6 py-3.5 transition-colors hover:bg-paper-2"
                >
                  <Doc className="size-4 shrink-0 text-muted transition-colors group-hover:text-signal-text" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm leading-snug text-ink">{d.name}</p>
                    <p className="tag mt-0.5 text-muted tabular-nums">
                      {size(d.size_bytes)}
                    </p>
                  </div>

                  {confirming === d.filename ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(d.filename);
                          setConfirming(null);
                        }}
                        className="tag bg-signal px-2 py-1 text-ink transition-colors hover:bg-ink hover:text-paper"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="tag text-muted transition-colors hover:text-ink"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(d.filename)}
                      aria-label={`Remove ${d.name} from the corpus`}
                      className="inline-flex size-11 shrink-0 items-center justify-center text-muted transition-all duration-150 hover:text-signal-text focus-visible:opacity-100 md:size-8 md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Trash className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-rule px-6 py-4">
          <p className="text-sm leading-relaxed text-muted">
            Documents are parsed once and cached. Adding or removing one re-indexes the
            corpus on the next question.
          </p>
        </footer>
      </aside>
    </>
  );
}
