import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { shows, type Depth } from "./depth.ts";
import type { PostLink } from "./bookmarks.ts";
import { withoutUrls, type PostPart } from "./media.ts";
import { prefersReducedMotion } from "./morph.ts";
import { readingPlan, stepMs, type ReadPlan } from "./reading.ts";
import { readStored, STORAGE_PREFIX, writeStored } from "./storage.ts";
import {
  restOffset,
  swipeAxis,
  swipeOffset,
  swipeRest,
  swipeVelocity,
  type SwipeAxis,
  type SwipeSample,
  type SwipeTrays,
} from "./swipe.ts";
import { TOPICS, type Topic } from "./topics.ts";

const SPEED_KEY = `${STORAGE_PREFIX}speed-reading-wpm`;
const NUDGED_KEY = `${STORAGE_PREFIX}swipe-nudged`;
export const SPEED = { min: 200, max: 600, step: 25, start: 250 };
const START_DELAY_MS = 350;
const DONE_ADVANCE_MS = 300;
const UNDO_MS = 5000;
const COPIED_MS = 2000;
const CURRENT_LINE = 0.4;
const SWIPE_SAMPLES = 6;
const SPRING_BACK = "transform 500ms var(--ease-spring)";
const FLY_OFF = "transform 250ms ease-in";
const FLY_OFF_MS = 250;
const FLY_OFF_RESET_MS = 900;
const SPRING_BACK_MS = 500;
export const CARD_DEPTH: Depth = "points";

export type BlockKind = "headline" | "summary" | "point" | "action" | "post";

const BLOCKS: { kind: BlockKind; level: Depth; selector: string }[] = [
  { kind: "headline", level: "headline", selector: "[data-card-toggle]" },
  { kind: "summary", level: "gist", selector: "[data-read-summary]" },
  { kind: "point", level: "points", selector: "[data-read-point]" },
  { kind: "action", level: "points", selector: "[data-read-action]" },
  { kind: "post", level: "full", selector: "[data-read-post]" },
];

type SwipeBlock = { key: string; kind: BlockKind; level: Depth; text: string };

export type SwipePage = {
  id: string;
  card: HTMLElement;
  author: string;
  topic: Topic | undefined;
  url: string;
  copy: string;
  headline: string;
  blocks: SwipeBlock[];
  links: PostLink[];
  post: PostPart[];
  cover: { url: string; alt: string } | undefined;
};

type Gesture = {
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  origin: number;
  axis: SwipeAxis;
  dx: number;
  samples: SwipeSample[];
  trays: SwipeTrays;
};

type OpenSide = "left" | "right";

type TrayAction = "done" | "later" | "share" | "copy";

type Options = {
  cards: HTMLElement[];
  start: number;
  done: ReadonlySet<string>;
  onToggleDone: (id: string) => Promise<void>;
  onLater: (id: string) => Promise<void>;
  onClose: (last: HTMLElement | undefined) => void;
};

function pageFrom(card: HTMLElement): SwipePage {
  const blocks = BLOCKS.flatMap(({ kind, level, selector }) =>
    [...card.querySelectorAll(selector)]
      .map((element) => (kind === "post" ? withoutUrls(element.textContent) : element.textContent.trim()))
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
    links: [...card.querySelectorAll<HTMLAnchorElement>("[data-link-card]")]
      .filter((anchor) => anchor.closest("blockquote") === null)
      .map(linkFrom),
    post: postFrom(card.querySelector("blockquote")),
    cover: coverFrom(card.querySelector<HTMLImageElement>("[data-cover] img[alt]:not([alt=''], [hidden])")),
  };
}

function postFrom(quote: Element | null): PostPart[] {
  return [...(quote?.children ?? [])].flatMap((child): PostPart[] => {
    if (child.matches("[data-read-post]")) return [{ kind: "text", text: child.textContent.trim() }];
    const anchor = child.querySelector<HTMLAnchorElement>("[data-link-card]");
    if (child.matches("[data-post-link]") && anchor !== null) return [{ kind: "link", link: linkFrom(anchor) }];
    const images = [...child.querySelectorAll("img")].map((image) => ({ url: image.src, alt: image.alt }));
    return images.length > 0 ? [{ kind: "images", images }] : [];
  });
}

