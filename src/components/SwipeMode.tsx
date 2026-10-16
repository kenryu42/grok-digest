import {
  ArrowUpRightIcon,
  CheckIcon,
  InboxIcon,
  CopyIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { cn } from "cn";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Button } from "./ui/button.tsx";
import { shows, type Depth } from "../lib/depth.ts";
import { prefersReducedMotion } from "../lib/morph.ts";
import { graphemes, readingPlan, stepMs, type ReadPlan, type ReadToken } from "../lib/reading.ts";
import { readStored, STORAGE_PREFIX, writeStored } from "../lib/storage.ts";
import { swipeAxis, swipeCommits, swipeOffset, swipeVelocity, type SwipeAxis, type SwipeSample } from "../lib/swipe.ts";
import { TOPIC_LABELS, TOPICS, type Topic } from "../lib/topics.ts";

const SPEED_KEY = `${STORAGE_PREFIX}speed-reading-wpm`;
const SPEED = { min: 200, max: 900, step: 25, start: 350 };
const START_DELAY_MS = 350;
const DONE_ADVANCE_MS = 300;
const UNDO_MS = 5000;
const COPIED_MS = 2000;
const CURRENT_LINE = 0.4;
const SWIPE_SAMPLES = 6;
const SPRING_BACK = "transform 500ms var(--ease-spring)";
const FLY_OFF = "transform 250ms ease-in";
const FLY_OFF_RESET_MS = 900;
const SPRING_BACK_MS = 500;

type BlockKind = "headline" | "summary" | "point" | "action" | "post";

const BLOCKS: { kind: BlockKind; level: Depth; selector: string }[] = [
  { kind: "headline", level: "headline", selector: "[data-card-toggle]" },
  { kind: "summary", level: "gist", selector: "[data-read-summary]" },
  { kind: "point", level: "points", selector: "[data-read-point]" },
  { kind: "action", level: "points", selector: "[data-read-action]" },
  { kind: "post", level: "full", selector: "[data-read-post]" },
];

const BLOCK_LABELS: Record<BlockKind, string> = {
  headline: "Headline",
  summary: "Summary",
  point: "Key point",
  action: "Try",
  post: "Original post",
};

const BLOCK_STYLES: Record<BlockKind, string> = {
  headline: "font-heading text-2xl leading-snug font-semibold text-balance sm:text-3xl",
  summary: "font-serif text-xl leading-relaxed text-pretty",
  point: "border-l-2 border-border pl-4 text-lg leading-relaxed text-pretty",
  action: "rounded-lg bg-brand-soft px-3 py-2 text-lg leading-relaxed text-pretty",
  post: "text-base leading-relaxed whitespace-pre-wrap text-foreground/85",
};

type Block = { key: string; kind: BlockKind; level: Depth; text: string };

type Page = {
  id: string;
  card: HTMLElement;
  author: string;
  topic: Topic | undefined;
  url: string;
  copy: string;
  headline: string;
  blocks: Block[];
};

type Gesture = {
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  axis: SwipeAxis;
  dx: number;
  samples: SwipeSample[];
};

type Props = {
  cards: HTMLElement[];
  start: number;
  depth: Depth;
  done: ReadonlySet<string>;
  onToggleDone: (id: string) => Promise<void>;
  onClose: (last: HTMLElement | undefined) => void;
};

function pageFrom(card: HTMLElement): Page {
  const blocks = BLOCKS.flatMap(({ kind, level, selector }) =>
    [...card.querySelectorAll(selector)]
      .map((element) => element.textContent.trim())
      .filter((text) => text !== "")
      .map((text, position) => ({ key: `${kind}-${position}`, kind, level, text })),
  );
  return {
    id: card.dataset["bookmarkId"] ?? "",
    card,
    author: card.querySelector("[data-author]")?.textContent.trim() ?? "",
    topic: TOPICS.find((topic) => topic === card.dataset["topic"]),
    url: card.dataset["url"] ?? "",
    copy: card.querySelector<HTMLElement>("[data-copy]")?.dataset["copy"] ?? "",
    headline: blocks.find(({ kind }) => kind === "headline")?.text ?? "",
    blocks: blocks.filter(({ kind }) => kind !== "headline"),
  };
}

