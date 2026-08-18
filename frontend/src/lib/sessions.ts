import { useCallback, useEffect, useRef, useState } from "react";
import type { Message, Session } from "../types";

const KEY = "cortex.sessions.v1";
const ACTIVE_KEY = "cortex.active.v1";

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** First line of the opening question, trimmed to a scannable length. */
export function deriveTitle(text: string): string {
  const line = text.trim().split("\n")[0].replace(/\s+/g, " ");
  if (line.length <= 52) return line || "Untitled thread";
  return `${line.slice(0, 51).trimEnd()}…`;
}

export function newSession(): Session {
  const now = Date.now();
  return { id: uid(), title: "New thread", createdAt: now, updatedAt: now, messages: [] };
}

function read(): Session[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Session[]) : [];
  } catch {
    return [];
  }
}

/**
 * Threads live in localStorage. The graph itself is stateless — each run gets
 * only the current question — so history here is a record of what was asked
 * and what came back, not a context window being replayed.
 */
export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>(() => {
    const stored = read();
    return stored.length ? stored : [newSession()];
  });

  const [activeId, setActiveId] = useState<string>(() => {
    const stored = read();
    const saved = localStorage.getItem(ACTIVE_KEY);
    if (saved && stored.some((s) => s.id === saved)) return saved;
    return stored[0]?.id ?? "";
  });

  // Guard against the very first render writing an empty list over real data.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      if (!activeId && sessions[0]) setActiveId(sessions[0].id);
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(sessions));
    } catch {
      /* quota exceeded — the in-memory list still works for this session */
    }
  }, [sessions, activeId]);

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];

  const patch = useCallback((id: string, fn: (s: Session) => Session) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? fn(s) : s)));
  }, []);

  const appendMessage = useCallback(
    (id: string, message: Message) => {
      patch(id, (s) => ({
        ...s,
        updatedAt: Date.now(),
        title:
          s.messages.length === 0 && message.role === "user"
            ? deriveTitle(message.text)
            : s.title,
        messages: [...s.messages, message],
      }));
    },
    [patch],
  );

  const updateMessage = useCallback(
    (id: string, messageId: string, fields: Partial<Message>) => {
      patch(id, (s) => ({
        ...s,
        updatedAt: Date.now(),
        messages: s.messages.map((m) =>
          m.id === messageId ? { ...m, ...fields } : m,
        ),
      }));
    },
    [patch],
  );

  const createSession = useCallback(() => {
    const s = newSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    return s;
  }, []);

  const removeSession = useCallback((id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      const list = next.length ? next : [newSession()];
      setActiveId((current) =>
        current === id ? list[0].id : list.some((s) => s.id === current) ? current : list[0].id,
      );
      return list;
    });
  }, []);

  const renameSession = useCallback(
    (id: string, title: string) =>
      patch(id, (s) => ({ ...s, title: title.trim() || "Untitled thread" })),
    [patch],
  );

  return {
    sessions,
    active,
    activeId: active?.id ?? "",
    setActiveId,
    createSession,
    removeSession,
    renameSession,
    appendMessage,
    updateMessage,
  };
}

/** Bucket threads under editorial date headings for the history rail. */
export function groupByRecency(sessions: Session[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 6 * 86_400_000;

  const buckets: { label: string; items: Session[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier this week", items: [] },
    { label: "Older", items: [] },
  ];

  for (const s of [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (s.updatedAt >= startOfToday) buckets[0].items.push(s);
    else if (s.updatedAt >= startOfYesterday) buckets[1].items.push(s);
    else if (s.updatedAt >= startOfWeek) buckets[2].items.push(s);
    else buckets[3].items.push(s);
  }

  return buckets.filter((b) => b.items.length > 0);
}
