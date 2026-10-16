import { CheckIcon, PauseIcon, PlayIcon, Volume2Icon, XIcon } from "lucide-react";
import { cn } from "cn";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Button } from "./ui/button.tsx";
import { shows, type Depth } from "../lib/depth.ts";
import { prefersReducedMotion } from "../lib/morph.ts";
import {
  readingPlan,
  speechLang,
  speechRate,
  spokenText,
  wordMs,
  type ReadPlan,
  type ReadToken,
} from "../lib/reading.ts";
import { readStored, STORAGE_PREFIX, writeStored } from "../lib/storage.ts";
import { swipeAxis, swipeCommits, swipeOffset, swipeVelocity, type SwipeAxis, type SwipeSample } from "../lib/swipe.ts";
import { TOPIC_LABELS, TOPICS, type Topic } from "../lib/topics.ts";

const SPEED_KEY = `${STORAGE_PREFIX}read-speed`;
const SPEED = { min: 120, max: 600, step: 20, start: 260 };
const PAGE_PAUSE_MS = 700;
const DONE_ADVANCE_MS = 350;
const HOLD_MS = 300;
const TAP_ZONE = 0.3;
const KEEP_IN_VIEW = { below: 0.7, at: 0.3 };
const RENDERED_NEIGHBORS = 1;
const SPRING_BACK = "transform 500ms var(--ease-spring)";
const FLY_OFF = "transform 250ms ease-in";
const FLY_OFF_RESET_MS = 900;

type BlockKind = "headline" | "summary" | "point" | "action" | "post";

const BLOCKS: { kind: BlockKind; level: Depth; selector: string }[] = [
  { kind: "headline", level: "headline", selector: "[data-card-toggle]" },
  { kind: "summary", level: "gist", selector: "[data-read-summary]" },
  { kind: "point", level: "points", selector: "[data-read-point]" },
  { kind: "action", level: "points", selector: "[data-read-action]" },
  { kind: "post", level: "full", selector: "[data-read-post]" },
];

const BLOCK_STYLES: Record<BlockKind, string> = {
  headline: "font-heading text-2xl leading-snug font-semibold text-balance sm:text-3xl",
  summary: "font-serif text-xl leading-relaxed text-pretty",
  point: "border-l-2 border-border pl-4 text-lg leading-relaxed text-pretty",
  action: "rounded-lg bg-brand-soft px-3 py-2 text-lg leading-relaxed text-pretty",
  post: "text-base leading-relaxed whitespace-pre-wrap text-foreground/85",
};

type Page = {
  id: string;
  card: HTMLElement;
  author: string;
  topic: Topic | undefined;
  blocks: { key: string; kind: BlockKind }[];
  plan: ReadPlan;
};

type Gesture = {
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  axis: SwipeAxis;
  dx: number;
  samples: SwipeSample[];
  held: boolean;
  timer: ReturnType<typeof setTimeout>;
};

type Props = {
  cards: HTMLElement[];
  start: number;
  depth: Depth;
  done: ReadonlySet<string>;
  onToggleDone: (id: string) => Promise<void>;
  onClose: (last: HTMLElement | undefined) => void;
};

function pageFrom(card: HTMLElement, depth: Depth): Page {
  const blocks = BLOCKS.filter(({ level }) => shows(depth, level)).flatMap(({ kind, selector }) =>
    [...card.querySelectorAll(selector)]
      .map((element) => element.textContent.trim())
      .filter((text) => text !== "")
      .map((text) => ({ kind, text })),
  );
  return {
    id: card.dataset["bookmarkId"] ?? "",
    card,
    author: card.querySelector("[data-author]")?.textContent.trim() ?? "",
    topic: TOPICS.find((topic) => topic === card.dataset["topic"]),
    blocks: blocks.map(({ kind }, position) => ({ key: `${kind}-${position}`, kind })),
    plan: readingPlan(blocks.map(({ text }) => text)),
  };
}

function storedSpeed(): number {
  const stored = readStored(SPEED_KEY);
  return typeof stored === "number" && stored >= SPEED.min && stored <= SPEED.max ? stored : SPEED.start;
}

