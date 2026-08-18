/** Node ids emitted by workflow.py, in graph order. */
export type StageId =
  | "loader"
  | "general_responder"
  | "re_writer"
  | "splitter"
  | "retriever"
  | "context_enrich"
  | "re_rank"
  | "evaluator"
  | "formatter";

export interface Verdict {
  /** The evaluator's 1-10 sufficiency grade. Below 5 triggers a retry. */
  score: number;
  /** What the evaluator said was missing — this is what the rewriter targets. */
  reason: string;
  iteration: number;
}

export interface Rewrite {
  query: string;
  attempt: number;
}

/** The settled record of one graph run, kept alongside the answer. */
export interface Trace {
  route: "rag" | "direct";
  rewrites: string[];
  verdicts: Verdict[];
  sources: string[];
  chunksRetrieved: number;
  attempts: number;
}

/** What the trace strip renders while the graph is still running. */
export interface LiveRun {
  reached: StageId[];
  current: StageId | null;
  rewrites: Rewrite[];
  verdicts: Verdict[];
  sources: string[];
  chunks: number;
  startedAt: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  trace?: Trace;
  error?: string;
  /** Wall-clock duration of the graph run, in ms. */
  elapsedMs?: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface DocumentMeta {
  name: string;
  filename: string;
  size_bytes: number;
  uploaded_at: string;
}
