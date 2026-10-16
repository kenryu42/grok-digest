import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { PageSettings } from "./custom.ts";
import { DEPTHS, NARROW_SCREEN_QUERY, startingDepth, tappedDepth, type Depth } from "./depth.ts";
import { filterSearch, parseFilter, type Filter, type View } from "./filter.ts";
import { morph, prefersReducedMotion, stopMotion, type Anchor } from "./morph.ts";
import { dailyReview, localDay, type ReviewPick } from "./review.ts";
import { matchingIds, type SearchEntry } from "./search.ts";
import { readStored, STORAGE_PREFIX, writeStored } from "./storage.ts";
import {
  flyOffMs,
  swipeAxis,
  swipeCommits,
  swipeOffset,
  swipeVelocity,
  type SwipeAxis,
  type SwipeSample,
} from "./swipe.ts";
import { TOPICS, type Topic } from "./topics.ts";

type Props = {
  entries: SearchEntry[];
  settings: PageSettings;
};

export type Controls = {
  settings: PageSettings;
  view: View;
  counts: Record<View, number>;
  chooseView: (view: View) => void;
  query: string;
  searching: boolean;
  setQuery: (query: string) => void;
  searchShown: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  leaveSearch: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  topic: Topic | null;
  topics: readonly Topic[];
  chooseTopic: (topic: Topic | null) => void;
  topicsRef: RefObject<HTMLFieldSetElement | null>;
  depth: Depth;
  setDepth: (depth: Depth) => void;
  detailShown: boolean;
  toggleDetail: () => void;
  barRef: RefObject<HTMLDivElement | null>;
  shown: number;
  reviewed: number;
  reviewSize: number;
  undoPending: boolean;
  undo: () => void;
  openSwipe: () => void;
};

type Swipe = {
  cards: HTMLElement[];
  start: number;
  done: ReadonlySet<string>;
  toggleDone: (id: string) => Promise<void>;
  close: (last: HTMLElement | undefined) => void;
};

const DONE_KEY = `${STORAGE_PREFIX}done`;
const REVIEW_KEY = `${STORAGE_PREFIX}review`;
const DEPTH_KEY = `${STORAGE_PREFIX}cards-depth`;
const UNDO_MS = 5000;
const SWIPE_CLICK_GUARD_MS = 400;
const SWIPE_SAMPLES = 6;
const SPRING_BACK = "transform 500ms var(--ease-spring)";
const FLY_OFF_EASING = "cubic-bezier(0.25, 0.4, 0.5, 1)";
const TOUCH_PRESS_DELAY_MS = 80;
const PRESS_SHOWN_MS = 120;
const ANCHOR_GAP = 12;

const FORM_FIELDS = "input, textarea, select, [contenteditable]";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStoredReview(value: unknown): value is { day: string; picks: ReviewPick[] } {
  if (typeof value !== "object" || value === null || !("day" in value) || !("picks" in value)) return false;
  const { day, picks } = value;
  return (
    typeof day === "string" &&
    Array.isArray(picks) &&
    picks.every(
      (pick: unknown) =>
        typeof pick === "object" &&
        pick !== null &&
        "id" in pick &&
        "reason" in pick &&
        typeof pick.id === "string" &&
        typeof pick.reason === "string",
    )
  );
}

function storedDone(): Set<string> {
  const stored = readStored(DONE_KEY);
  return new Set(isStringArray(stored) ? stored : []);
}

function todaysReview(entries: readonly SearchEntry[], done: ReadonlySet<string>, size: number): ReviewPick[] {
  const today = localDay(new Date());
  const stored = readStored(REVIEW_KEY);
  if (isStoredReview(stored) && stored.day === today) {
    const ids = new Set(entries.map(({ id }) => id));
    return stored.picks.filter(({ id }) => ids.has(id));
  }
  const picks = dailyReview({ bookmarks: entries, done, today, size });
  writeStored(REVIEW_KEY, { day: today, picks });
  return picks;
}

function linkedCard(): HTMLElement | null {
  const target = window.location.hash.slice(1);
  return target === "" ? null : document.querySelector<HTMLElement>(`[data-bookmark-id][id="${CSS.escape(target)}"]`);
}

function initialFilter(defaults: { view: View; reviewIsEmpty: boolean }): Filter {
  const filter = parseFilter(window.location.search, defaults);
  return linkedCard() === null ? filter : { ...filter, view: "all" };
}

