import type { DocumentMeta, StageId, Verdict } from "../types";

/* ── Documents ─────────────────────────────────────────────────────── */

async function unwrap<T>(request: Promise<Response>): Promise<T> {
  const res = await request;
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body — keep the status text */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function listDocuments(): Promise<DocumentMeta[]> {
  return unwrap(fetch("/api/documents"));
}

export function uploadDocuments(files: File[]): Promise<DocumentMeta[]> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return unwrap(fetch("/api/documents", { method: "POST", body: form }));
}

export function deleteDocument(filename: string): Promise<unknown> {
  return unwrap(
    fetch(`/api/documents/${encodeURIComponent(filename)}`, { method: "DELETE" }),
  );
}

/* ── Chat stream ───────────────────────────────────────────────────── */

export interface StreamHandlers {
  onStage?(node: StageId, label: string): void;
  onRewrite?(query: string, attempt: number): void;
  onRetrieved?(count: number): void;
  onSources?(sources: string[]): void;
  onVerdict?(verdict: Verdict): void;
  onAnswer?(text: string): void;
  onDone?(summary: {
    route: "rag" | "direct";
    rewrites: string[];
    verdicts: Verdict[];
    sources: string[];
    chunks_retrieved: number;
    attempts: number;
  }): void;
  onError?(message: string): void;
}

/**
 * POST the query and consume the Server-Sent Event stream.
 *
 * EventSource can't issue a POST, so this parses the SSE framing by hand:
 * frames are separated by a blank line, and each carries `event:` and
 * `data:` lines.
 */
export async function streamChat(
  query: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    handlers.onError?.(
      "Can't reach the retrieval server. Start it with: uvicorn server:app --port 8000",
    );
    return;
  }

  if (!res.ok || !res.body) {
    handlers.onError?.(`The server rejected the request (${res.status}).`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (event: string, raw: string) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    switch (event) {
      case "stage":
        handlers.onStage?.(data.node as StageId, data.label as string);
        break;
      case "rewrite":
        handlers.onRewrite?.(data.query as string, data.attempt as number);
        break;
      case "retrieved":
        handlers.onRetrieved?.(data.count as number);
        break;
      case "sources":
        handlers.onSources?.(data.sources as string[]);
        break;
      case "verdict":
        handlers.onVerdict?.(data as unknown as Verdict);
        break;
      case "answer":
        handlers.onAnswer?.(data.text as string);
        break;
      case "done":
        handlers.onDone?.(data as never);
        break;
      case "error":
        handlers.onError?.(data.message as string);
        break;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let split: number;
      while ((split = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);

        let event = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length) dispatch(event, dataLines.join("\n"));
      }
    }
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") {
      handlers.onError?.("The stream broke before the answer arrived.");
    }
  }
}
