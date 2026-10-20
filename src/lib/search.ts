import type { Bookmark } from "./bookmarks.ts";
import { SOURCE_OF_FILTER, type Filter, type Sort } from "./filter.ts";
import type { PostSource } from "./posts.ts";
import { TOPIC_LABELS, type Topic } from "./topics.ts";

export type SearchEntry = {
  id: string;
  source: PostSource;
  topic: Topic;
  savedAt: Date;
  text: string;
};

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function toSearchEntry(bookmark: Bookmark & { source?: PostSource }): SearchEntry {
  const { id, source = "bookmark", topic, savedAt, author, tldr, summary, text, keyPoints, action, links } = bookmark;
  return {
    id,
    source,
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
  filter: { query, topic, showDone, source },
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
      .filter((entry) => source === "all" || entry.source === SOURCE_OF_FILTER[source])
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
