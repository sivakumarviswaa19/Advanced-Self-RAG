import { Tray } from "./Icons";

/* Specimen questions drawn from what's actually in the corpus, so a first
   run returns something real instead of an apology. */
const SPECIMENS = [
  "What are the multithreading models?",
  "How do ordinary pipes differ from named pipes?",
  "Compare SJF and round-robin on average waiting time.",
  "What happens to a child process when its parent exits first?",
];

export function Opening({
  onPick,
  onAddDocuments,
  corpusCount,
}: {
  onPick(q: string): void;
  onAddDocuments(): void;
  corpusCount: number;
}) {
  const empty = corpusCount === 0;

  return (
    <div className="animate-rise mx-auto max-w-[74ch] px-6 pb-12 pt-[8vh] md:px-10">
      <p className="tag text-signal-text">Self-correcting retrieval</p>

      <h1 className="mt-4 font-display text-3xl leading-[1.02] tracking-[-0.015em] text-ink">
        Ask the corpus.
        <br />
        <em className="italic text-muted">It argues with itself first.</em>
      </h1>

      <p className="mt-6 max-w-[54ch] text-base leading-relaxed text-muted">
        Every question is rewritten for retrieval, answered from your documents, then
        graded one to ten on whether the evidence was actually sufficient. Score under
        five and the graph rewrites the question and tries again — up to three passes.
        You see all of it.
      </p>

      {empty ? (
        <div className="mt-9 border border-dashed border-rule bg-paper-2 px-6 py-8">
          <p className="tag text-muted">Corpus empty</p>
          <p className="mt-2 max-w-[46ch] text-base text-ink">
            There are no documents to retrieve from yet. Add a few PDFs and the
            pipeline has something to work with.
          </p>
          <button
            type="button"
            onClick={onAddDocuments}
            className="group mt-5 inline-flex items-center gap-2.5 bg-ink px-5 py-2.5 text-paper transition-colors duration-200 hover:bg-signal hover:text-ink"
          >
            <Tray className="size-4" />
            <span className="tag">Add documents</span>
          </button>
        </div>
      ) : (
        <div className="mt-10">
          <div className="flex items-center gap-3">
            <p className="tag text-muted">Try one</p>
            <span className="rule-h h-px flex-1" />
          </div>

          <ul className="mt-1">
            {SPECIMENS.map((q, i) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => onPick(q)}
                  className="group flex w-full items-baseline gap-4 border-b border-rule-soft py-3.5 text-left transition-colors duration-200 hover:border-ink"
                >
                  <span
                    aria-hidden="true"
                    className="tag tabular-nums text-muted transition-colors group-hover:text-signal-text"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="relative text-base text-ink">
                    {q}
                    {/* directional underline wipe — no opacity fades here */}
                    <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-signal transition-transform duration-300 ease-[var(--ease-out-expo)] group-hover:scale-x-100" />
                  </span>
                  <span
                    aria-hidden="true"
                    className="ml-auto tag shrink-0 translate-x-[-4px] text-signal-text opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
                  >
                    Ask →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
