import type { Bookmark, PostLink } from "./bookmarks.ts";
import { isTopic } from "./filter.ts";
import { listedLinks, postParts, textPieces } from "./media.ts";
import { TOPIC_LABELS, type Topic } from "./topics.ts";

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

function linkHtml({ url, title, image }: PostLink): string {
  const preview = image === undefined ? "" : `<img src="${escapeHtml(image)}" alt=""><br>`;
  return `<a href="${escapeHtml(url)}">${preview}${escapeHtml(title)}</a>`;
}

function linkedText(text: string): string {
  return textPieces(text)
    .map((piece) =>
      piece.kind === "text"
        ? escapeHtml(piece.text)
        : `<a href="${escapeHtml(piece.url)}">${escapeHtml(piece.url)}</a>`,
    )
    .join("");
}

function feedItem(bookmark: Bookmark, page: URL): FeedItem {
  const { author, tldr, summary, text, keyPoints, action, links, topic, url, savedAt, id } = bookmark;
  const link = new URL(page.href);
  link.hash = `b-${id}`;
  const points = keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("");
  const quoted = postParts(bookmark)
    .flatMap((part) => {
      if (part.kind === "text") return [`<p>${linkedText(part.text)}</p>`];
      if (part.kind === "link") return [`<p>${linkHtml(part.link)}</p>`];
      return part.images.map((image) => `<p><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}"></p>`);
    })
    .join("");
  const linkItems = listedLinks(links)
    .map((postLink) => `<li>${linkHtml(postLink)}</li>`)
    .join("");
  return {
    title: tldr,
    link: link.href,
    description: [`@${author.handle}`, summary, text].filter((part) => part !== "").join("\n\n"),
    content: [
      `<p>${escapeHtml(author.name)} (@${escapeHtml(author.handle)})</p>`,
      `<p>${escapeHtml(summary)}</p>`,
      action === "" ? "" : `<p>Try: ${escapeHtml(action)}</p>`,
      points === "" ? "" : `<ul>${points}</ul>`,
      linkItems === "" ? "" : `<ul>${linkItems}</ul>`,
      quoted === "" ? "" : `<blockquote>${quoted}</blockquote>`,
      `<p><a href="${escapeHtml(url)}">Open on X</a></p>`,
    ]
      .filter((part) => part !== "")
      .join(""),
    pubDate: savedAt,
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
