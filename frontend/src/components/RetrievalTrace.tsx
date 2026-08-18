import { useEffect, useState } from "react";
import type { LiveRun, StageId, Trace } from "../types";
import { Chevron, Doc, Loop } from "./Icons";

/* ── The pipeline, as workflow.py actually wires it ─────────────────── */

type Stage = { id: StageId; short: string; full: string };

const RAG_PIPELINE: Stage[] = [
  { id: "loader", short: "Load", full: "Corpus loaded" },
  { id: "re_writer", short: "Rewrite", full: "Query rewritten for retrieval" },
  { id: "splitter", short: "Chunk", full: "Split into overlapping chunks" },
  { id: "retriever", short: "Retrieve", full: "Hybrid dense + BM25 retrieval" },
  { id: "context_enrich", short: "Enrich", full: "Chunks contextualised" },
  { id: "re_rank", short: "Re-rank", full: "Scored and cut to top 5" },
  { id: "evaluator", short: "Grade", full: "Sufficiency graded 1–10" },
  { id: "formatter", short: "Compose", full: "Answer written from sources" },
];

const DIRECT_PIPELINE: Stage[] = [
  { id: "loader", short: "Load", full: "Corpus loaded" },
  { id: "general_responder", short: "Answer", full: "Answered without retrieval" },
  { id: "formatter", short: "Compose", full: "Answer composed" },
];

const LOOP_FROM = RAG_PIPELINE.findIndex((s) => s.id === "re_writer");
const LOOP_TO = RAG_PIPELINE.findIndex((s) => s.id === "evaluator");

/* ── Score meter ────────────────────────────────────────────────────── */

/** Ten segments, filled to the grade. Pine when it cleared the bar
 *  first try, amber when the graph had to loop to get there. */