function moveCard(mover: HTMLElement | null, transform: string, transition: string): void {
  if (mover === null) return;
  mover.style.transition = prefersReducedMotion() ? "" : transition;
  mover.style.transform = transform;
}

function showSwipeAction(mover: HTMLElement | null, action: "done" | "inbox" | null): void {
  const page = mover?.parentElement;
  if (page === null || page === undefined) return;
  if (action === null) delete page.dataset["swiping"];
  else page.dataset["swiping"] = action;
}

function storedSpeed(): number {
  const stored = readStored(SPEED_KEY);
  return typeof stored === "number" && stored >= SPEED.min && stored <= SPEED.max ? stored : SPEED.start;
}

export function SwipeMode({ cards, start, depth, done, onToggleDone, onClose }: Props) {
  const pages = useMemo(() => cards.map(pageFrom), [cards]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  const moverRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const keysRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const [current, setCurrent] = useState(start);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [speedOn, setSpeedOn] = useState(false);
  const [speed, setSpeed] = useState(storedSpeed);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [startSoon, setStartSoon] = useState(true);
  const [undo, setUndo] = useState<{ id: string; index: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const page = pages[current];
  const shown = useMemo(() => page?.blocks.filter(({ level }) => shows(depth, level)) ?? [], [page, depth]);
  const plan = useMemo(() => readingPlan(shown.map(({ text }) => text)), [shown]);
  const finished = step >= plan.words.length;
  const reading = speedOn && page !== undefined && !finished;

  const goTo = useCallback(
    (index: number): void => {
      const pager = pagerRef.current;
      const target = pager?.children[Math.min(Math.max(index, 0), pages.length)];
      if (pager === null || !(target instanceof HTMLElement)) return;
      pager.scrollTo({ top: target.offsetTop, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    },
    [pages.length],
  );

  const close = (): void => dialogRef.current?.close();

  const toggleSpeed = (): void => {
    setSpeedOn(!speedOn);
    setStep(0);
    setPlaying(false);
    setStartSoon(true);
  };

  const togglePlaying = (): void => {
    setStartSoon(false);
    if (finished) {
      setStep(0);
      setPlaying(true);
      return;
    }
    setPlaying(!playing);
  };

  const changeSpeed = (next: number): void => {
    const clamped = Math.min(Math.max(next, SPEED.min), SPEED.max);
    setSpeed(clamped);
    writeStored(SPEED_KEY, clamped);
  };

  const toggleExpanded = (id: string): void => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const toggleCurrentDone = (): void => {
    if (page === undefined) return;
    const marking = !done.has(page.id);
    void onToggleDone(page.id);
    setUndo(marking ? { id: page.id, index: current } : null);
    if (marking) setTimeout(() => goTo(current + 1), DONE_ADVANCE_MS);
  };

  const undoDone = (): void => {
    if (undo === null) return;
    void onToggleDone(undo.id);
    goTo(undo.index);
    setUndo(null);
  };

  const copyCurrent = (): void => {
    if (page === undefined) return;
    navigator.clipboard.writeText(page.copy).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const pager = pagerRef.current;
    if (dialog === null || pager === null) return undefined;
    dialog.showModal();
    const first = pager.children[start];
    if (first instanceof HTMLElement) pager.scrollTop = first.offsetTop;
    pager.focus({ preventScroll: true });
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
    };
  }, [start]);

  useEffect(() => {
    if (!speedOn || !startSoon) return undefined;
    const timer = setTimeout(() => {
      setStartSoon(false);
      setPlaying(!prefersReducedMotion());
    }, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [speedOn, startSoon]);

  useEffect(() => {
    if (!reading || !playing) return undefined;
    const timer = setTimeout(() => setStep(step + 1), stepMs(plan, step, speed));
    return () => clearTimeout(timer);
  }, [reading, playing, plan, step, speed]);

  useEffect(() => {
    if (undo === null) return undefined;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    const pauseWhenHidden = (): void => {
      if (document.hidden) setPlaying(false);
    };
    const onKey = (event: KeyboardEvent): void => keysRef.current(event);
    document.addEventListener("visibilitychange", pauseWhenHidden);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const onScroll = (): void => {
    const pager = pagerRef.current;
    if (pager === null) return;
    const line = pager.scrollTop + pager.clientHeight * CURRENT_LINE;
    const sections = [...pager.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
    const index = sections.findLastIndex((section) => section.offsetTop <= line);
    if (index < 0 || index === current) return;
    setCurrent(index);
    setStep(0);
    setPlaying(false);
    setStartSoon(true);
    setCopied(false);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (!event.isPrimary || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button, a") !== null) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      touch: event.pointerType === "touch",
      startX: event.clientX,
      startY: event.clientY,
      axis: "undecided",
      dx: 0,
      samples: [{ x: event.clientX, time: event.timeStamp }],
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    if (gesture.axis === "undecided") gesture.axis = swipeAxis(dx, event.clientY - gesture.startY);
    if (gesture.axis !== "horizontal" || !gesture.touch) return;
    gesture.dx = dx;
    gesture.samples = [...gesture.samples, { x: event.clientX, time: event.timeStamp }].slice(-SWIPE_SAMPLES);
    showSwipeAction(moverRef.current, page !== undefined && done.has(page.id) ? "inbox" : "done");
    moveCard(moverRef.current, `translateX(${swipeOffset(dx, event.currentTarget.clientWidth)}px)`, "none");
  };

  const endGesture = (event: PointerEvent<HTMLDivElement>): void => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    const mover = moverRef.current;
    const springBack = (): void => {
      moveCard(mover, "", SPRING_BACK);
      setTimeout(() => {
        if (gestureRef.current === null) showSwipeAction(mover, null);
      }, SPRING_BACK_MS);
    };
    if (event.type !== "pointerup") {
      springBack();
      return;
    }
    if (gesture.axis === "horizontal" && gesture.touch) {
      const velocity = swipeVelocity([...gesture.samples, { x: event.clientX, time: event.timeStamp }]);
      const commits = page !== undefined && swipeCommits(gesture.dx, event.currentTarget.clientWidth, velocity);
      if (!commits || done.has(page.id)) {
        springBack();
        if (commits) toggleCurrentDone();
        return;
      }
      moveCard(mover, "translateX(-110%)", FLY_OFF);
      toggleCurrentDone();
      setTimeout(() => {
        moveCard(mover, "", "");
        showSwipeAction(mover, null);
      }, FLY_OFF_RESET_MS);
      return;
    }
    if (gesture.axis !== "undecided" || page === undefined) return;
    if (reading) togglePlaying();
    else toggleExpanded(page.id);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement) return;
    const onControl = event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement;
    if ((event.key === " " || event.key === "Enter") && onControl) return;
    switch (event.key) {
      case " ":
        if (speedOn) togglePlaying();
        else if (page !== undefined) toggleExpanded(page.id);
        break;
      case "Enter":
        if (page !== undefined) toggleExpanded(page.id);
        break;
      case "ArrowDown":
      case "j":
        goTo(current + 1);
        break;
      case "ArrowUp":
      case "k":
        goTo(current - 1);
        break;
      case "e":
        toggleCurrentDone();
        break;
      case "u":
        undoDone();
        break;
      case "r":
        toggleSpeed();
        break;
      case "c":
        copyCurrent();
        break;
      case "o":
        if (page !== undefined) window.open(page.url, "_blank", "noopener,noreferrer");
        break;
      case "-":
        changeSpeed(speed - SPEED.step);
        break;
      case "=":
      case "+":
        changeSpeed(speed + SPEED.step);
        break;
      case "Escape":
        close();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  useEffect(() => {
    keysRef.current = onKeyDown;
  });

  const pageDone = page !== undefined && done.has(page.id);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Swipe mode"
      onClose={() => onClose(page?.card ?? pages.at(-1)?.card)}
      className="fixed inset-0 m-0 hidden h-dvh max-h-none w-full max-w-none flex-col bg-background p-0 text-foreground backdrop:bg-background open:flex motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-300"
    >
      <header className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-safe-3 pt-safe-2 pb-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={close}
            aria-label="Close swipe mode"
            className="size-11 rounded-full"
          >
            <XIcon className="size-5" aria-hidden="true" />
          </Button>
          <span data-swipe-counter className="flex-1 text-center text-sm text-muted-foreground tabular-nums">
            {Math.min(current + 1, pages.length)} / {pages.length}
          </span>
          <Button
            type="button"
            variant="outline"
            aria-pressed={speedOn}
            onClick={toggleSpeed}
            title="Speed read (r)"
            className="h-10 rounded-full px-3 aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-brand-ink"
          >
            <ZapIcon className="in-aria-pressed:fill-brand" aria-hidden="true" />
            Speed read
          </Button>
        </div>
        {speedOn && (
          <div aria-hidden="true" className="h-0.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-brand transition-[width] duration-150 ease-linear"
              style={{ width: `${plan.words.length === 0 ? 100 : Math.min(step / plan.words.length, 1) * 100}%` }}
            />
          </div>
        )}
      </header>

      <div
        ref={pagerRef}
        tabIndex={-1}
        data-swipe-pager
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        className="relative min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [scrollbar-width:none]"
      >
        {pages.map((p, index) => {
          const level = expanded.has(p.id) ? "full" : depth;
          const isCurrent = index === current;
          return (
            <section
              key={p.id}
              data-swipe-page={p.id}
              data-current={isCurrent || undefined}
              className="group/page relative flex min-h-full snap-start snap-always flex-col touch-pan-y"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 hidden items-center justify-end gap-2 bg-done px-8 text-lg font-medium text-done-foreground group-data-[swiping=done]/page:flex"
              >
                <CheckIcon className="size-5" />
                Done
              </span>
              <span
                aria-hidden="true"
                className="absolute inset-0 hidden items-center justify-end gap-2 bg-muted px-8 text-lg font-medium text-foreground group-data-[swiping=inbox]/page:flex"
              >
                <InboxIcon className="size-5" />
                Back to inbox
              </span>
              <div
                ref={isCurrent ? moverRef : undefined}
                className="relative flex flex-1 flex-col bg-background px-safe-5 pt-3 pb-8"
              >
                <article data-topic={p.topic} className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-topic" />
                    <span className="min-w-0 truncate">
                      {p.topic === undefined ? p.author : `${TOPIC_LABELS[p.topic]} · ${p.author}`}
                    </span>
                    {done.has(p.id) && (
                      <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-done px-2 py-0.5 text-xs font-medium text-done-foreground">
                        <CheckIcon className="size-3" aria-hidden="true" />
                        Done
                      </span>
                    )}
                  </p>
                  <h2 className={BLOCK_STYLES.headline}>{p.headline}</h2>
                  {isCurrent && reading ? (
                    <SpeedStage
                      plan={plan}
                      step={step}
                      playing={playing}
                      starting={startSoon}
                      speed={speed}
                      labels={shown}
                    />
                  ) : (
                    <div className="flex flex-col gap-4">
                      {p.blocks
                        .filter((block) => shows(level, block.level))
                        .map((block) => (
                          <p key={block.key} className={BLOCK_STYLES[block.kind]}>
                            {block.kind === "action" && <span className="font-medium text-brand-ink">Try: </span>}
                            {block.text}
                          </p>
                        ))}
                    </div>
                  )}
                </article>
              </div>
            </section>
          );
        })}
        <section className="flex min-h-full snap-start snap-always flex-col items-center justify-center gap-3 px-safe-6 text-center">
          <p className="font-heading text-2xl font-semibold">That's all {pages.length} cards</p>
          <p className="text-muted-foreground">Cards you mark done leave your inbox.</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="outline" onClick={() => goTo(0)} className="h-11 rounded-full px-5">
              Start over
            </Button>
            <Button type="button" onClick={close} className="h-11 rounded-full px-5">
              Close
            </Button>
          </div>
        </section>
      </div>

      <footer className="relative mx-auto flex w-full max-w-2xl flex-col gap-3 border-t px-safe-4 pt-3 pb-safe-4">
        <output className="pointer-events-none absolute inset-x-0 -top-14 flex justify-center px-4">
          {undo !== null && (
            <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-foreground py-1.5 pr-1.5 pl-4 text-sm text-background shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
              Marked done
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={undoDone}
                className="h-9 rounded-full px-3 font-semibold text-background underline underline-offset-4 hover:bg-background/15 hover:text-background dark:hover:bg-background/15"
              >
                Undo
              </Button>
            </span>
          )}
        </output>
        {speedOn && page !== undefined && (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={togglePlaying}
              aria-label={finished ? "Read again" : playing ? "Pause" : "Play"}
              className="size-11 rounded-full"
            >
              {finished ? (
                <RotateCcwIcon className="size-5" aria-hidden="true" />
              ) : playing ? (
                <PauseIcon className="size-5 fill-current" aria-hidden="true" />
              ) : (
                <PlayIcon className="size-5 fill-current" aria-hidden="true" />
              )}
            </Button>
            <label className="flex flex-1 items-center gap-3 text-sm text-muted-foreground">
              <span className="sr-only">Speed</span>
              <input
                type="range"
                min={SPEED.min}
                max={SPEED.max}
                step={SPEED.step}
                value={speed}
                onChange={(event) => changeSpeed(Number(event.target.value))}
                className="h-11 min-w-0 flex-1 accent-foreground"
              />
              <span className="w-18 text-right text-foreground tabular-nums">{speed} wpm</span>
            </label>
          </div>
        )}
        {page !== undefined && (
          <div className="grid grid-cols-3 items-center gap-2">
            <Button type="button" variant="ghost" onClick={copyCurrent} className="h-11 rounded-full">
              {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-pressed={pageDone}
              onClick={toggleCurrentDone}
              className="h-11 rounded-full aria-pressed:border-done aria-pressed:bg-done aria-pressed:text-done-foreground"
            >
              <CheckIcon aria-hidden="true" />
              Done
            </Button>
            <a
              href={page.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-1 rounded-full text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Open on X
              <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        )}
      </footer>
    </dialog>
  );
}

function SpeedStage({
  plan,
  step,
  playing,
  starting,
  speed,
  labels,
}: {
  plan: ReadPlan;
  step: number;
  playing: boolean;
  starting: boolean;
  speed: number;
  labels: Block[];
}) {
  const word = plan.words[step];
  const block = labels[word?.block ?? 0];
  const letters = graphemes(word?.text ?? "");
  const focus = word?.focus ?? 0;
  return (
    <div data-speed-stage className="flex min-h-56 flex-1 flex-col items-center justify-center gap-6">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {block === undefined ? "" : BLOCK_LABELS[block.kind]}
      </p>
      {playing || starting || word === undefined ? (
        <div className="relative w-full py-6">
          <span aria-hidden="true" className="absolute top-0 left-1/2 h-3 border-l border-brand/60" />
          <span aria-hidden="true" className="absolute bottom-0 left-1/2 h-3 border-l border-brand/60" />
          <p
            key={step}
            data-speed-word
            className="grid w-full grid-cols-[1fr_auto_1fr] font-heading text-4xl leading-none whitespace-pre"
            style={
              playing && !prefersReducedMotion()
                ? { animation: `word-flash ${stepMs(plan, step, speed)}ms linear both` }
                : undefined
            }
          >
            <span className="text-right">{letters.slice(0, focus).join("")}</span>
            <span className="text-brand-ink">{letters[focus] ?? ""}</span>
            <span>{letters.slice(focus + 1).join("")}</span>
          </p>
        </div>
      ) : (
        <p data-speed-paused className="max-h-[50vh] overflow-y-auto text-xl leading-relaxed text-pretty">
          <BlockWords tokens={plan.blocks[word.block] ?? []} step={step} />
        </p>
      )}
    </div>
  );
}

function BlockWords({ tokens, step }: { tokens: ReadToken[]; step: number }) {
  return tokens.map((token) => (
    <span
      key={token.at}
      className={cn(
        token.word && token.step === step && "rounded-sm bg-brand-soft shadow-[0_0_0_2px_var(--brand-soft)]",
      )}
    >
      {token.text}
    </span>
  ));
}
