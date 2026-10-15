import type { Bookmark } from "./bookmarks.ts";
import type { Filter, View } from "./filter.ts";
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
  const { id, topic, savedAt, author, tldr, summary, text, keyPoints } = bookmark;
  return {
    id,
    topic,
    savedAt,
    text: normalize(
      [author.name, `@${author.handle}`, TOPIC_LABELS[topic], tldr, summary, text, ...keyPoints].join("\n"),
    ),
  };
}

export type Triage = { done: ReadonlySet<string>; review: ReadonlySet<string> };

const IN_VIEW: Record<View, (id: string, triage: Triage) => boolean> = {
  today: (id, { review }) => review.has(id),
  inbox: (id, { done }) => !done.has(id),
  done: (id, { done }) => done.has(id),
  all: () => true,
};

export function matchingIds({
  entries,
  filter: { query, topic, view },
  triage,
}: {
  entries: readonly SearchEntry[];
  filter: Filter;
  triage: Triage;
}): Set<string> {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return new Set(
    entries
      .filter((entry) => topic === null || entry.topic === topic)
      .filter((entry) =>
        terms.length === 0 ? IN_VIEW[view](entry.id, triage) : terms.every((term) => entry.text.includes(term)),
      )
      .map((entry) => entry.id),
  );
}
