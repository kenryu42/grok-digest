import type { Bookmark } from "./bookmarks";
import { TOPIC_LABELS, type Topic } from "./topics";

export type SearchEntry = {
  id: string;
  topic: Topic;
  text: string;
};

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function toSearchEntry(bookmark: Bookmark): SearchEntry {
  const { id, topic, author, summary, text, keyPoints } = bookmark;
  return {
    id,
    topic,
    text: normalize([author.name, `@${author.handle}`, TOPIC_LABELS[topic], summary, text, ...keyPoints].join("\n")),
  };
}

export function matchingIds({
  entries,
  query,
  topic,
}: {
  entries: readonly SearchEntry[];
  query: string;
  topic: Topic | null;
}): Set<string> {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return new Set(
    entries
      .filter((entry) => topic === null || entry.topic === topic)
      .filter((entry) => terms.every((term) => entry.text.includes(term)))
      .map((entry) => entry.id),
  );
}
