import { ArrowUpIcon, MessageCircleQuestionIcon, XIcon } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type SubmitEvent,
} from "react";
import { Button } from "./ui/button.tsx";
import { parseMarkdown, type Inline, type MarkdownBlock } from "../lib/ask-markdown.ts";
import {
  ASK_PROBLEMS,
  askRelay,
  buildPayload,
  CHIP_HEIGHT,
  CHIP_WIDTH,
  chipPosition,
  conversationKey,
  MAX_QUESTION_LENGTH,
  readConversation,
  relayIsUp,
  saveConversation,
  selectedInScope,
  truncated,
  turnId,
  type Relay,
  type Selected,
  type Turn,
} from "../lib/ask.ts";

const SELECTION_SETTLE_MS = 250;
const TURN_QUOTE_LENGTH = 90;
const PANEL_QUOTE_LENGTH = 240;
const TOUCH_POINTER = "(pointer: coarse)";
const FOCUSABLE = "a[href], button:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

const browserRelay: Relay = {
  fetch: (input, init) => window.fetch(input, init),
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
};

const sessionStore = (): Storage => window.sessionStorage;

function InlineText({ parts }: { parts: Inline[] }): ReactNode {
  return parts.map((part) => {
    if (part.kind === "text") return part.text;
    if (part.kind === "code") {
      return (
        <code key={part.key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {part.text}
        </code>
      );
    }
    if (part.kind === "strong") {
      return (
        <strong key={part.key} className="font-semibold">
          <InlineText parts={part.children} />
        </strong>
      );
    }
    if (part.kind === "em") {
      return (
        <em key={part.key}>
          <InlineText parts={part.children} />
        </em>
      );
    }
    return (
      <a
        key={part.key}
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-brand-ink underline decoration-brand/50 underline-offset-2 hover:decoration-brand"
      >
        <InlineText parts={part.children} />
      </a>
    );
  });
}

function MarkdownBlockView({ block }: { block: MarkdownBlock }) {
  if (block.kind === "heading") {
    return (
      <p className="font-semibold">
        <InlineText parts={block.inline} />
      </p>
    );
  }
  if (block.kind === "code") {
    return <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[0.85em]">{block.text}</pre>;
  }
  if (block.kind === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List className={block.ordered ? "list-decimal pl-5" : "list-disc pl-5 marker:text-brand"}>
        {block.items.map((item) => (
          <li key={item.key}>
            <InlineText parts={item.inline} />
          </li>
        ))}
      </List>
    );
  }
  return (
    <p className="whitespace-pre-line">
      <InlineText parts={block.inline} />
    </p>
  );
}

function AskAnswer({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block) => (
        <MarkdownBlockView key={block.key} block={block} />
      ))}
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <li data-ask-turn="user" className="flex max-w-[85%] flex-col items-end gap-1 self-end">
        {turn.quote !== undefined && (
          <blockquote className="max-w-full border-r-2 border-brand pr-2 text-right font-serif text-xs text-muted-foreground italic">
            {truncated(turn.quote, TURN_QUOTE_LENGTH)}
          </blockquote>
        )}
        <p className="rounded-2xl rounded-br-sm bg-brand-soft px-3 py-2 whitespace-pre-line">{turn.text}</p>
      </li>
    );
  }
  if (turn.role === "notice") {
    return (
      <li data-ask-turn="notice" className="text-sm text-muted-foreground italic">
        <output>{turn.text}</output>
      </li>
    );
  }
  return (
    <li
      data-ask-turn="assistant"
      className="max-w-[92%] rounded-2xl rounded-bl-sm bg-muted/60 px-3 py-2 font-[family-name:var(--issue-body,var(--font-serif))] text-[0.97rem] leading-relaxed"
    >
      <AskAnswer markdown={turn.text} />
    </li>
  );
}

function TypingDots() {
  return (
    <li
      data-ask-thinking
      className="flex items-center gap-1 self-start rounded-2xl rounded-bl-sm bg-muted/60 px-3 py-3"
    >
      <span className="sr-only">Thinking…</span>
      {["[animation-delay:0ms]", "[animation-delay:150ms]", "[animation-delay:300ms]"].map((delay) => (
        <span
          key={delay}
          aria-hidden="true"
          className={`size-1.5 rounded-full bg-muted-foreground/70 motion-safe:animate-bounce ${delay}`}
        />
      ))}
    </li>
  );
}

