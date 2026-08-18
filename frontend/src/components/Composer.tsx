import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Close } from "./Icons";

const MAX = 4000;

export function Composer({
  onSubmit,
  onStop,
  busy,
  disabled,
  corpusCount,
}: {
  onSubmit(query: string): void;
  onStop(): void;
  busy: boolean;
  disabled: boolean;
  corpusCount: number;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the question, up to a ceiling, then scroll.
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 224)}px`;
  }, []);

  useLayoutEffect(fit, [value, fit]);

  // A height measured before layout settles is wrong and never corrects itself,
  // because `value` hasn't changed. Re-fit whenever the field's WIDTH changes —
  // that covers first paint, the webfont swap, and the user resizing the window.
  // Width-only, so growing the field can't retrigger the observer.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastWidth = -1;
    const ro = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width !== lastWidth) {
        lastWidth = width;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    document.fonts?.ready.then(fit).catch(() => {});
  }, [fit]);

  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy]);

  const send = () => {
    const q = value.trim();
    if (!q || busy) return;
    onSubmit(q);
    setValue("");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const over = value.length > MAX;

  return (
    <div className="border-t border-rule bg-paper/92 backdrop-blur-sm">
      <form onSubmit={submit} className="mx-auto max-w-[74ch] px-6 py-4 md:px-10">
        <div className="group relative border border-rule-strong bg-paper-2 transition-colors duration-200 focus-within:border-ink">
          {/* heat rule that wipes in on focus — the one signature flourish here */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 bg-signal transition-transform duration-300 ease-[var(--ease-out-expo)] group-focus-within:scale-x-100" />

          <label htmlFor="composer" className="sr-only">
            Ask a question of your corpus
          </label>
          <textarea
            id="composer"
            ref={ref}
            rows={1}
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={keys}
            placeholder={
              corpusCount === 0
                ? "Add a PDF to the corpus first, then ask it something."
                : "Ask the corpus a question…"
            }
            className="scroll-slim block w-full resize-none bg-transparent px-4 py-3.5 pr-14 text-base leading-relaxed text-ink placeholder:text-muted/75 focus:outline-none disabled:cursor-not-allowed"
          />

          <div className="absolute bottom-2.5 right-2.5">
            {busy ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop this run"
                className="inline-flex size-9 items-center justify-center border border-ink bg-paper text-ink transition-colors hover:bg-ink hover:text-paper"
              >
                <Close className="size-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!value.trim() || over || disabled}
                aria-label="Send question"
                className="inline-flex size-9 items-center justify-center bg-ink text-paper transition-all duration-200 enabled:hover:bg-signal enabled:hover:text-ink disabled:cursor-not-allowed disabled:bg-rule-strong disabled:text-paper"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-3 px-0.5">
          <p className="tag hidden text-muted sm:block">
            <kbd className="font-mono">Enter</kbd> to ask ·{" "}
            <kbd className="font-mono">Shift</kbd>+<kbd className="font-mono">Enter</kbd> for a
            new line
          </p>
          {over && (
            <p className="tag text-signal-text ml-auto tabular-nums">
              {value.length} / {MAX} — too long
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