function cards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-bookmark-id]")];
}

function focusCard(card: HTMLElement | undefined): void {
  if (card === undefined) return;
  card.querySelector<HTMLElement>("[data-card-toggle]")?.focus({ preventScroll: true });
  card.scrollIntoView({ block: "start" });
}

function showDepths(listDepth: Depth, opened: ReadonlyMap<string, Depth>): void {
  for (const card of cards()) {
    const shown = opened.get(card.dataset["bookmarkId"] ?? "") ?? listDepth;
    card.dataset["depth"] = shown;
    card.querySelector("[data-card-toggle]")?.setAttribute("aria-expanded", String(shown === "full"));
  }
}

function surfaceOffset(surface: HTMLElement): number {
  return new DOMMatrixReadOnly(getComputedStyle(surface).transform).m41;
}

const COPY_LABEL = "Copy";
const COPY_RESET_MS = 2000;
const copyResets = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function showCopyResult(button: HTMLElement, copied: boolean): void {
  const label = button.querySelector("[data-copy-label]");
  if (label !== null) label.textContent = copied ? "Copied" : "Couldn't copy";
  button.toggleAttribute("data-copied", copied);
  clearTimeout(copyResets.get(button));
  copyResets.set(
    button,
    setTimeout(() => {
      if (label !== null) label.textContent = COPY_LABEL;
      button.removeAttribute("data-copied");
    }, COPY_RESET_MS),
  );
}

function copyFrom(button: HTMLElement | null | undefined): void {
  if (button === null || button === undefined) return;
  navigator.clipboard.writeText(button.dataset["copy"] ?? "").then(
    () => showCopyResult(button, true),
    () => showCopyResult(button, false),
  );
}

