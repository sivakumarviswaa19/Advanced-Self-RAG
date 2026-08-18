import { Children, cloneElement, isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { LiveRun, Message as Msg } from "../types";
import { RetrievalTrace } from "./RetrievalTrace";
import { Alert, Check, Copy } from "./Icons";

/* The formatter prompt cites sources as [1], [2] — and in practice also [1,4]
   and runs like [1][2]. Lift those marks out of the prose so provenance is
   scannable without breaking the reading line.
   Two patterns on purpose: the global one is for String.split, and a separate
   non-global one for testing. Calling .test() on a /g regex advances lastIndex
   between calls, which makes it return false on every other match. */
const CITE_SPLIT = /(\[\d+(?:\s*,\s*\d+)*\](?:\s*\[\d+(?:\s*,\s*\d+)*\])*)/g;
const CITE_TEST = /^\[\d+(?:\s*,\s*\d+)*\]/;

function highlight(node: ReactNode): ReactNode {
  if (typeof node === "string") {
    if (!node.includes("[")) return node;
    const parts = node.split(CITE_SPLIT);
    if (parts.length === 1) return node;
    return parts.map((part, i) =>
      CITE_TEST.test(part) ? (
        <span className="cite" key={i}>
          {part}
        </span>
      ) : (
        part
      ),
    );
  }
  if (Array.isArray(node)) return Children.map(node, highlight);
  if (isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: ReactNode }>;
    if (el.props?.children) {
      return cloneElement(el, undefined, highlight(el.props.children));
    }
  }
  return node;
}

const withCitations =
  (Tag: "p" | "li" | "td") =>
  ({ children, ...rest }: { children?: ReactNode }) => <Tag {...rest}>{highlight(children)}</Tag>;

const MD_COMPONENTS = {
  p: withCitations("p"),
  li: withCitations("li"),
  td: withCitations("td"),
};

/** What each slow stage is actually doing, in the user's language. */
const STATUS: Record<string, string> = {
  loader: "Reading the corpus…",
  re_writer: "Rewriting the question for retrieval…",
  splitter: "Splitting documents into chunks…",
  retriever: "Searching by meaning and by keyword…",
  context_enrich: "Adding context so chunks stand alone…",
  re_rank: "Scoring each chunk against the question…",
  evaluator: "Grading whether this is enough to answer…",
  general_responder: "Answering without the corpus…",
  formatter: "Writing the answer from the sources…",
};

function timestamp(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ── Question ───────────────────────────────────────────────────────── */

function Question({ message }: { message: Msg }) {
  return (
    <article className="animate-rise">
      <div className="flex items-baseline gap-3">
        <span className="tag text-signal-text">Asked</span>
        <span className="tag text-muted tabular-nums">
          {timestamp(message.createdAt)}
        </span>
      </div>
      <h2 className="mt-2 font-display text-2xl leading-[1.12] tracking-[-0.01em] text-ink text-balance">
        {message.text}
      </h2>
    </article>
  );
}

/* ── Answer ─────────────────────────────────────────────────────────── */

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        });
      }}
      className="inline-flex items-center gap-1.5 tag text-muted transition-colors hover:text-signal-text"
    >
      {done ? <Check className="size-3 text-pine" /> : <Copy className="size-3" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Answer({ message, live }: { message: Msg; live?: LiveRun }) {
  const streaming = Boolean(live);

  return (
    <article
      className="animate-rise mt-7"
      /* The answer streams in after a long, silent wait; announce it politely
         so a screen-reader user isn't left guessing whether it arrived. */
      aria-live="polite"
      aria-busy={streaming}
    >
      <div className="flex items-baseline gap-3">
        <span className="tag text-muted">Cortex</span>
        {!streaming && message.text && (
          <div className="ml-auto">
            <CopyButton text={message.text} />
          </div>
        )}
      </div>

      {message.error ? (
        <div className="mt-3 flex gap-3 border-l-2 border-signal bg-signal-wash px-4 py-3">
          <Alert className="mt-0.5 size-4 shrink-0 text-signal-text" />
          <div>
            <p className="tag text-signal-text">Run failed</p>
            <p className="mt-1 text-sm text-ink">{message.error}</p>
          </div>
        </div>
      ) : message.text ? (
        <div className="prose-answer mt-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
            {message.text}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="mt-3 font-mono text-sm text-muted">
          {STATUS[live?.current ?? ""] ?? "Working the corpus…"}
          <span
            className="ml-0.5 inline-block w-[7px] bg-signal align-baseline"
            style={{ height: "0.95em", animation: "caret 1.05s step-end infinite" }}
          />
        </p>
      )}

      {(live || message.trace) && (
        <RetrievalTrace live={live} trace={message.trace} elapsedMs={message.elapsedMs} />
      )}
    </article>
  );
}

export function MessageView({ message, live }: { message: Msg; live?: LiveRun }) {
  return message.role === "user" ? (
    <Question message={message} />
  ) : (
    <Answer message={message} live={live} />
  );
}