function Face() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-12">
      <rect x="15" y="18" width="5" height="11" rx="2.5" fill="currentColor" />
      <rect x="28" y="18" width="5" height="11" rx="2.5" fill="currentColor" />
    </svg>
  );
}

function useRelayUp(endpoint: string): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    let current = true;
    void relayIsUp(endpoint, browserRelay.fetch).then((isUp) => {
      if (current) setUp(isUp);
    });
    return () => {
      current = false;
    };
  }, [endpoint]);
  return up;
}

type Chip = Selected & { top: number; left: number };

function chipFor(selection: Selection | null): Chip | undefined {
  const selected = selectedInScope(selection);
  if (selected === undefined || selection === null) return undefined;
  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  const whole = range.getBoundingClientRect();
  const position = chipPosition({
    first: rects[0] ?? whole,
    last: rects[rects.length - 1] ?? whole,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    touch: window.matchMedia(TOUCH_POINTER).matches,
  });
  return { ...selected, ...position };
}

function useSelectionChip(ignoreInside: RefObject<HTMLElement | null>): [Chip | undefined, () => void] {
  const [chip, setChip] = useState<Chip | undefined>();
  const read = useEffectEvent(() => {
    const selection = document.getSelection();
    const anchor = selection?.anchorNode;
    const insideAsk = anchor !== null && anchor !== undefined && ignoreInside.current?.contains(anchor) === true;
    setChip(insideAsk ? undefined : chipFor(selection));
  });
  useEffect(() => {
    let settle: number | undefined;
    const onChange = (): void => {
      window.clearTimeout(settle);
      settle = window.setTimeout(read, SELECTION_SETTLE_MS);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      window.clearTimeout(settle);
      document.removeEventListener("selectionchange", onChange);
    };
  }, []);
  return [chip, () => setChip(undefined)];
}