export function useBookmarkControls({ entries, settings }: Props) {
  const [review] = useState(() => todaysReview(entries, storedDone(), settings.reviewSize));
  const reviewIsEmpty = review.length === 0;
  const viewDefaults = useMemo(
    () => ({ view: settings.defaultView, reviewIsEmpty }),
    [settings.defaultView, reviewIsEmpty],
  );
  const [filter, setFilter] = useState(() => initialFilter(viewDefaults));
  const [done, setDone] = useState(storedDone);
  const [depth, setDepth] = useState(() =>
    startingDepth(readStored(DEPTH_KEY), window.matchMedia(NARROW_SCREEN_QUERY).matches, settings.detail),
  );
  const [undo, setUndo] = useState<{ id: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [swiping, setSwiping] = useState<{ cards: HTMLElement[]; start: number } | null>(null);
  const [depthOpen, setDepthOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const topicsRef = useRef<HTMLFieldSetElement>(null);
  const doneRef = useRef(done);
  const undoRef = useRef(undo);
  const depthRef = useRef(depth);
  const openedRef = useRef(new Map<string, Depth>());

  const { query, topic, view } = filter;
  const searching = query.trim() !== "";
  const showSearch = searchOpen || query !== "";
  const reviewIds = useMemo(() => new Set(review.map(({ id }) => id)), [review]);
  const reasons = useMemo(() => new Map(review.map(({ id, reason }) => [id, reason])), [review]);
  const visible = useMemo(
    () => matchingIds({ entries, filter, triage: { done, review: reviewIds } }),
    [entries, filter, done, reviewIds],
  );
  const topicsInUse = useMemo(() => TOPICS.filter((t) => entries.some((entry) => entry.topic === t)), [entries]);

  const doneCount = entries.filter(({ id }) => done.has(id)).length;
  const reviewedCount = review.filter(({ id }) => done.has(id)).length;
  const counts: Record<View, number> = {
    today: review.length,
    inbox: entries.length - doneCount,
    done: doneCount,
    all: entries.length,
  };

  useLayoutEffect(() => {
    doneRef.current = done;
    const showReasons = view === "today" && !searching;
    for (const card of cards()) {
      const id = card.dataset["bookmarkId"] ?? "";
      stopMotion(card);
      card.hidden = !visible.has(id);
      card.toggleAttribute("data-done", done.has(id));
      card.querySelector("[data-done-toggle]")?.setAttribute("aria-pressed", String(done.has(id)));
      const reason = card.querySelector<HTMLElement>("[data-review-reason]");
      const text = showReasons ? reasons.get(id) : undefined;
      if (reason !== null) {
        reason.hidden = text === undefined;
        reason.textContent = text ?? "";
      }
      if (card.hasAttribute("data-swiped") && !card.hidden) {
        card.removeAttribute("data-swiped");
        const surface = card.querySelector<HTMLElement>("[data-swipe-surface]");
        if (surface !== null) {
          surface.style.transition = prefersReducedMotion() ? "" : SPRING_BACK;
          surface.style.transform = "";
        }
      }
    }
  }, [visible, done, reasons, view, searching]);

  useEffect(() => {
    writeStored(DONE_KEY, [...done]);
  }, [done]);

  useEffect(() => {
    undoRef.current = undo;
    if (undo === null) return undefined;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (bar === null) return undefined;
    const publishHeight = (): void => {
      document.documentElement.style.setProperty("--controls-height", `${bar.offsetHeight}px`);
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const row = topicsRef.current;
    const chip = topic === null ? row?.firstElementChild : row?.querySelector(`[data-topic="${topic}"]`);
    if (row === null || row === undefined || !(chip instanceof HTMLElement)) return;
    row.scrollTo({
      left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [topic]);

  useEffect(() => {
    const next = `${window.location.pathname}${filterSearch(filter, viewDefaults)}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== next) window.history.replaceState(null, "", next);
  }, [filter, viewDefaults]);

  const coveredTop = useCallback(
    (): number => Math.max(barRef.current?.getBoundingClientRect().bottom ?? 0, 0) + ANCHOR_GAP,
    [],
  );

  const anchorAt = useCallback(
    (card: HTMLElement | undefined): Anchor | undefined =>
      card === undefined ? undefined : { element: card, top: Math.max(card.getBoundingClientRect().top, coveredTop()) },
    [coveredTop],
  );

  const topCard = useCallback((): HTMLElement | undefined => {
    const top = coveredTop() - ANCHOR_GAP;
    const shown = cards().filter((card) => !card.hidden && !card.inert && card.getBoundingClientRect().bottom > top);
    return shown.find((card) => card.getBoundingClientRect().top >= top) ?? shown[0];
  }, [coveredTop]);

  const changeDepth = useCallback(
    (next: Depth): void => {
      if (next === depthRef.current) return;
      depthRef.current = next;
      openedRef.current.clear();
      writeStored(DEPTH_KEY, next);
      void morph(() => {
        flushSync(() => setDepth(next));
        showDepths(next, openedRef.current);
      }, anchorAt(topCard()));
    },
    [anchorAt, topCard],
  );

  const toggleCard = useCallback(
    (card: HTMLElement): void => {
      const id = card.dataset["bookmarkId"] ?? "";
      const next = tappedDepth(openedRef.current.get(id) ?? depthRef.current, depthRef.current);
      if (next === depthRef.current) openedRef.current.delete(id);
      else openedRef.current.set(id, next);
      void morph(() => showDepths(depthRef.current, openedRef.current), anchorAt(card));
    },
    [anchorAt],
  );

  const toggleDone = useCallback((id: string): Promise<void> => {
    const marking = !doneRef.current.has(id);
    return morph(() =>
      flushSync(() => {
        setDone((previous) => {
          const next = new Set(previous);
          if (marking) next.add(id);
          else next.delete(id);
          return next;
        });
        setUndo(marking ? { id } : null);
      }),
    );
  }, []);

  const undoDone = useCallback((): void => {
    const pending = undoRef.current;
    if (pending === null) return;
    void morph(() =>
      flushSync(() => {
        setDone((previous) => {
          const next = new Set(previous);
          next.delete(pending.id);
          return next;
        });
        setUndo(null);
      }),
    );
  }, []);

  const openSwipe = useCallback((): void => {
    if (!settings.swipeMode) return;
    const shown = cards().filter((card) => !card.hidden && !card.inert);
    if (shown.length === 0) return;
    const top = topCard();
    setSwiping({
      cards: shown,
      start: top === undefined ? 0 : Math.max(shown.indexOf(top), 0),
    });
  }, [settings.swipeMode, topCard]);

  const closeSwipe = useCallback((last: HTMLElement | undefined): void => {
    setSwiping(null);
    if (last !== undefined && !last.hidden) last.scrollIntoView({ block: "start" });
  }, []);

  useLayoutEffect(() => {
    const linked = linkedCard();
    if (linked !== null) openedRef.current.set(linked.dataset["bookmarkId"] ?? "", "full");
    showDepths(depthRef.current, openedRef.current);
    document.querySelector("[data-bookmark-list]")?.toggleAttribute("data-ready", true);
    linked?.scrollIntoView({ block: "start" });
  }, []);

  useEffect(() => {
    let swipe: {
      card: HTMLElement;
      surface: HTMLElement;
      pointerId: number;
      startX: number;
      startY: number;
      origin: number;
      axis: SwipeAxis;
      dx: number;
      samples: SwipeSample[];
    } | null = null;
    let press: { card: HTMLElement; pointerId: number; timer: ReturnType<typeof setTimeout> } | null = null;
    let clicksBlockedUntil = 0;

    const releasePress = (shown: boolean): void => {
      if (press === null) return;
      const { card, timer } = press;
      press = null;
      clearTimeout(timer);
      if (!shown) {
        card.removeAttribute("data-pressed");
        return;
      }
      card.toggleAttribute("data-pressed", true);
      setTimeout(() => card.removeAttribute("data-pressed"), PRESS_SHOWN_MS);
    };

    const springBack = (surface: HTMLElement): void => {
      surface.style.transition = prefersReducedMotion() ? "" : SPRING_BACK;
      surface.style.transform = "";
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (!event.isPrimary || !(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>("[data-bookmark-id]");
      const surface = card?.querySelector<HTMLElement>("[data-swipe-surface]");
      if (card === null || card === undefined || surface === null || surface === undefined) return;
      if (card.hasAttribute("data-swiped")) return;
      if (event.target.closest("[data-card-head]") !== null) {
        const pressed = card;
        press = {
          card,
          pointerId: event.pointerId,
          timer: setTimeout(
            () => pressed.toggleAttribute("data-pressed", true),
            event.pointerType === "touch" ? TOUCH_PRESS_DELAY_MS : 0,
          ),
        };
      }
      if (event.pointerType !== "touch") return;
      const origin = Math.min(surfaceOffset(surface), 0);
      surface.style.transition = "none";
      surface.style.transform = origin === 0 ? "" : `translateX(${origin}px)`;
      swipe = {
        card,
        surface,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin,
        axis: origin === 0 ? "undecided" : "horizontal",
        dx: 0,
        samples: [{ x: event.clientX, time: event.timeStamp }],
      };
      if (origin !== 0) card.toggleAttribute("data-swiping", true);
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (swipe === null || swipe.pointerId !== event.pointerId) return;
      const dx = event.clientX - swipe.startX;
      if (swipe.axis === "undecided") {
        swipe.axis = swipeAxis(dx, event.clientY - swipe.startY);
        if (swipe.axis !== "undecided") releasePress(false);
        if (swipe.axis === "vertical") {
          swipe = null;
          return;
        }
        if (swipe.axis === "horizontal") swipe.card.toggleAttribute("data-swiping", true);
      }
      if (swipe.axis !== "horizontal") return;
      swipe.dx = dx;
      swipe.samples = [...swipe.samples, { x: event.clientX, time: event.timeStamp }].slice(-SWIPE_SAMPLES);
      swipe.surface.style.transform = `translateX(${swipeOffset(swipe.origin + dx, swipe.card.offsetWidth)}px)`;
    };

    const endSwipe = (event: PointerEvent): void => {
      if (press?.pointerId === event.pointerId) releasePress(event.type === "pointerup");
      if (swipe === null || swipe.pointerId !== event.pointerId) return;
      const { card, surface, axis, dx, origin, samples } = swipe;
      swipe = null;
      if (axis !== "horizontal") return;
      clicksBlockedUntil = event.timeStamp + SWIPE_CLICK_GUARD_MS;
      card.removeAttribute("data-swiping");
      const width = card.offsetWidth;
      const velocity = swipeVelocity([...samples, { x: event.clientX, time: event.timeStamp }]);
      const commits = event.type === "pointerup" && swipeCommits(origin + dx, width, velocity);
      if (!commits) {
        springBack(surface);
        return;
      }
      card.toggleAttribute("data-swiped", true);
      const ms = prefersReducedMotion() ? 0 : flyOffMs(width + swipeOffset(origin + dx, width), velocity);
      surface.style.transition = ms === 0 ? "" : `transform ${ms}ms ${FLY_OFF_EASING}`;
      surface.style.transform = "translateX(-100%)";
      setTimeout(() => void toggleDone(card.dataset["bookmarkId"] ?? ""), ms);
    };

    const blockClickAfterSwipe = (event: MouseEvent): void => {
      if (event.timeStamp > clicksBlockedUntil) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) return;
      copyFrom(event.target.closest<HTMLElement>("[data-copy]"));
      const card = event.target.closest<HTMLElement>("[data-bookmark-id]");
      if (card === null) return;
      if (event.target.closest("[data-done-toggle]") !== null) void toggleDone(card.dataset["bookmarkId"] ?? "");
      if (event.target.closest("[data-card-head]") !== null) toggleCard(card);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector("dialog[open]") !== null) return;
      if (event.target instanceof HTMLElement && event.target.closest(FORM_FIELDS) !== null) {
        if (event.key === "Escape") event.target.blur();
        return;
      }
      const shown = cards().filter((card) => !card.hidden);
      const current = document.activeElement?.closest<HTMLElement>("[data-bookmark-id]") ?? null;
      const index = current === null ? -1 : shown.indexOf(current);
      switch (event.key) {
        case "j":
          focusCard(shown[Math.min(index + 1, shown.length - 1)]);
          break;
        case "k":
          focusCard(shown[Math.max(index - 1, 0)]);
          break;
        case "e": {
          if (current === null) return;
          const neighbor = shown[index + 1] ?? shown[index - 1];
          const settled = toggleDone(current.dataset["bookmarkId"] ?? "");
          if (!current.hidden && !current.inert) break;
          neighbor?.querySelector<HTMLElement>("[data-card-toggle]")?.focus({ preventScroll: true });
          void settled.then(() => focusCard(neighbor));
          break;
        }
        case "c":
          copyFrom(current?.querySelector<HTMLElement>("[data-copy]"));
          break;
        case "u":
          undoDone();
          break;
        case "o": {
          const url = current?.dataset["url"];
          if (url !== undefined) window.open(url, "_blank", "noopener,noreferrer");
          break;
        }
        case "/":
          flushSync(() => setSearchOpen(true));
          searchRef.current?.focus();
          break;
        case "s":
          openSwipe();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          changeDepth(DEPTHS[Number(event.key) - 1] ?? depthRef.current);
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    document.addEventListener("click", blockClickAfterSwipe, true);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", endSwipe);
    document.addEventListener("pointercancel", endSwipe);
    return () => {
      document.removeEventListener("click", blockClickAfterSwipe, true);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", endSwipe);
      document.removeEventListener("pointercancel", endSwipe);
    };
  }, [changeDepth, openSwipe, toggleCard, toggleDone, undoDone]);

  useEffect(() => {
    if (!depthOpen) return undefined;
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && barRef.current?.contains(event.target) !== true) setDepthOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [depthOpen]);

  const update = (change: Partial<Filter>): void => setFilter((previous) => ({ ...previous, ...change }));

  const openSearch = (): void => {
    flushSync(() => setSearchOpen(true));
    searchRef.current?.focus();
  };

  const closeSearch = (): void => {
    setSearchOpen(false);
    update({ query: "" });
  };

  const controls: Controls = {
    settings,
    view,
    counts,
    chooseView: (next) => update({ view: next, query: "" }),
    query,
    searching,
    setQuery: (next) => update({ query: next }),
    searchShown: showSearch,
    openSearch,
    closeSearch,
    leaveSearch: () => {
      if (query === "") setSearchOpen(false);
    },
    searchRef,
    topic,
    topics: topicsInUse,
    chooseTopic: (next) => update({ topic: next === topic ? null : next }),
    topicsRef,
    depth,
    setDepth: changeDepth,
    detailShown: depthOpen,
    toggleDetail: () => setDepthOpen(!depthOpen),
    barRef,
    shown: visible.size,
    reviewed: reviewedCount,
    reviewSize: review.length,
    undoPending: undo !== null,
    undo: undoDone,
    openSwipe,
  };
  const swipe: Swipe | null = swiping === null ? null : { ...swiping, done, toggleDone, close: closeSwipe };
  return { controls, swipe };
}
