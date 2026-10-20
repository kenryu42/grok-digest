import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { PageSettings } from "./custom.ts";
import { DEFAULT_FILTER, filterSearch, parseFilter, type Filter, type Sort, type SourceFilter } from "./filter.ts";
import { morph, prefersReducedMotion, stopMotion, type Anchor } from "./morph.ts";
import { matchingIds, sortedIds, type SearchEntry } from "./search.ts";
import { removeRequest } from "./remove-request.ts";
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

type Props = {
  entries: SearchEntry[];
  settings: PageSettings;
};

export type Controls = {
  settings: PageSettings;
  counts: { toRead: number; done: number };
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
  sort: Sort;
  chooseSort: (sort: Sort) => void;
  showDone: boolean;
  setShowDone: (showDone: boolean) => void;
  hasScans: boolean;
  source: SourceFilter;
  chooseSource: (source: SourceFilter) => void;
  filtersShown: boolean;
  toggleFilters: () => void;
  filtersChanged: boolean;
  barRef: RefObject<HTMLDivElement | null>;
  shown: number;
  shownDone: number;
  undoPending: boolean;
  undo: () => void;
  copyDoneRequest: () => void;
  doneRequestCopied: boolean;
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

function storedDone(): Set<string> {
  const stored = readStored(DONE_KEY);
  return new Set(isStringArray(stored) ? stored : []);
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

function returnSwiped(card: HTMLElement): void {
  if (!card.hasAttribute("data-swiped") || card.hidden) return;
  card.removeAttribute("data-swiped");
  delete card.dataset["actions"];
  const surface = card.querySelector<HTMLElement>("[data-swipe-surface]");
  if (surface === null) return;
  surface.style.transition = prefersReducedMotion() ? "" : SPRING_BACK;
  surface.style.transform = "";
}

function centerActions(card: HTMLElement): void {
  const actions = card.querySelector<HTMLElement>("[data-swipe-actions]");
  if (actions === null) return;
  const box = card.getBoundingClientRect();
  const top = Math.max(0, -box.top);
  const bottom = Math.min(box.height, window.innerHeight - box.top);
  actions.style.top = `${top}px`;
  actions.style.height = `${Math.max(bottom - top, 0)}px`;
}

function linkedCard(): HTMLElement | null {
  const target = window.location.hash.slice(1);
  return target === "" ? null : document.querySelector<HTMLElement>(`[data-bookmark-id][id="${CSS.escape(target)}"]`);
}

function initialFilter(): Filter {
  const filter = parseFilter(window.location.search);
  const linked = linkedCard()?.dataset["bookmarkId"];
  return linked === undefined ? filter : { ...filter, showDone: filter.showDone || storedDone().has(linked) };
}

function cards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-bookmark-id]")];
}

function focusCard(card: HTMLElement | undefined): void {
  if (card === undefined) return;
  card.querySelector<HTMLElement>("[data-card-toggle]")?.focus({ preventScroll: true });
  card.scrollIntoView({ block: "start" });
}