function useFocusTrap(panel: RefObject<HTMLElement | null>, onEscape: () => void): void {
  const escape = useEffectEvent(onEscape);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const inside = panel.current;
      if (inside === null) return;
      if (event.key === "Escape" && !event.isComposing && inside.contains(document.activeElement)) {
        event.preventDefault();
        escape();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...inside.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      const focused = document.activeElement;
      if (event.shiftKey && focused === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [panel]);
}

function useStickToBottom(list: RefObject<HTMLElement | null>, open: boolean): void {
  useEffect(() => {
    const element = list.current;
    if (!open || element === null) return undefined;
    const toBottom = (): void => element.scrollTo({ top: element.scrollHeight });
    toBottom();
    const observer = new MutationObserver(toBottom);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [list, open]);
}

const LAUNCHER =
  "fixed right-[max(--spacing(4),env(safe-area-inset-right))] bottom-[max(--spacing(4),env(safe-area-inset-bottom))] z-40 flex size-12 items-center justify-center rounded-full bg-white text-stone-900 shadow-[0_6px_20px_rgb(0_0_0/0.18),0_1px_3px_rgb(0_0_0/0.12)] ring-1 ring-black/5 transition-transform outline-none hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring active:scale-95 dark:ring-white/15";

const PANEL =
  "fixed inset-x-0 top-auto bottom-0 z-40 m-0 flex h-[min(34rem,85dvh)] max-h-none w-full max-w-none flex-col p-0 overflow-hidden rounded-t-2xl border border-border bg-card pb-[env(safe-area-inset-bottom)] text-card-foreground shadow-2xl sm:inset-x-auto sm:right-[max(--spacing(4),env(safe-area-inset-right))] sm:bottom-[calc(max(--spacing(4),env(safe-area-inset-bottom))+--spacing(15))] sm:h-[min(32.5rem,calc(100dvh-6rem))] sm:w-90 sm:rounded-2xl sm:pb-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4";

export function Ask({ endpoint }: { endpoint: string }) {
  const up = useRelayUp(endpoint);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLOListElement>(null);
  const returnFocus = useRef(false);
  const panelId = useId();
  const titleId = useId();
  const [storageKey] = useState(() => conversationKey(window.location.pathname));
  const [turns, setTurns] = useState<Turn[]>(() => readConversation(sessionStore, storageKey));
  const [open, setOpen] = useState(false);
  const [quoted, setQuoted] = useState<Selected | undefined>();
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [chip, dismissChip] = useSelectionChip(root);

  const close = (): void => {
    returnFocus.current = true;
    setOpen(false);
    setQuoted(undefined);
  };

  useFocusTrap(panel, close);
  useStickToBottom(conversation, open);

  useEffect(() => saveConversation(sessionStore, storageKey, turns), [storageKey, turns]);

  useEffect(() => {
    if (open) {
      input.current?.focus({ preventScroll: true });
    } else if (returnFocus.current) {
      returnFocus.current = false;
      launcher.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const askAboutSelection = (): void => {
    if (chip !== undefined) setQuoted({ quote: chip.quote, story: chip.story });
    dismissChip();
    document.getSelection()?.removeAllRanges();
    setOpen(true);
    input.current?.focus({ preventScroll: true });
  };

  const removeQuote = (): void => {
    setQuoted(undefined);
    input.current?.focus({ preventScroll: true });
  };

  const send = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const text = question.trim();
    if (text === "" || thinking) return;
    const payload = buildPayload({
      question: text,
      selected: quoted,
      page: { url: window.location.href, title: document.title },
      turns,
    });
    setTurns((previous) => [
      ...previous,
      {
        id: turnId(),
        role: "user",
        text: payload.question,
        ...(quoted === undefined ? {} : { quote: quoted.quote }),
        ...(quoted?.story === undefined ? {} : { story: quoted.story }),
      },
    ]);
    setQuestion("");
    setThinking(true);
    const outcome = await askRelay(endpoint, payload, browserRelay);
    setThinking(false);
    setTurns((previous) => [
      ...previous,
      outcome.kind === "answer"
        ? { id: turnId(), role: "assistant", text: outcome.answer }
        : { id: turnId(), role: "notice", text: ASK_PROBLEMS[outcome.problem] },
    ]);
  };

  if (!up) return null;

  return (
    <div ref={root} data-ask className="font-sans print:hidden">
      {chip !== undefined && (
        <button
          type="button"
          data-ask-chip
          aria-label="Ask about the selection"
          onPointerDown={(event) => event.preventDefault()}
          onClick={askAboutSelection}
          style={{ top: chip.top, left: chip.left, width: CHIP_WIDTH, height: CHIP_HEIGHT }}
          className="absolute z-40 inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
        >
          <MessageCircleQuestionIcon aria-hidden="true" className="size-4" />
          Ask
        </button>
      )}
      <button
        ref={launcher}
        type="button"
        data-ask-launcher
        aria-label="Ask Grok Digest"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={`${LAUNCHER} ${open ? "max-sm:hidden" : ""}`}
      >
        <Face />
      </button>
      {open && (
        <dialog ref={panel} open id={panelId} data-ask-panel aria-labelledby={titleId} className={PANEL}>
          <header className="flex items-center gap-1 border-b border-border py-1.5 pr-1.5 pl-4">
            <h2
              id={titleId}
              className="flex-1 font-[family-name:var(--issue-heading,var(--font-heading))] text-base font-semibold"
            >
              Ask Grok Digest
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={close}
              className="size-10 rounded-full"
            >
              <XIcon />
            </Button>
          </header>
          {turns.length === 0 && !thinking && (
            <p className="px-4 pt-4 text-sm text-muted-foreground">
              Ask anything about this page. To ask about a passage, select it and tap Ask.
            </p>
          )}
          <ol
            ref={conversation}
            data-ask-conversation
            aria-live="polite"
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3"
          >
            {turns.map((turn) => (
              <TurnView key={turn.id} turn={turn} />
            ))}
            {thinking && <TypingDots />}
          </ol>
          <form onSubmit={(event) => void send(event)} className="flex flex-col gap-2 border-t border-border p-3">
            {quoted !== undefined && (
              <div
                data-ask-quote
                className="flex items-start gap-1 rounded-lg border-l-2 border-brand bg-muted/60 py-1 pr-1 pl-3"
              >
                <blockquote className="line-clamp-3 min-w-0 flex-1 py-0.5 font-serif text-sm text-muted-foreground italic">
                  {truncated(quoted.quote, PANEL_QUOTE_LENGTH)}
                </blockquote>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove quote"
                  onClick={removeQuote}
                  className="rounded-full"
                >
                  <XIcon />
                </Button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={input}
                value={question}
                maxLength={MAX_QUESTION_LENGTH}
                rows={1}
                enterKeyHint="send"
                aria-label="Your question"
                placeholder={quoted === undefined ? "Ask a question…" : "Ask about this passage…"}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-base field-sizing-content outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button
                type="submit"
                aria-label="Send"
                disabled={thinking || question.trim() === ""}
                className="size-11 rounded-full"
              >
                <ArrowUpIcon />
              </Button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
