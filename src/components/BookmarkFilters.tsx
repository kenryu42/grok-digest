import { SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { filterSearch, parseFilter } from "@/lib/filter";
import { matchingIds, type SearchEntry } from "@/lib/search";
import { TOPIC_LABELS, TOPICS, type Topic } from "@/lib/topics";

type Props = {
  entries: SearchEntry[];
};

export function BookmarkFilters({ entries }: Props) {
  const initial = parseFilter(window.location.search);
  const [query, setQuery] = useState(initial.query);
  const [topic, setTopic] = useState<Topic | null>(initial.topic);

  const visible = useMemo(() => matchingIds({ entries, query, topic }), [entries, query, topic]);
  const topicsInUse = useMemo(() => TOPICS.filter((t) => entries.some((entry) => entry.topic === t)), [entries]);

  useEffect(() => {
    for (const card of document.querySelectorAll<HTMLElement>("[data-bookmark-id]")) {
      card.hidden = !visible.has(card.dataset["bookmarkId"] ?? "");
    }
  }, [visible]);

  useEffect(() => {
    const next = `${window.location.pathname}${filterSearch({ query, topic })}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== next) window.history.replaceState(null, "", next);
  }, [query, topic]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search authors, posts, summaries, key points"
          aria-label="Search bookmarks"
          className="h-10 rounded-full bg-card pl-9 dark:bg-card"
        />
      </div>

      <fieldset aria-label="Filter by topic" className="flex min-w-0 flex-wrap gap-2">
        <TopicChip label="All" pressed={topic === null} onClick={() => setTopic(null)} />
        {topicsInUse.map((t) => (
          <TopicChip
            key={t}
            label={TOPIC_LABELS[t]}
            pressed={topic === t}
            onClick={() => setTopic(topic === t ? null : t)}
          />
        ))}
      </fieldset>

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {visible.size === entries.length
          ? `${entries.length} ${entries.length === 1 ? "bookmark" : "bookmarks"}`
          : `Showing ${visible.size} of ${entries.length}`}
        {visible.size === 0 && entries.length > 0 ? ". No bookmarks match your search." : ""}
      </p>
    </div>
  );
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