function unlockSpeech(): void {
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

export function ReadMode({ cards, start, depth, done, onToggleDone, onClose }: Props) {
  const pages = useMemo(() => cards.map((card) => pageFrom(card, depth)), [cards, depth]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const keysRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const stepRef = useRef(0);
  const [current, setCurrent] = useState(start);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [holding, setHolding] = useState(false);
  const [listening, setListening] = useState(false);
  const [speed, setSpeed] = useState(storedSpeed);
  const canSpeak = "speechSynthesis" in window;
  const page = pages[current];
  const steps = page?.plan.weights.length ?? 0;
  const progressive = playing || listening;

  const goTo = useCallback(
    (index: number): void => {
      const pager = pagerRef.current;
      if (pager === null) return;
      const target = Math.min(Math.max(index, 0), pages.length);
      if (target === current) setStep(0);
      pager.scrollTo({ top: target * pager.clientHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    },
    [current, pages.length],
  );

  const close = (): void => dialogRef.current?.close();

  const togglePlay = (): void => setPlaying((previous) => !previous);

  const toggleListen = (): void => {
    if (!listening) {
      unlockSpeech();
      setPlaying(true);
    }
    setListening(!listening);
  };

  const changeSpeed = (next: number): void => {
    const clamped = Math.min(Math.max(next, SPEED.min), SPEED.max);
    setSpeed(clamped);
    writeStored(SPEED_KEY, clamped);
  };

  const toggleCurrentDone = (): void => {
    if (page === undefined) return;
    const marking = !done.has(page.id);
    void onToggleDone(page.id);
    if (marking) setTimeout(() => goTo(current + 1), DONE_ADVANCE_MS);
  };

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const pager = pagerRef.current;
    if (dialog === null || pager === null) return undefined;
    dialog.showModal();
    playRef.current?.focus();
    pager.scrollTop = start * pager.clientHeight;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [start]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (page === undefined || !playing || holding || listening) return undefined;
    const weight = page.plan.weights[step];
    const timer =
      weight === undefined
        ? setTimeout(() => goTo(current + 1), PAGE_PAUSE_MS)
        : setTimeout(() => setStep(step + 1), wordMs(weight, speed));
    return () => clearTimeout(timer);
  }, [page, playing, holding, listening, step, speed, current, goTo]);

  useEffect(() => {
    if (!canSpeak || page === undefined || !listening || !playing || holding) return undefined;
    const from = stepRef.current < steps ? stepRef.current : 0;
    const { text, starts } = spokenText(page.plan, from);
    const utterance = new SpeechSynthesisUtterance(text);
    let advance: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    utterance.lang = speechLang(text);
    utterance.rate = speechRate(speed);
    utterance.addEventListener("boundary", (event) => {
      if (stopped || event.name !== "word") return;
      const offset = starts.findLastIndex((wordStart) => wordStart <= event.charIndex);
      if (offset >= 0) setStep(from + offset);
    });
    utterance.addEventListener("end", () => {
      if (stopped) return;
      setStep(steps);
      advance = setTimeout(() => goTo(current + 1), PAGE_PAUSE_MS);
    });
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return () => {
      stopped = true;
      clearTimeout(advance);
      window.speechSynthesis.cancel();
    };
  }, [canSpeak, page, steps, listening, playing, holding, speed, current, goTo]);

  useEffect(() => {
    const body = bodyRef.current;
    if (body === null) return;
    if (step === 0) {
      body.scrollTop = 0;
      return;
    }
    const word = body.querySelector<HTMLElement>(`[data-step="${step}"]`);
    if (word === null) return;
    const below = word.offsetTop + word.offsetHeight > body.scrollTop + body.clientHeight * KEEP_IN_VIEW.below;
    if (!below && word.offsetTop >= body.scrollTop) return;
    body.scrollTo({
      top: word.offsetTop - body.clientHeight * KEEP_IN_VIEW.at,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [step]);

  useEffect(() => {
    const pauseWhenHidden = (): void => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => keysRef.current(event);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const onScroll = (): void => {
    const pager = pagerRef.current;
    if (pager === null || pager.clientHeight === 0) return;
    const index = Math.round(pager.scrollTop / pager.clientHeight);
    if (index === current) return;
    setCurrent(index);
    setStep(0);
  };

  const moveArticle = (transform: string, transition: string): void => {
    const article = articleRef.current;
    if (article === null) return;
    article.style.transition = prefersReducedMotion() ? "" : transition;
    article.style.transform = transform;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (!event.isPrimary || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button") !== null) return;
    if (event.pointerType !== "touch") event.currentTarget.setPointerCapture(event.pointerId);
    const gesture: Gesture = {
      pointerId: event.pointerId,
      touch: event.pointerType === "touch",
      startX: event.clientX,
      startY: event.clientY,
      axis: "undecided",
      dx: 0,
      samples: [{ x: event.clientX, time: event.timeStamp }],
      held: false,
      timer: setTimeout(() => {
        gesture.held = true;
        setHolding(true);
      }, HOLD_MS),
    };
    gestureRef.current = gesture;
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    if (gesture.axis === "undecided") {
      gesture.axis = swipeAxis(dx, event.clientY - gesture.startY);
      if (gesture.axis !== "undecided") clearTimeout(gesture.timer);
    }
    if (gesture.axis !== "horizontal" || !gesture.touch || gesture.held) return;
    gesture.dx = dx;
    gesture.samples = [...gesture.samples, { x: event.clientX, time: event.timeStamp }].slice(-6);
    moveArticle(`translateX(${swipeOffset(dx, event.currentTarget.clientWidth)}px)`, "none");
  };

  const endGesture = (event: PointerEvent<HTMLDivElement>): void => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    clearTimeout(gesture.timer);
    if (gesture.held) {
      setHolding(false);
      return;
    }
    if (event.type !== "pointerup") {
      moveArticle("", SPRING_BACK);
      return;
    }
    const width = event.currentTarget.clientWidth;
    if (gesture.axis === "horizontal" && gesture.touch) {
      const commits =
        page !== undefined &&
        swipeCommits(
          gesture.dx,
          width,
          swipeVelocity([...gesture.samples, { x: event.clientX, time: event.timeStamp }]),
        );
      if (commits && !done.has(page.id)) {
        const flown = articleRef.current;
        moveArticle("translateX(-110%)", FLY_OFF);
        toggleCurrentDone();
        setTimeout(() => {
          if (flown === null) return;
          flown.style.transition = "";
          flown.style.transform = "";
        }, FLY_OFF_RESET_MS);
        return;
      }
      moveArticle("", SPRING_BACK);
      if (commits) toggleCurrentDone();
      return;
    }
    if (gesture.axis !== "undecided") return;
    const share = (event.clientX - event.currentTarget.getBoundingClientRect().left) / width;
    if (share < TAP_ZONE) goTo(current - 1);
    else if (share > 1 - TAP_ZONE) goTo(current + 1);
    else togglePlay();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement) return;
    if (event.key === " " && event.target instanceof HTMLButtonElement) return;
    switch (event.key) {
      case " ":
        togglePlay();
        break;
      case "Escape":
        close();
        break;
      case "ArrowDown":
      case "ArrowRight":
      case "j":
        goTo(current + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
      case "k":
        goTo(current - 1);
        break;
      case "e":
        toggleCurrentDone();
        break;
      case "l":
        if (canSpeak) toggleListen();
        break;
      case "-":
        changeSpeed(speed - SPEED.step);
        break;
      case "=":
      case "+":
        changeSpeed(speed + SPEED.step);
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
      aria-label="Read mode"
      onClose={() => onClose(page?.card ?? pages.at(-1)?.card)}
      className="fixed inset-0 m-0 hidden h-dvh max-h-none w-full max-w-none flex-col bg-background p-0 text-foreground backdrop:bg-background open:flex motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-300"
    >
      <header className="flex items-center gap-3 px-safe-3 pt-safe-2 pb-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label="Close read mode"
          className="size-11 rounded-full"
        >
          <XIcon className="size-5" aria-hidden="true" />
        </Button>
        <div aria-hidden="true" className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-300 ease-linear"
            style={{ width: `${steps === 0 ? 0 : Math.min(step / steps, 1) * 100}%` }}
          />
        </div>
        <span className="min-w-14 text-right text-sm text-muted-foreground tabular-nums">
          {Math.min(current + 1, pages.length)} / {pages.length}
        </span>
      </header>

      <div
        ref={pagerRef}
        data-read-pager
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain select-none [scrollbar-width:none]"
      >
        {pages.map((p, index) => (
          <section
            key={p.id}
            aria-hidden={index !== current}
            className="flex h-full snap-start snap-always flex-col px-safe-5 pt-2 pb-3 touch-pan-y"
          >
            {Math.abs(index - current) <= RENDERED_NEIGHBORS && (
              <article
                ref={index === current ? articleRef : undefined}
                data-topic={p.topic}
                className="flex min-h-0 flex-1 flex-col gap-3"
              >
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
                <div
                  ref={index === current ? bodyRef : undefined}
                  className={cn(
                    "relative min-h-0 flex-1 [scrollbar-width:none]",
                    index === current && playing ? "overflow-hidden" : "overflow-y-auto",
                  )}
                >
                  <div className="flex flex-col gap-4 pb-24">
                    {p.blocks.map(({ key, kind }, block) => {
                      const tokens = p.plan.blocks[block] ?? [];
                      return (
                        <p key={key} className={BLOCK_STYLES[kind]}>
                          {kind === "action" && <span className="font-medium text-brand-ink">Try: </span>}
                          <Words
                            tokens={tokens}
                            step={index === current ? step : -1}
                            progressive={index === current && progressive}
                          />
                        </p>
                      );
                    })}
                  </div>
                </div>
              </article>
            )}
          </section>
        ))}
        <section className="flex h-full snap-start snap-always flex-col items-center justify-center gap-3 px-safe-6 text-center">
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

      <footer className="flex flex-col gap-3 border-t px-safe-4 pt-3 pb-safe-4">
        <div className="grid grid-cols-3 items-center">
          {page !== undefined && (
            <Button
              type="button"
              variant="outline"
              aria-pressed={pageDone}
              onClick={toggleCurrentDone}
              className="h-11 justify-self-start rounded-full px-4 aria-pressed:border-done aria-pressed:bg-done aria-pressed:text-done-foreground"
            >
              <CheckIcon aria-hidden="true" />
              Done
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            ref={playRef}
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="col-start-2 size-14 justify-self-center rounded-full transition-[scale] duration-500 ease-spring active:scale-90 active:duration-150"
          >
            {playing ? (
              <PauseIcon className="size-6 fill-current" aria-hidden="true" />
            ) : (
              <PlayIcon className="size-6 fill-current" aria-hidden="true" />
            )}
          </Button>
          {canSpeak && (
            <Button
              type="button"
              variant="outline"
              aria-pressed={listening}
              onClick={toggleListen}
              className="col-start-3 h-11 justify-self-end rounded-full px-4 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              <Volume2Icon aria-hidden="true" />
              Listen
            </Button>
          )}
        </div>
        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          Speed
          <input
            type="range"
            min={SPEED.min}
            max={SPEED.max}
            step={SPEED.step}
            value={speed}
            onChange={(event) => changeSpeed(Number(event.target.value))}
            className="h-11 flex-1 accent-foreground"
          />
          <span className="w-18 text-right text-foreground tabular-nums">{speed} wpm</span>
        </label>
      </footer>
    </dialog>
  );
}

function Words({ tokens, step, progressive }: { tokens: ReadToken[]; step: number; progressive: boolean }) {
  return tokens.map((token) => {
    const now = token.word && token.step === step;
    const ahead = !now && token.step >= step;
    return (
      <span
        key={token.at}
        data-step={token.word ? token.step : undefined}
        className={cn(
          "transition-colors duration-150",
          now && "rounded-sm bg-brand-soft box-decoration-clone shadow-[0_0_0_2px_var(--brand-soft)]",
          progressive && ahead && "text-foreground/35",
        )}
      >
        {token.text}
      </span>
    );
  });
}
