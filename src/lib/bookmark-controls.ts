import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { PageSettings } from "./custom.ts";
import { pendingDeletes, removeRequest } from "./deletions.ts";
import { DEPTHS, NARROW_SCREEN_QUERY, startingDepth, tappedDepth, type Depth } from "./depth.ts";
import { filterSearch, parseFilter, type Filter, type View } from "./filter.ts";
import { morph, prefersReducedMotion, stopMotion, type Anchor } from "./morph.ts";
import { dailyReview, localDay, type ReviewPick } from "./review.ts";
import { matchingIds, type SearchEntry } from "./search.ts";
import { readStored, STORAGE_PREFIX, writeStored } from "./storage.ts";
import {
  flyOffMs,
  fullSwipeDistance,
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
  undoAction: UndoAction | null;
  undo: () => void;
  deleteQueue: DeleteQueue;
  openSwipe: () => void;
};

export type UndoAction = "done" | "delete";

type PendingDelete = { id: string; url: string; headline: string; author: string };

export type DeleteQueue = {
  items: readonly PendingDelete[];
  copy: () => void;
  copied: boolean;
  restore: (id: string) => void;
};

type Swipe = {
  cards: HTMLElement[];
  start: number;
  done: ReadonlySet<string>;
  toggleDone: (id: string) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  deleteQueue: DeleteQueue;
  close: (last: HTMLElement | undefined) => void;
};

type CardAction = "done" | "delete";

const DONE_KEY = `${STORAGE_PREFIX}done`;
const DELETED_KEY = `${STORAGE_PREFIX}deleted`;
const REVIEW_KEY = `${STORAGE_PREFIX}review`;
const DEPTH_KEY = `${STORAGE_PREFIX}cards-depth`;
const UNDO_MS = 5000;
const COPIED_MS = 2000;
const SWIPE_CLICK_GUARD_MS = 400;
const SWIPE_SAMPLES = 6;
const SPRING_BACK = "transform 500ms var(--ease-spring)";
const FLY_OFF_EASING = "cubic-bezier(0.25, 0.4, 0.5, 1)";
const FLY_OFF_ACTION_MS = 220;
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

function storedDeleted(entries: readonly SearchEntry[]): Set<string> {
  return new Set(pendingDeletes(readStored(DELETED_KEY), new Set(entries.map(({ id }) => id))));
}

function pendingDelete(id: string): PendingDelete {
  const card = document.querySelector<HTMLElement>(`[data-bookmark-id="${CSS.escape(id)}"]`);
  return {
    id,
    url: card?.dataset["url"] ?? "",
    headline: card?.querySelector("[data-card-toggle]")?.textContent.trim() ?? "",
    author: card?.querySelector("[data-author]")?.textContent.trim() ?? "",
  };
}

function withId(ids: ReadonlySet<string>, id: string, present: boolean): Set<string> {
  const next = new Set(ids);
  if (present) next.add(id);
  else next.delete(id);
  return next;
}

