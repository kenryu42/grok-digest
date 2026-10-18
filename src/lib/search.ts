import type { Bookmark } from "./bookmarks.ts";
import type { Filter, Sort } from "./filter.ts";
import { TOPIC_LABELS, type Topic } from "./topics.ts";

export type SearchEntry = {
  id: string;
  topic: Topic;
  savedAt: Date;
  postedAt: Date;
  shelfLife: Bookmark["shelfLife"];
  text: string;
};

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function toSearchEntry(bookmark: Bookmark): SearchEntry {
  const { id, topic, savedAt, postedAt, shelfLife, author, tldr, summary, text, keyPoints, action, links } = bookmark;
  return {
    id,
    topic,
    savedAt,
    postedAt,
    shelfLife,
    text: normalize(
      [
        author.name,
        `@${author.handle}`,
        TOPIC_LABELS[topic],
        tldr,
        summary,
        text,
        ...keyPoints,
        action,
        ...links.map(({ title }) => title),
      ].join("\n"),
    ),
  };
}

export function matchingIds({
  entries,
  filter: { query, topic, showDone, hideNews },
  done,
}: {
  entries: readonly SearchEntry[];
  filter: Filter;
  done: ReadonlySet<string>;
}): Set<string> {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const listed = (entry: SearchEntry): boolean =>
    (showDone || !done.has(entry.id)) && !(hideNews && entry.shelfLife === "news");
  return new Set(
    entries
      .filter((entry) => topic === null || entry.topic === topic)
      .filter((entry) => (terms.length === 0 ? listed(entry) : terms.every((term) => entry.text.includes(term))))
      .map((entry) => entry.id),
  );
}

const SORT_TIMES: Record<Sort, (entry: SearchEntry) => number> = {
  newest: ({ savedAt }) => -savedAt.getTime(),
  oldest: ({ savedAt }) => savedAt.getTime(),
  posted: ({ postedAt }) => -postedAt.getTime(),
};

export function sortedIds(entries: readonly SearchEntry[], sort: Sort): string[] {
  const time = SORT_TIMES[sort];
  return entries.toSorted((a, b) => time(a) - time(b)).map(({ id }) => id);
}