function coverFrom(image: HTMLImageElement | null): SwipePage["cover"] {
  return image === null ? undefined : { url: image.src, alt: image.alt };
}

function linkFrom(anchor: HTMLAnchorElement): PostLink {
  const image = anchor.querySelector("img");
  return {
    url: anchor.href,
    title: anchor.querySelector("[data-link-title]")?.textContent.trim() ?? "",
    image: image === null || image.hidden ? undefined : image.src,
  };
}

function moveCard(mover: HTMLElement | null, transform: string, transition: string): void {
  if (mover === null) return;
  mover.style.transition = prefersReducedMotion() ? "" : transition;
  mover.style.transform = transform;
}

function showActions(mover: HTMLElement | null, side: OpenSide | null): void {
  const page = mover?.parentElement;
  if (page === null || page === undefined) return;
  if (side === null) delete page.dataset["swiping"];
  else page.dataset["swiping"] = side;
}

function traysOf(mover: HTMLElement | null): SwipeTrays {
  const tray = (side: OpenSide): number =>
    mover?.parentElement?.querySelector<HTMLElement>(`[data-swipe-tray="${side}"]`)?.offsetWidth ?? 0;
  return { left: tray("left"), right: tray("right") };
}

function deck(pages: readonly SwipePage[], later: readonly string[]): SwipePage[] {
  return [
    ...pages.filter(({ id }) => !later.includes(id)),
    ...later.flatMap((id) => pages.filter((page) => page.id === id)),
  ];
}

function storedSpeed(): number {
  const stored = readStored(SPEED_KEY);
  return typeof stored === "number" && stored >= SPEED.min && stored <= SPEED.max ? stored : SPEED.start;
}

export type SwipeControls = {
  pages: readonly SwipePage[];
  current: number;
  page: SwipePage | undefined;
  goTo: (index: number) => void;
  close: () => void;
  done: ReadonlySet<string>;
  pageDone: boolean;
  toggleDone: () => void;
  later: () => void;
  undoPending: boolean;
  undo: () => void;
  copied: boolean;
  copy: () => void;
  canShare: boolean;
  share: () => void;
  expanded: ReadonlySet<string>;
  toggleExpanded: (id: string) => void;
  speedOn: boolean;
  toggleSpeed: () => void;
  reading: boolean;
  playing: boolean;
  starting: boolean;
  finished: boolean;
  togglePlaying: () => void;
  speed: number;
  changeSpeed: (speed: number) => void;
  plan: ReadPlan;
  step: number;
  blocks: readonly SwipeBlock[];
};

type SwipeFrame = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  pagerRef: RefObject<HTMLDivElement | null>;
  moverRef: RefObject<HTMLDivElement | null>;
  onDialogClose: () => void;
  act: (action: TrayAction) => void;
  nudging: boolean;
  pagerHandlers: {
    onScroll: () => void;
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  };
};

