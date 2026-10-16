import { ChevronsDownUpIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";
import { cn } from "cn";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import { NARROW_SCREEN_QUERY, startsCollapsed } from "../lib/collapse.ts";
import { filterSearch, parseFilter, VIEWS, type Filter, type View } from "../lib/filter.ts";
import { dailyReview, localDay, type ReviewPick } from "../lib/review.ts";
import { matchingIds, type SearchEntry } from "../lib/search.ts";
import { swipeAxis, swipeCommits, swipeOffset, type SwipeAxis } from "../lib/swipe.ts";
import { TOPIC_LABELS, TOPICS, type Topic } from "../lib/topics.ts";

type Props = {
  entries: SearchEntry[];
};

const STORAGE_PREFIX = `grok-digest:${import.meta.env.BASE_URL}:`;
const DONE_KEY = `${STORAGE_PREFIX}done`;
const REVIEW_KEY = `${STORAGE_PREFIX}review`;
const COLLAPSED_KEY = `${STORAGE_PREFIX}cards-collapsed`;
const UNDO_MS = 5000;
const SWIPE_SETTLE_MS = 150;
const SWIPE_CLICK_GUARD_MS = 400;

const VIEW_LABELS: Record<View, string> = { today: "Today", inbox: "Inbox", done: "Done", all: "All" };
const FORM_FIELDS = "input, textarea, select, [contenteditable]";

function readStored(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

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
  card.querySelector("summary")?.focus({ preventScroll: true });
  card.scrollIntoView({ block: "start" });
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

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function plural(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function BookmarkControls({ entries }: Props) {
  const [review] = useState(() => todaysReview(entries, storedDone()));
  const reviewIsEmpty = review.length === 0;
  const [filter, setFilter] = useState(() => initialFilter(reviewIsEmpty));
  const [done, setDone] = useState(storedDone);
  const [collapsed, setCollapsed] = useState(() =>
    startsCollapsed(readStored(COLLAPSED_KEY), window.matchMedia(NARROW_SCREEN_QUERY).matches),
  );
  const [undo, setUndo] = useState<{ id: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLFieldSetElement>(null);
  const doneRef = useRef(done);
  const undoRef = useRef(undo);

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

  useEffect(() => {
    const showReasons = view === "today" && !searching;
    for (const card of cards()) {
      const id = card.dataset["bookmarkId"] ?? "";
      card.hidden = !visible.has(id);
      card.toggleAttribute("data-done", done.has(id));
      card.querySelector("[data-done-toggle]")?.setAttribute("aria-pressed", String(done.has(id)));
      const reason = card.querySelector<HTMLElement>("[data-review-reason]");
      const text = showReasons ? reasons.get(id) : undefined;
      if (reason !== null) {
        reason.hidden = text === undefined;
        reason.textContent = text ?? "";
      }
      if (card.hasAttribute("data-swiped")) {
        card.removeAttribute("data-swiped");
        const surface = card.querySelector<HTMLElement>("[data-swipe-surface]");
        if (surface !== null) surface.style.transform = "";
      }
    }
  }, [visible, done, reasons, view, searching]);

  useEffect(() => {
    for (const details of document.querySelectorAll<HTMLDetailsElement>("[data-bookmark-id] details")) {
      details.open = !collapsed;
    }
  }, [collapsed]);

  useEffect(() => {
    doneRef.current = done;
    writeStored(DONE_KEY, [...done]);
  }, [done]);

  useEffect(() => {
    undoRef.current = undo;
    if (undo === null) return undefined;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    const bar = barRef.current;
    if (bar === null) return undefined;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--controls-height", `${bar.offsetHeight}px`);
    });
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

  useEffect(() => {
    document.querySelector("[data-bookmark-list]")?.toggleAttribute("data-ready", true);
    const linked = linkedCard();
    linked?.querySelector("details")?.setAttribute("open", "");
    linked?.scrollIntoView({ block: "start" });
  }, []);

  useEffect(() => {
    const toggleDone = (card: HTMLElement): void => {
      const id = card.dataset["bookmarkId"] ?? "";
      const marking = !doneRef.current.has(id);
      setDone((previous) => {
        const next = new Set(previous);
        if (marking) next.add(id);
        else next.delete(id);
        return next;
      });
      setUndo(marking ? { id } : null);
    };

    const undoDone = (): void => {
      const pending = undoRef.current;
      if (pending === null) return;
      setDone((previous) => {
        const next = new Set(previous);
        next.delete(pending.id);
        return next;
      });
      setUndo(null);
    };

    let swipe: {
      card: HTMLElement;
      surface: HTMLElement;
      pointerId: number;
      startX: number;
      startY: number;
      axis: SwipeAxis;
      dx: number;
    } | null = null;
    let clicksBlockedUntil = 0;

    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType !== "touch" || !event.isPrimary || !(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>("[data-bookmark-id]");
      const surface = card?.querySelector<HTMLElement>("[data-swipe-surface]");
      if (card === null || card === undefined || surface === null || surface === undefined) return;
      swipe = {
        card,
        surface,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        axis: "undecided",
        dx: 0,
      };
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (swipe === null || swipe.pointerId !== event.pointerId) return;
      const dx = event.clientX - swipe.startX;
      if (swipe.axis === "undecided") {
        swipe.axis = swipeAxis(dx, event.clientY - swipe.startY);
        if (swipe.axis === "vertical") {
          swipe = null;
          return;
        }
        if (swipe.axis === "horizontal") swipe.card.toggleAttribute("data-swiping", true);
      }
      if (swipe.axis !== "horizontal") return;
      swipe.dx = dx;
      swipe.surface.style.transform = `translateX(${swipeOffset(dx)}px)`;
    };

    const endSwipe = (event: PointerEvent): void => {
      if (swipe === null || swipe.pointerId !== event.pointerId) return;
      const { card, surface, axis, dx } = swipe;
      swipe = null;
      if (axis !== "horizontal") return;
      clicksBlockedUntil = event.timeStamp + SWIPE_CLICK_GUARD_MS;
      const commits = event.type === "pointerup" && swipeCommits(dx, card.offsetWidth);
      card.removeAttribute("data-swiping");
      if (!commits) {
        surface.style.transform = "";
        return;
      }
      card.toggleAttribute("data-swiped", true);
      surface.style.transform = "translateX(-100%)";
      setTimeout(() => toggleDone(card), prefersReducedMotion() ? 0 : SWIPE_SETTLE_MS);
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
      const card = event.target.closest<HTMLElement>("[data-done-toggle]")?.closest<HTMLElement>("[data-bookmark-id]");
      if (card !== null && card !== undefined) toggleDone(card);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
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
          toggleDone(current);
          setTimeout(() => {
            if (current.hidden) focusCard(neighbor);
          });
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
  }, []);

  const update = (change: Partial<Filter>): void => setFilter((previous) => ({ ...previous, ...change }));

  const openSearch = (): void => {
    flushSync(() => setSearchOpen(true));
    searchRef.current?.focus();
  };

  const closeSearch = (): void => {
    setSearchOpen(false);
    update({ query: "" });
  };

  const toggleCollapsed = (): void => {
    setCollapsed(!collapsed);
    writeStored(COLLAPSED_KEY, !collapsed);
  };

  return (
    <div className="flex flex-col gap-4 max-sm:contents">
      <div
        ref={barRef}
        className="flex flex-col gap-4 max-sm:sticky max-sm:top-0 max-sm:z-10 max-sm:-mx-4 max-sm:gap-3 max-sm:border-b max-sm:bg-background/90 max-sm:px-4 max-sm:pt-safe-2 max-sm:pb-3 max-sm:backdrop-blur-md"
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

        <div className="flex items-center gap-2">
          <fieldset
            aria-label="Choose a view"
            className="grid min-w-0 flex-1 grid-cols-4 gap-1 rounded-full bg-muted p-1 sm:flex sm:w-fit sm:flex-none sm:flex-wrap"
          >
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v && !searching}
                onClick={() => update({ view: v, query: "" })}
                className="inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-full px-1 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs sm:h-8 sm:gap-1.5 sm:px-3.5"
              >
                {VIEW_LABELS[v]}
                <span className="text-xs text-muted-foreground tabular-nums in-aria-pressed:font-semibold in-aria-pressed:text-brand-ink">
                  {counts[v]}
                </span>
              </button>
            ))}
          </fieldset>
          {!showSearch && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={openSearch}
              aria-label="Search bookmarks"
              className="size-11 rounded-full sm:hidden"
            >
              <SearchIcon className="size-5" aria-hidden="true" />
            </Button>
          )}
        </div>

        <fieldset
          ref={chipsRef}
          aria-label="Filter by topic"
          className="relative flex min-w-0 gap-2 max-sm:-mx-4 max-sm:snap-x max-sm:scroll-px-4 max-sm:overflow-x-auto max-sm:pr-10 max-sm:pl-4 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] max-sm:[scrollbar-width:none] sm:flex-wrap"
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
            open · <kbd>/</kbd> search
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={toggleCollapsed} className="max-sm:h-9">
            {collapsed ? <ChevronsUpDownIcon aria-hidden="true" /> : <ChevronsDownUpIcon aria-hidden="true" />}
            {collapsed ? "Expand all" : "Collapse all"}
          </Button>
        </div>
        <p className="hidden w-full text-xs text-muted-foreground pointer-coarse:block">
          Swipe a card left to mark it done.
        </p>
      </div>

      <output className="pointer-events-none fixed inset-x-0 bottom-[max(--spacing(4),env(safe-area-inset-bottom))] z-20 flex justify-center px-4">
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
