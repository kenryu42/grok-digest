import {
  CalendarCheckIcon,
  CheckCheckIcon,
  GalleryVerticalEndIcon,
  InboxIcon,
  LibraryIcon,
  Rows3Icon,
  SearchIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DepthControl } from "./DepthControl.tsx";
import { SwipeMode } from "./SwipeMode.tsx";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import {
  DEPTH_LABELS,
  DEPTHS,
  isDepth,
  NARROW_SCREEN_QUERY,
  startingDepth,
  tappedDepth,
  type Depth,
} from "../lib/depth.ts";
import { filterSearch, parseFilter, VIEWS, type Filter, type View } from "../lib/filter.ts";
import { morph, prefersReducedMotion, stopMotion, type Anchor } from "../lib/morph.ts";
import { dailyReview, localDay, type ReviewPick } from "../lib/review.ts";
import { matchingIds, type SearchEntry } from "../lib/search.ts";
import { readStored, STORAGE_PREFIX, writeStored } from "../lib/storage.ts";
import {
  flyOffMs,
  swipeAxis,
  swipeCommits,
  swipeOffset,
  swipeVelocity,
  type SwipeAxis,
  type SwipeSample,
} from "../lib/swipe.ts";
import { TOPIC_LABELS, TOPICS, type Topic } from "../lib/topics.ts";