export function useSwipeMode({ cards, start, done, onToggleDone, onLater, onClose }: Options): {
  swipe: SwipeControls;
  frame: SwipeFrame;
} {
  const allPages = useMemo(() => cards.map(pageFrom), [cards]);
  const [later, setLater] = useState<readonly string[]>([]);
  const pages = useMemo(() => deck(allPages, later), [allPages, later]);
  const openRef = useRef<OpenSide | null>(null);
  const [canShare] = useState(() => typeof navigator.share === "function");
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
  const [undo, setUndo] = useState<{ id: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [nudging, setNudging] = useState(() => readStored(NUDGED_KEY) !== true && start < cards.length - 1);
  const page = pages[current];
  const pageDepth = page !== undefined && expanded.has(page.id) ? "full" : CARD_DEPTH;
  const shown = useMemo(() => page?.blocks.filter(({ level }) => shows(pageDepth, level)) ?? [], [page, pageDepth]);
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

  const stayAt = (index: number): void => {
    const pager = pagerRef.current;
    const target = pager?.children[index];
    if (pager !== null && target instanceof HTMLElement) pager.scrollTop = target.offsetTop;
  };

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

  const arrive = (): void => {
    setStep(0);
    setPlaying(false);
    setStartSoon(true);
    setCopied(false);
  };

  const settle = (mover: HTMLElement | null, rest: OpenSide | "closed", trays: SwipeTrays): void => {
    openRef.current = rest === "closed" ? null : rest;
    if (rest !== "closed") showActions(mover, rest);
    moveCard(mover, rest === "closed" ? "" : `translateX(${restOffset(rest, trays)}px)`, SPRING_BACK);
    if (rest !== "closed") return;
    setTimeout(() => {
      if (gestureRef.current === null && openRef.current === null) showActions(mover, null);
    }, SPRING_BACK_MS);
  };

  const closeActions = (): void => {
    if (openRef.current !== null) settle(moverRef.current, "closed", traysOf(moverRef.current));
  };

  const flyOff = (mover: HTMLElement | null): void => {
    openRef.current = null;
    moveCard(mover, "translateX(-110%)", FLY_OFF);
  };

  const toggleCurrentDone = (): void => {
    if (page === undefined) return;
    closeActions();
    const marking = !done.has(page.id);
    void onToggleDone(page.id);
    setUndo(marking ? { id: page.id } : null);
    if (marking) setTimeout(() => goTo(current + 1), DONE_ADVANCE_MS);
  };

  const leaveDone = (): void => {
    const mover = moverRef.current;
    if (page === undefined) return;
    if (done.has(page.id)) {
      settle(mover, "closed", traysOf(mover));
      toggleCurrentDone();
      return;
    }
    flyOff(mover);
    toggleCurrentDone();
    setTimeout(() => {
      moveCard(mover, "", "");
      showActions(mover, null);
    }, FLY_OFF_RESET_MS);
  };

  const laterCurrent = (): void => {
    if (page === undefined) return;
    const { id } = page;
    void onLater(id);
    if (current === pages.length - 1) {
      closeActions();
      return;
    }
    const mover = moverRef.current;
    flyOff(mover);
    setTimeout(
      () => {
        flushSync(() => setLater((previous) => [...previous.filter((other) => other !== id), id]));
        stayAt(current);
        moveCard(mover, "", "");
        showActions(mover, null);
        arrive();
      },
      prefersReducedMotion() ? 0 : FLY_OFF_MS,
    );
  };

  const undoDone = (): void => {
    if (undo === null) return;
    setUndo(null);
    void onToggleDone(undo.id);
    goTo(pages.findIndex(({ id }) => id === undo.id));
  };

  const copyCurrent = (): void => {
    if (page === undefined) return;
    closeActions();
    navigator.clipboard.writeText(page.copy).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  const shareCurrent = (): void => {
    if (page === undefined || !canShare) return;
    closeActions();
    navigator.share({ title: page.headline, url: page.url }).catch(() => {});
  };

  const act = (action: TrayAction): void => {
    const actions: Record<TrayAction, () => void> = {
      done: leaveDone,
      later: laterCurrent,
      share: shareCurrent,
      copy: copyCurrent,
    };
    actions[action]();
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
    if (nudging) writeStored(NUDGED_KEY, true);
  }, [nudging]);

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
    const holdSwipeFromScrolling = (event: TouchEvent): void => {
      const gesture = gestureRef.current;
      if (gesture?.axis === "horizontal" && gesture.touch && event.cancelable) event.preventDefault();
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    document.addEventListener("keydown", onKey);
    document.addEventListener("touchmove", holdSwipeFromScrolling, { passive: false });
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("touchmove", holdSwipeFromScrolling);
    };
  }, []);

  const onScroll = (): void => {
    const pager = pagerRef.current;
    if (pager === null) return;
    const line = pager.scrollTop + pager.clientHeight * CURRENT_LINE;
    const sections = [...pager.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
    const viewBottom = pager.scrollTop + pager.clientHeight;
    for (const section of sections) {
      const offScreen = section.offsetTop >= viewBottom || section.offsetTop + section.offsetHeight <= pager.scrollTop;
      const content = section.lastElementChild;
      if (offScreen && content !== null && content.scrollTop !== 0) content.scrollTop = 0;
    }
    const index = sections.findLastIndex((section) => section.offsetTop <= line);
    if (index < 0 || index === current) return;
    closeActions();
    setCurrent(index);
    arrive();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (!event.isPrimary || event.button !== 0) return;
    setNudging(false);
    if (event.target instanceof Element && event.target.closest("button:not([data-swipe-peek]), a") !== null) return;
    const trays = traysOf(moverRef.current);
    gestureRef.current = {
      pointerId: event.pointerId,
      touch: event.pointerType === "touch",
      startX: event.clientX,
      startY: event.clientY,
      origin: openRef.current === null ? 0 : restOffset(openRef.current, trays),
      axis: "undecided",
      dx: 0,
      samples: [{ x: event.clientX, time: event.timeStamp }],
      trays,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    if (gesture.axis === "undecided") {
      gesture.axis = swipeAxis(dx, event.clientY - gesture.startY);
      if (gesture.axis === "vertical") closeActions();
    }
    if (gesture.axis !== "horizontal" || !gesture.touch) return;
    gesture.dx = dx;
    gesture.samples = [...gesture.samples, { x: event.clientX, time: event.timeStamp }].slice(-SWIPE_SAMPLES);
    const width = event.currentTarget.clientWidth;
    const offset = swipeOffset(gesture.origin + dx, width, gesture.trays);
    showActions(moverRef.current, offset === 0 ? null : offset > 0 ? "right" : "left");
    moveCard(moverRef.current, `translateX(${offset}px)`, "none");
  };

  const endGesture = (event: PointerEvent<HTMLDivElement>): void => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    const mover = moverRef.current;
    if (event.type !== "pointerup") {
      settle(mover, "closed", gesture.trays);
      return;
    }
    if (gesture.axis === "horizontal" && gesture.touch) {
      const velocity = swipeVelocity([...gesture.samples, { x: event.clientX, time: event.timeStamp }]);
      const width = event.currentTarget.clientWidth;
      const offset = swipeOffset(gesture.origin + gesture.dx, width, gesture.trays);
      settle(mover, page === undefined ? "closed" : swipeRest(offset, gesture.trays, velocity), gesture.trays);
      return;
    }
    if (gesture.axis !== "undecided" || page === undefined) return;
    if (openRef.current !== null) {
      closeActions();
      return;
    }
    const tapped = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-swipe-page]") : null;
    const tappedIndex = pages.findIndex(({ id }) => id === tapped?.dataset["swipePage"]);
    if (tappedIndex !== -1 && tappedIndex !== current) {
      goTo(tappedIndex);
      return;
    }
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
      case "l":
        laterCurrent();
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

  const swipe: SwipeControls = {
    pages,
    current,
    page,
    goTo,
    close,
    done,
    pageDone: page !== undefined && done.has(page.id),
    toggleDone: toggleCurrentDone,
    later: laterCurrent,
    undoPending: undo !== null,
    undo: undoDone,
    copied,
    copy: copyCurrent,
    canShare,
    share: shareCurrent,
    expanded,
    toggleExpanded,
    speedOn,
    toggleSpeed,
    reading,
    playing,
    starting: startSoon,
    finished,
    togglePlaying,
    speed,
    changeSpeed,
    plan,
    step,
    blocks: shown,
  };
  const frame: SwipeFrame = {
    dialogRef,
    pagerRef,
    moverRef,
    onDialogClose: () => onClose(page?.card ?? pages.at(-1)?.card),
    act,
    nudging,
    pagerHandlers: { onScroll, onPointerDown, onPointerMove, onPointerUp: endGesture, onPointerCancel: endGesture },
  };
  return { swipe, frame };
}