function ScoreMeter({ score, retried }: { score: number; retried: boolean }) {
  const tone = score >= 5 ? (retried ? "bg-amber" : "bg-pine") : "bg-signal";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex items-end gap-[2px]" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={`w-[3px] transition-all duration-300 ${
              i < score ? `${tone} h-[13px]` : "bg-rule h-[7px]"
            }`}
            style={{ transitionDelay: `${i * 26}ms` }}
          />
        ))}
      </span>
      <span className="tag text-ink tabular-nums">
        {score}<span className="text-muted">/10</span>
      </span>
    </span>
  );
}

/* ── Live elapsed clock ─────────────────────────────────────────────── */

function useElapsed(since: number | null) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (since === null) return;
    setMs(Date.now() - since);
    const t = setInterval(() => setMs(Date.now() - since), 100);
    return () => clearInterval(t);
  }, [since]);
  return ms;
}

/** The `tag` utility uppercases its content, which turns a seconds unit into
 *  a capital S. Keep the number in the label voice and the unit lowercase. */
function Elapsed({ ms }: { ms: number }) {
  return (
    <span className="tag text-muted tabular-nums">
      {(ms / 1000).toFixed(1)}
      <span className="normal-case">s</span>
    </span>
  );
}

/* ── The strip ──────────────────────────────────────────────────────── */

export function RetrievalTrace({
  live,
  trace,
  elapsedMs,
}: {
  live?: LiveRun;
  trace?: Trace;
  elapsedMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const running = Boolean(live);

  const isDirect = live
    ? live.reached.includes("general_responder")
    : trace?.route === "direct";
  const pipeline = isDirect ? DIRECT_PIPELINE : RAG_PIPELINE;

  const reached = live ? live.reached : pipeline.map((s) => s.id);
  const current = live?.current ?? null;

  const verdicts = live ? live.verdicts : (trace?.verdicts ?? []);
  const rewrites = live ? live.rewrites.map((r) => r.query) : (trace?.rewrites ?? []);
  const sources = live ? live.sources : (trace?.sources ?? []);
  const chunks = live ? live.chunks : (trace?.chunksRetrieved ?? 0);

  const attempts = Math.max(rewrites.length, verdicts.length, running ? 1 : (trace?.attempts ?? 1));
  const looped = attempts > 1;
  const finalScore = verdicts.at(-1)?.score ?? null;

  const liveMs = useElapsed(live ? live.startedAt : null);
  const shown = running ? liveMs : (elapsedMs ?? 0);

  const summary = isDirect
    ? "Answered directly — the router judged this outside the corpus."
    : `${attempts} ${attempts === 1 ? "pass" : "passes"}, ${chunks} chunks retrieved${
        finalScore !== null ? `, graded ${finalScore} of 10` : ""
      }.`;

  return (
    <section
      className="mt-6 border-t border-rule pt-3"
      aria-label="Retrieval trace"
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="tag text-muted">
          {running ? (
            <span className="text-signal-text">Running</span>
          ) : isDirect ? (
            "Direct answer"
          ) : (
            "Retrieval trace"
          )}
        </span>

        <span className="tag text-muted tabular-nums">
          {attempts} {attempts === 1 ? "pass" : "passes"}
        </span>

        {looped && (
          <span className="inline-flex items-center gap-1.5 tag text-amber">
            <Loop className="size-3" />
            Self-corrected
          </span>
        )}

        {finalScore !== null && <ScoreMeter score={finalScore} retried={looped} />}

        <span className="ml-auto">
          <Elapsed ms={shown} />
        </span>

        {!running && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="group inline-flex items-center gap-1.5 tag text-muted transition-colors hover:text-signal-text"
          >
            {open ? "Hide" : "Detail"}
            <Chevron
              className={`size-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      <p className="sr-only">{summary}</p>

      {/* Small screens hide the per-tick labels, so name the live stage here. */}
      {running && current && (
        <p className="tag mt-2 text-signal-text sm:hidden">
          {pipeline.find((s) => s.id === current)?.short ?? current}
        </p>
      )}

      {/* ── The rail ───────────────────────────────────────────────── */}
      <div className="mt-3" aria-hidden="true">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${pipeline.length}, minmax(0,1fr))`,
            // Don't stretch a 3-stage route across the full measure — a short
            // pipeline should read as short, not as a rail with gaps in it.
            maxWidth: pipeline.length <= 4 ? "24rem" : undefined,
          }}
        >
          {pipeline.map((stage) => {
            const done = reached.includes(stage.id);
            const active = current === stage.id;
            return (
              <div key={stage.id} className="flex flex-col items-center gap-1.5">
                <span
                  title={stage.full}
                  className={`h-4 w-[2px] origin-bottom transition-colors duration-300 ${
                    active
                      ? "bg-signal"
                      : done
                        ? "bg-ink"
                        : "bg-rule"
                  }`}
                  style={
                    active
                      ? { animation: "tick-pulse 0.9s ease-in-out infinite" }
                      : undefined
                  }
                />
                <span
                  className={`tag hidden text-center leading-none transition-colors duration-300 sm:block ${
                    active ? "text-signal-text" : done ? "text-ink" : "text-muted/55"
                  }`}
                  style={{ fontSize: "0.6rem", letterSpacing: "0.1em" }}
                >
                  {stage.short}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── The loop-back bracket ────────────────────────────────────
            The graph physically returns from `evaluator` to `re_writer`
            when the grade is under 5. Drawn as a real return path, not a
            badge — the shape is the point. */}
        {looped && !isDirect && (
          <div className="relative h-6">
            <div
              className="absolute top-0"
              style={{
                left: `${((LOOP_FROM + 0.5) / pipeline.length) * 100}%`,
                right: `${100 - ((LOOP_TO + 0.5) / pipeline.length) * 100}%`,
                animation: "wipe-in 0.55s var(--ease-out-expo) both",
              }}
            >
              <div className="h-3 rounded-b-[10px] border-b border-l border-r border-signal" />
              <div className="-mt-[7px] flex justify-center">
                <span className="bg-paper px-1.5 tag text-signal-text whitespace-nowrap">
                  ↺ retried {attempts - 1}×
                </span>
              </div>
              {/* arrowhead on the return leg, pointing back at Rewrite */}
              <span className="absolute -left-[3px] top-[7px] size-0 border-y-[3.5px] border-r-[5px] border-y-transparent border-r-signal" />
            </div>
          </div>
        )}
      </div>

      {/* ── Detail ─────────────────────────────────────────────────── */}
      {open && !running && (
        <div className="animate-rise space-y-4 border-t border-rule-soft pt-4">
          {rewrites.length > 0 && (
            <div>
              <h4 className="tag text-muted mb-2">Query as rewritten</h4>
              <ol className="space-y-2">
                {rewrites.map((q, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="tag text-signal-text pt-[3px] tabular-nums shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="font-mono text-xs leading-relaxed text-ink">{q}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {verdicts.length > 0 && (
            <div>
              <h4 className="tag text-muted mb-2">Evaluator verdicts</h4>
              <ul className="space-y-2">
                {verdicts.map((v, i) => (
                  <li
                    key={i}
                    className={`border-l-2 pl-3 ${
                      v.score >= 5 ? "border-pine" : "border-signal"
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="tag text-ink tabular-nums">
                        Pass {v.iteration} · {v.score}/10
                      </span>
                      <span
                        className={`tag ${v.score >= 5 ? "text-pine" : "text-signal-text"}`}
                      >
                        {v.score >= 5 ? "sufficient" : "insufficient — retried"}
                      </span>
                    </div>
                    {v.reason && (
                      <p className="mt-0.5 text-sm text-muted">{v.reason}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sources.length > 0 && (
            <div>
              <h4 className="tag text-muted mb-2">
                Sources · top {sources.length}
              </h4>
              <ul className="flex flex-wrap gap-2">
                {sources.map((s) => (
                  <li
                    key={s}
                    className="inline-flex items-center gap-1.5 border border-rule bg-paper-2 px-2 py-1 font-mono text-2xs text-ink"
                  >
                    <Doc className="size-3 text-signal-text" />
                    {s.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
