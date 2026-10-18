import type { Bookmark } from "./bookmarks.ts";
import type { Filter, Sort } from "./filter.ts";
import { TOPIC_LABELS, type Topic } from "./topics.ts";

export type SearchEntry = {
  id: string;
  topic: Topic;
  savedAt: Date;
  text: string;
};

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function toSearchEntry(bookmark: Bookmark): SearchEntry {
  const { id, topic, savedAt, author, tldr, summary, text, keyPoints, action, links } = bookmark;
  return {
    id,
    topic,
    savedAt,
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
  filter: { query, topic, showDone },
  done,
}: {
  entries: readonly SearchEntry[];
  filter: Filter;
  done: ReadonlySet<string>;
}): Set<string> {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return new Set(
    entries
      .filter((entry) => topic === null || entry.topic === topic)
      .filter((entry) =>
        terms.length === 0 ? showDone || !done.has(entry.id) : terms.every((term) => entry.text.includes(term)),
      )
      .map((entry) => entry.id),
  );
}

export function sortedIds(entries: readonly SearchEntry[], sort: Sort): string[] {
  const direction = sort === "newest" ? -1 : 1;
  return entries.toSorted((a, b) => direction * (a.savedAt.getTime() - b.savedAt.getTime())).map(({ id }) => id);
}