type Props = {
  entries: SearchEntry[];
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

const VIEW_LABELS: Record<View, string> = { today: "Today", inbox: "Inbox", done: "Done", all: "All" };
const VIEW_ICONS: Record<View, LucideIcon> = {
  today: CalendarCheckIcon,
  inbox: InboxIcon,
  done: CheckCheckIcon,
  all: LibraryIcon,
};
const TAB_ORDER: Record<View, string> = {
  today: "max-sm:order-1",
  inbox: "max-sm:order-2",
  done: "max-sm:order-4",
  all: "max-sm:order-5",
};
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

function todaysReview(entries: readonly SearchEntry[], done: ReadonlySet<string>): ReviewPick[] {
  const today = localDay(new Date());
  const stored = readStored(REVIEW_KEY);
  if (isStoredReview(stored) && stored.day === today) {
    const ids = new Set(entries.map(({ id }) => id));
    return stored.picks.filter(({ id }) => ids.has(id));
  }
  const picks = dailyReview({ bookmarks: entries, done, today });
  writeStored(REVIEW_KEY, { day: today, picks });
  return picks;
}

function linkedCard(): HTMLElement | null {
  const target = window.location.hash.slice(1);
  return target === "" ? null : document.querySelector<HTMLElement>(`[data-bookmark-id][id="${CSS.escape(target)}"]`);
}

function initialFilter(reviewIsEmpty: boolean): Filter {
  const filter = parseFilter(window.location.search, { reviewIsEmpty });
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

function plural(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function BookmarkControls({ entries }: Props) {
  const [review] = useState(() => todaysReview(entries, storedDone()));
  const reviewIsEmpty = review.length === 0;
  const [filter, setFilter] = useState(() => initialFilter(reviewIsEmpty));
  const [done, setDone] = useState(storedDone);
  const [depth, setDepth] = useState(() =>
    startingDepth(readStored(DEPTH_KEY), window.matchMedia(NARROW_SCREEN_QUERY).matches),
  );
  const [undo, setUndo] = useState<{ id: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [swiping, setSwiping] = useState<{ cards: HTMLElement[]; start: number } | null>(null);
  const [depthOpen, setDepthOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLFieldSetElement>(null);
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
    const row = chipsRef.current;
    const chip = topic === null ? row?.firstElementChild : row?.querySelector(`[data-topic="${topic}"]`);
    if (row === null || row === undefined || !(chip instanceof HTMLElement)) return;
    row.scrollTo({
      left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [topic]);

  useEffect(() => {
    const next = `${window.location.pathname}${filterSearch(filter, { reviewIsEmpty })}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== next) window.history.replaceState(null, "", next);
  }, [filter, reviewIsEmpty]);

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
      const shown = card.dataset["depth"];
      const next = tappedDepth(isDepth(shown) ? shown : depthRef.current, depthRef.current);
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
    const shown = cards().filter((card) => !card.hidden && !card.inert);
    if (shown.length === 0) return;
    const top = topCard();
    setSwiping({
      cards: shown,
      start: top === undefined ? 0 : Math.max(shown.indexOf(top), 0),
    });
  }, [topCard]);

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
      if (event.target.closest("[data-undo]") !== null) undoDone();
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

  return (
    <div className="flex flex-col gap-4 max-sm:contents">
      <nav
        aria-label="Views"
        className="max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-20 max-sm:grid max-sm:grid-cols-5 max-sm:items-center max-sm:border-t max-sm:bg-background/90 max-sm:px-safe-2 max-sm:pt-1.5 max-sm:pb-safe-2 max-sm:backdrop-blur-md sm:flex sm:items-center sm:gap-3"
      >
        <fieldset
          aria-label="Choose a view"
          className="max-sm:contents sm:flex sm:w-fit sm:flex-wrap sm:gap-1 sm:rounded-full sm:bg-muted sm:p-1"
        >
          {VIEWS.map((v) => {
            const Icon = VIEW_ICONS[v];
            return (
              <button
                key={v}
                type="button"
                aria-pressed={view === v && !searching}
                aria-label={`${VIEW_LABELS[v]} ${counts[v]}`}
                onClick={() => update({ view: v, query: "" })}
                className={cn(
                  "inline-flex min-w-0 items-center justify-center rounded-full text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:text-foreground max-sm:h-13 max-sm:flex-col max-sm:gap-0.5 max-sm:text-[0.6875rem] sm:h-8 sm:gap-1.5 sm:px-3.5 sm:aria-pressed:bg-card sm:aria-pressed:shadow-xs",
                  TAB_ORDER[v],
                )}
              >
                <Icon className="size-5 in-aria-pressed:text-brand-ink sm:hidden" aria-hidden="true" />
                <span className="flex items-baseline gap-1">
                  {VIEW_LABELS[v]}
                  <span className="text-muted-foreground tabular-nums in-aria-pressed:font-semibold in-aria-pressed:text-brand-ink sm:text-xs">
                    {counts[v]}
                  </span>
                </span>
              </button>
            );
          })}
        </fieldset>
        <Button
          type="button"
          onClick={openSwipe}
          aria-label="Swipe through cards"
          title="Swipe through cards (s)"
          className="max-sm:order-3 max-sm:size-12 max-sm:justify-self-center max-sm:rounded-full max-sm:shadow-md max-sm:transition-[scale] max-sm:duration-500 max-sm:ease-spring max-sm:active:scale-90 max-sm:active:duration-150 sm:h-9 sm:rounded-full sm:px-4"
        >
          <GalleryVerticalEndIcon className="max-sm:size-5" aria-hidden="true" />
          <span className="max-sm:sr-only">Swipe</span>
        </Button>
      </nav>

      <div
        ref={barRef}
        className="flex flex-col gap-4 max-sm:sticky max-sm:top-0 max-sm:z-10 max-sm:-mx-4 max-sm:gap-2 max-sm:border-b max-sm:bg-background/90 max-sm:px-4 max-sm:pt-safe-2 max-sm:pb-2 max-sm:backdrop-blur-md"
      >
        <div className={cn("flex items-center gap-2", !showSearch && "max-sm:hidden")}>
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => update({ query: event.target.value })}
              onBlur={() => {
                if (query === "") setSearchOpen(false);
              }}
              placeholder="Search all bookmarks"
              aria-label="Search bookmarks"
              className="h-10 rounded-full bg-card pl-9 dark:bg-card"
            />
          </div>
          <Button type="button" variant="ghost" onClick={closeSearch} className="h-10 rounded-full px-3 sm:hidden">
            Cancel
          </Button>
        </div>

        <div className={cn("flex items-center gap-2", showSearch && "max-sm:hidden")}>
          <fieldset
            ref={chipsRef}
            aria-label="Filter by topic"
            className="relative flex min-w-0 flex-1 gap-2 max-sm:-ml-4 max-sm:snap-x max-sm:scroll-px-4 max-sm:overflow-x-auto max-sm:pr-6 max-sm:pl-4 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-1.5rem),transparent)] max-sm:[scrollbar-width:none] sm:flex-wrap"
          >
            <TopicChip label="All topics" pressed={topic === null} onClick={() => update({ topic: null })} />
            {topicsInUse.map((t) => (
              <TopicChip
                key={t}
                topic={t}
                label={TOPIC_LABELS[t]}
                pressed={topic === t}
                onClick={() => update({ topic: topic === t ? null : t })}
              />
            ))}
          </fieldset>
          <Button
            type="button"
            variant="outline"
            aria-expanded={depthOpen}
            aria-label={`Detail: ${DEPTH_LABELS[depth]}`}
            onClick={() => setDepthOpen(!depthOpen)}
            className="h-9 shrink-0 rounded-full px-3 sm:hidden"
          >
            <Rows3Icon aria-hidden="true" />
            {DEPTH_LABELS[depth]}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={openSearch}
            aria-label="Search bookmarks"
            className="size-9 shrink-0 rounded-full sm:hidden"
          >
            <SearchIcon className="size-5" aria-hidden="true" />
          </Button>
        </div>

        <div className={cn("sm:w-96", !depthOpen && "max-sm:hidden")}>
          <DepthControl depth={depth} onChange={changeDepth} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          <Status
            view={view}
            searching={searching}
            visible={visible.size}
            reviewed={reviewedCount}
            reviewSize={review.length}
            inbox={counts.inbox}
          />
        </p>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-muted-foreground sm:pointer-fine:block">
            <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>e</kbd> done · <kbd>u</kbd> undo · <kbd>c</kbd> copy · <kbd>o</kbd>{" "}
            open · <kbd>1</kbd>–<kbd>4</kbd> detail · <kbd>s</kbd> swipe · <kbd>/</kbd> search
          </p>
        </div>
        <p className="hidden w-full text-xs text-muted-foreground pointer-coarse:block">
          Tap a card to open it. Swipe it left to mark it done.
        </p>
      </div>

      {swiping !== null && (
        <SwipeMode
          cards={swiping.cards}
          start={swiping.start}
          done={done}
          onToggleDone={toggleDone}
          onClose={closeSwipe}
        />
      )}

      <output className="pointer-events-none fixed inset-x-0 bottom-[max(--spacing(4),env(safe-area-inset-bottom))] z-20 flex justify-center px-4 max-sm:bottom-[calc(env(safe-area-inset-bottom)+--spacing(20))]">
        {undo !== null && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-foreground py-1.5 pr-1.5 pl-4 text-sm text-background shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
            Marked done
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-undo
              className="h-9 rounded-full px-3 font-semibold text-background underline underline-offset-4 hover:bg-background/15 hover:text-background dark:hover:bg-background/15"
            >
              Undo
            </Button>
          </div>
        )}
      </output>
    </div>
  );
}

function Status({
  view,
  searching,
  visible,
  reviewed,
  reviewSize,
  inbox,
}: {
  view: View;
  searching: boolean;
  visible: number;
  reviewed: number;
  reviewSize: number;
  inbox: number;
}) {
  if (searching)
    return visible === 0 ? "No bookmarks match your search." : `${plural(visible, "result")} in all bookmarks`;
  if (view === "today") {
    if (reviewSize === 0) return `Nothing to review today. ${plural(inbox, "bookmark")} in your inbox.`;
    if (reviewed === reviewSize) return "All caught up for today. Come back tomorrow.";
    return `${reviewed} of ${reviewSize} reviewed today`;
  }
  if (view === "inbox" && inbox === 0) return "Inbox zero. Everything is done.";
  if (view === "done" && visible === 0) return "Nothing marked done yet.";
  return plural(visible, "bookmark");
}

function TopicChip({
  topic,
  label,
  pressed,
  onClick,
}: {
  topic?: Topic;
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? "default" : "outline"}
      aria-pressed={pressed}
      onClick={onClick}
      data-topic={topic}
      className={cn(
        "snap-start rounded-full px-3 max-sm:h-9",
        topic !== undefined && pressed && "bg-topic text-topic-foreground hover:bg-topic/85",
      )}
    >
      {topic !== undefined && (
        <span aria-hidden="true" className="size-2 rounded-full bg-topic group-aria-pressed/button:bg-current" />
      )}
      {label}
    </Button>
  );
}
