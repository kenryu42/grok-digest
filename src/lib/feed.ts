import type { Bookmark } from "./bookmarks";
import { isTopic } from "./filter";
import { TOPIC_LABELS, type Topic } from "./topics";

type FeedItem = {
  title: string;
  link: string;
  description: string;
  content: string;
  pubDate: Date;
  categories: [string];
};

export type FeedConfig = {
  title: string;
  description: string;
  site: string;
  items: FeedItem[];
  customData: string;
  xmlns: { atom: string };
};

const LOCAL_ORIGIN = "http://localhost:4321";

export function feedOrigin(site: URL | undefined): string {
  return site?.origin ?? LOCAL_ORIGIN;
}

export function feedConfig({
  bookmarks,
  topic,
  origin,
  base,
}: {
  bookmarks: readonly Bookmark[];
  topic: Topic | null;
  origin: string;
  base: string;
}): FeedConfig {
  const page = new URL(base.endsWith("/") ? base : `${base}/`, origin);
  const label = topic === null ? null : TOPIC_LABELS[topic];
  const self = new URL(topic === null ? "rss.xml" : `rss/${topic}.xml`, page);
  return {
    title: label === null ? "Bookmarks" : `Bookmarks: ${label}`,
    description: label === null ? "Posts saved from X." : `Posts saved from X in ${label}.`,
    site: page.href,
    items: bookmarks
      .filter((bookmark) => topic === null || bookmark.topic === topic)
      .map((bookmark) => feedItem(bookmark, page)),
    customData: `<atom:link href="${escapeHtml(self.href)}" rel="self" type="application/rss+xml"/>`,
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
  };
}

export function topicFromParam(value: string | undefined): Topic {
  if (!isTopic(value)) throw new Error(`Unknown topic feed: ${value ?? ""}`);
  return value;
}

function feedItem(bookmark: Bookmark, page: URL): FeedItem {
  const { author, summary, text, keyPoints, topic, url, postedAt, id } = bookmark;
  const link = new URL(page.href);
  link.hash = `b-${id}`;
  const points = keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("");
  const quote = text === "" ? "" : `<blockquote><p>${escapeHtml(text)}</p></blockquote>`;
  return {
    title: summary,
    link: link.href,
    description: [`@${author.handle}`, summary, text].filter((part) => part !== "").join("\n\n"),
    content: [
      `<p>${escapeHtml(author.name)} (@${escapeHtml(author.handle)})</p>`,
      `<p>${escapeHtml(summary)}</p>`,
      points === "" ? "" : `<ul>${points}</ul>`,
      quote,
      `<p><a href="${escapeHtml(url)}">Open on X</a></p>`,
    ]
      .filter((part) => part !== "")
      .join(""),
    pubDate: postedAt,
    categories: [TOPIC_LABELS[topic]],
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