function trays(card: HTMLElement): SwipeTrays {
  return { left: card.querySelector<HTMLElement>("[data-swipe-actions]")?.offsetWidth ?? 0, right: 0 };
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
  const [deleted, setDeleted] = useState(() => storedDeleted(entries));
  const [deleteRequestCopied, setDeleteRequestCopied] = useState(false);
  const [depth, setDepth] = useState(() =>
    startingDepth(readStored(DEPTH_KEY), window.matchMedia(NARROW_SCREEN_QUERY).matches, settings.detail),
  );
  const [undo, setUndo] = useState<{ id: string; action: UndoAction } | null>(null);
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
  const reviewIds = useMemo(
    () => new Set(review.map(({ id }) => id).filter((id) => !deleted.has(id))),
    [review, deleted],
  );
  const reasons = useMemo(() => new Map(review.map(({ id, reason }) => [id, reason])), [review]);
  const visible = useMemo(
    () => matchingIds({ entries, filter, triage: { done, review: reviewIds, deleted } }),
    [entries, filter, done, reviewIds, deleted],
  );
  const topicsInUse = useMemo(() => TOPICS.filter((t) => entries.some((entry) => entry.topic === t)), [entries]);

  const kept = entries.filter(({ id }) => !deleted.has(id));
  const doneCount = kept.filter(({ id }) => done.has(id)).length;
  const reviewedCount = [...reviewIds].filter((id) => done.has(id)).length;
  const counts: Record<View, number> = {
    today: reviewIds.size,
    inbox: kept.length - doneCount,
    done: doneCount,
    all: kept.length,
  };
  const deleteItems = useMemo(() => [...deleted].map(pendingDelete), [deleted]);

  useLayoutEffect(() => {
    doneRef.current = done;
    const showReasons = view === "today" && !searching;
    for (const card of cards()) {
      const id = card.dataset["bookmarkId"] ?? "";
      stopMotion(card);
      card.hidden = !visible.has(id);
      card.toggleAttribute("data-done", done.has(id));
      for (const toggle of card.querySelectorAll("[data-done-toggle]"))
        toggle.setAttribute("aria-pressed", String(done.has(id)));
      const reason = card.querySelector<HTMLElement>("[data-review-reason]");
      const text = showReasons ? reasons.get(id) : undefined;
      if (reason !== null) {
        reason.hidden = text === undefined;
        reason.textContent = text ?? "";
      }
      if (card.hasAttribute("data-swiped") && !card.hidden) {
        card.removeAttribute("data-swiped");
        delete card.dataset["actions"];
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
    writeStored(DELETED_KEY, [...deleted]);
  }, [deleted]);

  useEffect(() => {
    if (!deleteRequestCopied) return undefined;
    const timer = setTimeout(() => setDeleteRequestCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [deleteRequestCopied]);

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
        setDone((previous) => withId(previous, id, marking));
        setUndo(marking ? { id, action: "done" } : null);
      }),
    );
  }, []);

  const deleteCard = useCallback(
    (id: string): Promise<void> =>
      morph(() =>
        flushSync(() => {
          setDeleted((previous) => withId(previous, id, true));
          setUndo({ id, action: "delete" });
        }),
      ),
    [],
  );

  const restore = useCallback((id: string): void => {
    void morph(() =>
      flushSync(() => {
        setDeleted((previous) => withId(previous, id, false));
        if (undoRef.current?.id === id) setUndo(null);
      }),
    );
  }, []);

  const undoLast = useCallback((): void => {
    const pending = undoRef.current;
    if (pending === null) return;
    const change = pending.action === "done" ? setDone : setDeleted;
    void morph(() =>
      flushSync(() => {
        change((previous) => withId(previous, pending.id, false));
        setUndo(null);
      }),
    );
  }, []);

  const copyDeleteRequest = useCallback((): void => {
    navigator.clipboard.writeText(removeRequest(deleteItems.map(({ url }) => url))).then(
      () => setDeleteRequestCopied(true),
      () => setDeleteRequestCopied(false),
    );
  }, [deleteItems]);

  const deleteQueue: DeleteQueue = {
    items: deleteItems,
    copy: copyDeleteRequest,
    copied: deleteRequestCopied,
    restore,
  };

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
      open: boolean;
      axis: SwipeAxis;
      dx: number;
      samples: SwipeSample[];
      trays: SwipeTrays;
    } | null = null;
    let clicksBlockedUntil = 0;

    const moveSurface = (surface: HTMLElement, offset: number, transition: string): void => {
      surface.style.transition = prefersReducedMotion() ? "" : transition;
      surface.style.transform = offset === 0 ? "" : `translateX(${offset}px)`;
    };

    const closeActions = (card: HTMLElement): void => {
      delete card.dataset["actions"];
      card.removeAttribute("data-swiping");
      const surface = card.querySelector<HTMLElement>("[data-swipe-surface]");
      if (surface !== null) moveSurface(surface, 0, SPRING_BACK);
    };

    const act = (card: HTMLElement, action: CardAction): Promise<void> => {
      const id = card.dataset["bookmarkId"] ?? "";
      return action === "done" ? toggleDone(id) : deleteCard(id);
    };

    const flyOff = (card: HTMLElement, action: CardAction, ms: number): void => {
      const surface = card.querySelector<HTMLElement>("[data-swipe-surface]");
      card.toggleAttribute("data-swiped", true);
      if (surface !== null) {
        surface.style.transition = ms === 0 ? "" : `transform ${ms}ms ${FLY_OFF_EASING}`;
        surface.style.transform = "translateX(-100%)";
      }
      setTimeout(() => void act(card, action), ms);
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (!event.isPrimary || !(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>("[data-bookmark-id]");
      for (const other of document.querySelectorAll<HTMLElement>("[data-bookmark-id][data-actions]")) {
        if (other !== card) closeActions(other);
      }
      const surface = card?.querySelector<HTMLElement>("[data-swipe-surface]");
      if (card === null || card === undefined || surface === null || surface === undefined) return;
      if (card.hasAttribute("data-swiped") || event.pointerType !== "touch") return;
      if (event.target.closest("[data-swipe-actions]") !== null) return;
      const origin = Math.min(surfaceOffset(surface), 0);
      const open = card.dataset["actions"] === "left";
      surface.style.transition = "none";
      surface.style.transform = origin === 0 ? "" : `translateX(${origin}px)`;
      swipe = {
        card,
        surface,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin,
        open,
        axis: origin === 0 || open ? "undecided" : "horizontal",
        dx: 0,
        samples: [{ x: event.clientX, time: event.timeStamp }],
        trays: trays(card),
      };
      if (origin !== 0) card.dataset["swiping"] = "left";
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (swipe === null || swipe.pointerId !== event.pointerId) return;
      const dx = event.clientX - swipe.startX;
      if (swipe.axis === "undecided") {
        swipe.axis = swipeAxis(dx, event.clientY - swipe.startY);
        if (swipe.axis === "vertical") {
          if (swipe.open) closeActions(swipe.card);
          swipe = null;
          return;
        }
      }
      if (swipe.axis !== "horizontal") return;
      swipe.dx = dx;
      swipe.samples = [...swipe.samples, { x: event.clientX, time: event.timeStamp }].slice(-SWIPE_SAMPLES);
      const width = swipe.card.offsetWidth;
      const offset = swipeOffset(swipe.origin + dx, width, swipe.trays);
      if (offset >= 0) swipe.card.removeAttribute("data-swiping");
      else swipe.card.dataset["swiping"] = offset <= -fullSwipeDistance(width, swipe.trays) ? "full" : "left";
      swipe.surface.style.transform = `translateX(${offset}px)`;
    };

    const holdSwipeFromScrolling = (event: TouchEvent): void => {
      if (swipe?.axis === "horizontal" && event.cancelable) event.preventDefault();
    };

    const endSwipe = (event: PointerEvent): void => {
      if (swipe === null || swipe.pointerId !== event.pointerId) return;
      const { card, surface, axis, dx, origin, open, samples } = swipe;
      const cardTrays = swipe.trays;
      swipe = null;
      if (axis === "undecided" && open) {
        clicksBlockedUntil = event.timeStamp + SWIPE_CLICK_GUARD_MS;
        closeActions(card);
        return;
      }
      if (axis !== "horizontal") return;
      clicksBlockedUntil = event.timeStamp + SWIPE_CLICK_GUARD_MS;
      card.removeAttribute("data-swiping");
      const width = card.offsetWidth;
      const offset = swipeOffset(origin + dx, width, cardTrays);
      const velocity = swipeVelocity([...samples, { x: event.clientX, time: event.timeStamp }]);
      const rest = event.type === "pointerup" ? swipeRest(offset, width, cardTrays, velocity) : "closed";
      if (rest === "full") {
        flyOff(card, "done", prefersReducedMotion() ? 0 : flyOffMs(width + offset, velocity));
        return;
      }
      if (rest === "left") card.dataset["actions"] = "left";
      else delete card.dataset["actions"];
      moveSurface(surface, restOffset(rest, cardTrays), SPRING_BACK);
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
      const trayAction = event.target.closest<HTMLElement>("[data-swipe-action]")?.dataset["swipeAction"];
      if (trayAction === "done" || trayAction === "delete") {
        flyOff(card, trayAction, prefersReducedMotion() ? 0 : FLY_OFF_ACTION_MS);
        return;
      }
      if (event.target.closest("[data-done-toggle]") !== null) void act(card, "done");
      if (event.target.closest("[data-delete]") !== null) void act(card, "delete");
      if (event.target.closest("[data-card-head]") !== null) toggleCard(card);
    };

    const actOnFocused = (current: HTMLElement | null, shown: HTMLElement[], action: CardAction): void => {
      if (current === null) return;
      const index = shown.indexOf(current);
      const neighbor = shown[index + 1] ?? shown[index - 1];
      const settled = act(current, action);
      if (!current.hidden && !current.inert) return;
      neighbor?.querySelector<HTMLElement>("[data-card-toggle]")?.focus({ preventScroll: true });
      void settled.then(() => focusCard(neighbor));
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
        case "e":
          actOnFocused(current, shown, "done");
          break;
        case "#":
          actOnFocused(current, shown, "delete");
          break;
        case "c":
          copyFrom(current?.querySelector<HTMLElement>("[data-copy]"));
          break;
        case "u":
          undoLast();
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
    document.addEventListener("touchmove", holdSwipeFromScrolling, { passive: false });
    document.addEventListener("pointerup", endSwipe);
    document.addEventListener("pointercancel", endSwipe);
    return () => {
      document.removeEventListener("click", blockClickAfterSwipe, true);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("touchmove", holdSwipeFromScrolling);
      document.removeEventListener("pointerup", endSwipe);
      document.removeEventListener("pointercancel", endSwipe);
    };
  }, [changeDepth, deleteCard, openSwipe, toggleCard, toggleDone, undoLast]);

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
    reviewSize: reviewIds.size,
    undoPending: undo !== null,
    undoAction: undo?.action ?? null,
    undo: undoLast,
    deleteQueue,
    openSwipe,
  };
  const swipe: Swipe | null =
    swiping === null ? null : { ...swiping, done, toggleDone, deleteCard, deleteQueue, close: closeSwipe };
  return { controls, swipe };
}
