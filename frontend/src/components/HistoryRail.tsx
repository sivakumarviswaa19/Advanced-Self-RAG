import { useEffect, useRef, useState } from "react";
import type { Session } from "../types";
import { groupByRecency } from "../lib/sessions";
import { useMediaQuery } from "../lib/useMediaQuery";
import { Close, Doc, Pencil, Plus, Trash } from "./Icons";

function Wordmark() {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="font-display text-xl leading-none text-paper">Cortex</span>
      <span className="h-3 w-px bg-ink-4" />
      <span className="tag text-muted-ink">Self-RAG</span>
    </div>
  );
}

function ThreadRow({
  session,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  session: Session;
  active: boolean;
  onSelect(): void;
  onRename(title: string): void;
  onDelete(): void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    onRename(draft);
    setEditing(false);
  };

  const turns = session.messages.filter((m) => m.role === "user").length;

  if (editing) {
    return (
      <li className="px-2">
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(session.title);
              setEditing(false);
            }
          }}
          aria-label="Thread name"
          className="w-full border border-signal bg-ink-3 px-2.5 py-2 text-sm text-paper focus:outline-none"
        />
      </li>
    );
  }

  return (
    <li className="group relative px-2">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={`w-full border-l-2 py-2 pl-3 pr-24 text-left transition-colors duration-200 md:pr-16 ${
          active
            ? "border-signal bg-ink-3 text-paper"
            : "border-transparent text-muted-ink hover:border-ink-4 hover:bg-ink-2 hover:text-paper"
        }`}
      >
        <span className="block truncate text-sm leading-snug">{session.title}</span>
        <span className="tag mt-1 block text-muted-ink tabular-nums">
          {turns === 0 ? "empty" : `${turns} ${turns === 1 ? "question" : "questions"}`}
        </span>
      </button>

      {/* Row actions reveal on hover, and stay reachable by keyboard. */}
      {/* Hover-reveal has no touch equivalent, so these stay visible below md
          and only fade in on hover where a pointer actually exists. */}
      <div className="absolute right-2 top-1 flex gap-0.5 transition-opacity duration-150 focus-within:opacity-100 md:right-3 md:top-2 md:opacity-0 md:group-hover:opacity-100">
        <button
          type="button"
          onClick={() => {
            setDraft(session.title);
            setEditing(true);
          }}
          aria-label={`Rename “${session.title}”`}
          className="inline-flex size-11 items-center justify-center text-muted-ink transition-colors hover:text-paper md:size-7"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete “${session.title}”`}
          className="inline-flex size-11 items-center justify-center text-muted-ink transition-colors hover:text-signal md:size-7"
        >
          <Trash className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

export function HistoryRail({
  sessions,
  activeId,
  corpusCount,
  open,
  onClose,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onOpenCorpus,
}: {
  sessions: Session[];
  activeId: string;
  corpusCount: number;
  open: boolean;
  onClose(): void;
  onSelect(id: string): void;
  onCreate(): void;
  onRename(id: string, title: string): void;
  onDelete(id: string): void;
  onOpenCorpus(): void;
}) {
  const groups = groupByRecency(sessions);

  // On desktop the rail is a permanent column; below md it slides off-canvas.
  // Only the off-canvas, closed state should be inert.
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const offCanvas = !open && !isDesktop;

  return (
    <>
      {/* Scrim, small screens only */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-ink/55 transition-opacity duration-300 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <nav
        aria-label="Chat history"
        inert={offCanvas}
        className={`fixed inset-y-0 left-0 z-40 flex w-[17.5rem] flex-col bg-ink transition-transform duration-300 ease-[var(--ease-out-expo)] md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <Wordmark />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="-mr-2 inline-flex size-11 items-center justify-center text-muted-ink hover:text-paper md:hidden"
          >
            <Close className="size-4" />
          </button>
        </div>

        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={onCreate}
            className="group flex w-full items-center gap-2.5 border border-ink-5 px-3 py-2.5 text-paper transition-colors duration-200 hover:border-signal hover:bg-signal hover:text-ink"
          >
            <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" />
            <span className="tag">New thread</span>
          </button>
        </div>

        <div className="scroll-slim-ink flex-1 overflow-y-auto pb-4">
          {groups.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-ink">No threads yet.</p>
          ) : (
            groups.map((group) => (
              <section key={group.label} className="mb-3">
                <h3 className="tag px-5 pb-1.5 pt-3 text-muted-ink">{group.label}</h3>
                <ul>
                  {group.items.map((s) => (
                    <ThreadRow
                      key={s.id}
                      session={s}
                      active={s.id === activeId}
                      onSelect={() => onSelect(s.id)}
                      onRename={(t) => onRename(s.id, t)}
                      onDelete={() => onDelete(s.id)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="border-t border-ink-4 p-4">
          <button
            type="button"
            onClick={onOpenCorpus}
            className="group flex w-full items-center gap-3 px-1 py-1.5 text-left"
          >
            <Doc className="size-4 shrink-0 text-signal" />
            <span className="min-w-0 flex-1">
              <span className="tag block text-muted-ink">Corpus</span>
              <span className="block truncate text-sm text-paper">
                {corpusCount} {corpusCount === 1 ? "document" : "documents"}
              </span>
            </span>
            <span className="tag shrink-0 text-muted-ink transition-colors group-hover:text-signal">
              Manage
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