function showOpened(opened: ReadonlySet<string>): void {
  for (const card of cards()) {
    const open = opened.has(card.dataset["bookmarkId"] ?? "");
    card.dataset["depth"] = open ? "full" : "headline";
    card.querySelector("[data-card-toggle]")?.setAttribute("aria-expanded", String(open));
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
  const [filter, setFilter] = useState(initialFilter);
  const [done, setDone] = useState(storedDone);
  const [doneRequestCopied, setDoneRequestCopied] = useState(false);
  const [undo, setUndo] = useState<{ id: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [swiping, setSwiping] = useState<{ cards: HTMLElement[]; start: number } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const topicsRef = useRef<HTMLFieldSetElement>(null);
  const doneRef = useRef(done);
  const undoRef = useRef(undo);
  const openedRef = useRef(new Set<string>());

  const { query, topic, sort, showDone, source } = filter;
  const searching = query.trim() !== "";
  const showSearch = searchOpen || query !== "";
  const visible = useMemo(() => matchingIds({ entries, filter, done }), [entries, filter, done]);
  const order = useMemo(() => sortedIds(entries, sort), [entries, sort]);
  const topicsInUse = useMemo(() => TOPICS.filter((t) => entries.some((entry) => entry.topic === t)), [entries]);
  const hasScans = useMemo(() => entries.some((entry) => entry.source === "scan"), [entries]);

  const doneCount = entries.filter(({ id }) => done.has(id)).length;
  const shownDone = [...visible].filter((id) => done.has(id)).length;
  const counts = { toRead: entries.length - doneCount, done: doneCount };

  useLayoutEffect(() => {
    const list = document.querySelector("[data-bookmark-list]");
    const byId = new Map(cards().map((card) => [card.dataset["bookmarkId"] ?? "", card]));
    for (const id of order) {
      const card = byId.get(id);
      if (card === undefined) continue;
      list?.append(card);
      returnSwiped(card);
    }
  }, [order]);

  useLayoutEffect(() => {
    doneRef.current = done;
    for (const card of cards()) {
      const id = card.dataset["bookmarkId"] ?? "";
      stopMotion(card);
      card.hidden = !visible.has(id);
      card.toggleAttribute("data-done", done.has(id));
      for (const toggle of card.querySelectorAll("[data-done-toggle]"))
        toggle.setAttribute("aria-pressed", String(done.has(id)));
      returnSwiped(card);
    }
  }, [visible, done]);

  useEffect(() => {
    writeStored(DONE_KEY, [...done]);
  }, [done]);

  useEffect(() => {
    if (!doneRequestCopied) return undefined;
    const timer = setTimeout(() => setDoneRequestCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [doneRequestCopied]);

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
    const next = `${window.location.pathname}${filterSearch(filter)}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== next) window.history.replaceState(null, "", next);
  }, [filter]);

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

  const toggleCard = useCallback(
    (card: HTMLElement): void => {
      const id = card.dataset["bookmarkId"] ?? "";
      if (!openedRef.current.delete(id)) openedRef.current.add(id);
      void morph(() => showOpened(openedRef.current), anchorAt(card));
    },
    [anchorAt],
  );

  const toggleDone = useCallback((id: string): Promise<void> => {
    const marking = !doneRef.current.has(id);
    return morph(() =>
      flushSync(() => {
        setDone((previous) => withId(previous, id, marking));
        setUndo(marking ? { id } : null);
      }),
    );
  }, []);

  const undoDone = useCallback((): void => {
    const pending = undoRef.current;
    if (pending === null) return;
    void morph(() =>
      flushSync(() => {
        setDone((previous) => withId(previous, pending.id, false));
        setUndo(null);
      }),
    );
  }, []);

  const copyDoneRequest = (): void => {
    const urls = cards()
      .filter((card) => done.has(card.dataset["bookmarkId"] ?? ""))
      .map((card) => card.dataset["url"] ?? "");
    navigator.clipboard.writeText(removeRequest(urls)).then(
      () => setDoneRequestCopied(true),
      () => setDoneRequestCopied(false),
    );
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
    if (linked !== null) openedRef.current.add(linked.dataset["bookmarkId"] ?? "");
    showOpened(openedRef.current);
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

    const markDone = (card: HTMLElement): Promise<void> => toggleDone(card.dataset["bookmarkId"] ?? "");

    const flyOff = (card: HTMLElement, ms: number): void => {
      const surface = card.querySelector<HTMLElement>("[data-swipe-surface]");
      card.toggleAttribute("data-swiped", true);
      if (surface !== null) {
        surface.style.transition = ms === 0 ? "" : `transform ${ms}ms ${FLY_OFF_EASING}`;
        surface.style.transform = "translateX(-100%)";
      }
      setTimeout(() => void markDone(card), ms);
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
      if (!open) centerActions(card);
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
      else swipe.card.dataset["swiping"] = "left";
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
      const rest = event.type === "pointerup" ? swipeRest(offset, cardTrays, velocity) : "closed";
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
      if (event.target.closest("[data-open-swipe]") !== null) openSwipe();
      const card = event.target.closest<HTMLElement>("[data-bookmark-id]");
      if (card === null) return;
      if (event.target.closest("[data-swipe-action]") !== null) {
        flyOff(card, prefersReducedMotion() ? 0 : FLY_OFF_ACTION_MS);
        return;
      }
      if (event.target.closest("[data-done-toggle]") !== null) void markDone(card);
      if (event.target.closest("[data-card-head]") !== null) toggleCard(card);
    };

    const markFocusedDone = (current: HTMLElement | null, shown: HTMLElement[]): void => {
      if (current === null) return;
      const index = shown.indexOf(current);
      const neighbor = shown[index + 1] ?? shown[index - 1];
      const settled = markDone(current);
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
          markFocusedDone(current, shown);
          break;
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
  }, [openSwipe, toggleCard, toggleDone, undoDone]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && barRef.current?.contains(event.target) !== true) setFiltersOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [filtersOpen]);

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
    counts,
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
    sort,
    chooseSort: (next) => {
      update({ sort: next });
      window.scrollTo({ top: 0 });
    },
    showDone,
    setShowDone: (next) => update({ showDone: next }),
    hasScans,
    source,
    chooseSource: (next) => {
      update({ source: next });
      window.scrollTo({ top: 0 });
    },
    filtersShown: filtersOpen,
    toggleFilters: () => setFiltersOpen(!filtersOpen),
    filtersChanged:
      sort !== DEFAULT_FILTER.sort || showDone !== DEFAULT_FILTER.showDone || source !== DEFAULT_FILTER.source,
    barRef,
    shown: visible.size,
    shownDone,
    undoPending: undo !== null,
    undo: undoDone,
    copyDoneRequest,
    doneRequestCopied,
    openSwipe,
  };
  const swipe: Swipe | null = swiping === null ? null : { ...swiping, done, toggleDone, close: closeSwipe };
  return { controls, swipe };
}
