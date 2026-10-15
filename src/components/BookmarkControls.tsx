import { ChevronsDownUpIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import { filterSearch, parseFilter, VIEWS, type Filter, type View } from "../lib/filter.ts";
import { dailyReview, localDay, type ReviewPick } from "../lib/review.ts";
import { matchingIds, type SearchEntry } from "../lib/search.ts";
import { TOPIC_LABELS, TOPICS } from "../lib/topics.ts";

type Props = {
  entries: SearchEntry[];
};

const STORAGE_PREFIX = `grok-digest:${import.meta.env.BASE_URL}:`;
const DONE_KEY = `${STORAGE_PREFIX}done`;
const REVIEW_KEY = `${STORAGE_PREFIX}review`;
const COLLAPSED_KEY = `${STORAGE_PREFIX}collapsed`;

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

function plural(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function BookmarkControls({ entries }: Props) {
  const [review] = useState(() => todaysReview(entries, storedDone()));
  const reviewIsEmpty = review.length === 0;
  const [filter, setFilter] = useState(() => initialFilter(reviewIsEmpty));
  const [done, setDone] = useState(storedDone);
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY) === true);
  const searchRef = useRef<HTMLInputElement>(null);

  const { query, topic, view } = filter;
  const searching = query.trim() !== "";
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
    }
  }, [visible, done, reasons, view, searching]);

  useEffect(() => {
    for (const details of document.querySelectorAll<HTMLDetailsElement>("[data-bookmark-id] details")) {
      details.open = !collapsed;
    }
    writeStored(COLLAPSED_KEY, collapsed);
  }, [collapsed]);

  useEffect(() => {
    writeStored(DONE_KEY, [...done]);
  }, [done]);

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
      setDone((previous) => {
        const next = new Set(previous);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    };

    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) return;
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
        case "o": {
          const url = current?.dataset["url"];
          if (url !== undefined) window.open(url, "_blank", "noopener,noreferrer");
          break;
        }
        case "/":
          searchRef.current?.focus();
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const update = (change: Partial<Filter>): void => setFilter((previous) => ({ ...previous, ...change }));

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => update({ query: event.target.value })}
          placeholder="Search all bookmarks"
          aria-label="Search bookmarks"
          className="h-10 rounded-full bg-card pl-9 dark:bg-card"
        />
      </div>

      <fieldset aria-label="Choose a view" className="flex w-fit min-w-0 flex-wrap gap-1 rounded-full bg-muted p-1">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v && !searching}
            onClick={() => update({ view: v, query: "" })}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs"
          >
            {VIEW_LABELS[v]}
            <span className="text-xs text-muted-foreground tabular-nums">{counts[v]}</span>
          </button>
        ))}
      </fieldset>

      <fieldset aria-label="Filter by topic" className="flex min-w-0 flex-wrap gap-2">
        <TopicChip label="All topics" pressed={topic === null} onClick={() => update({ topic: null })} />
        {topicsInUse.map((t) => (
          <TopicChip
            key={t}
            label={TOPIC_LABELS[t]}
            pressed={topic === t}
            onClick={() => update({ topic: topic === t ? null : t })}
          />
        ))}
      </fieldset>

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
          <p className="hidden text-xs text-muted-foreground sm:block">
            <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>e</kbd> done · <kbd>c</kbd> copy · <kbd>o</kbd> open · <kbd>/</kbd>{" "}
            search
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronsUpDownIcon aria-hidden="true" /> : <ChevronsDownUpIcon aria-hidden="true" />}
            {collapsed ? "Expand all" : "Collapse all"}
          </Button>
        </div>
      </div>
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

function TopicChip({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? "default" : "outline"}
      aria-pressed={pressed}
      onClick={onClick}
      className="rounded-full px-3"
    >
      {label}
    </Button>
  );
}
