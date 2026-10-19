import { cardUrl, escapeHtml, selfLink, siteRoot } from "./feed.ts";
import type { ImageMetadata } from "astro";
import { issueDay, type FindBookmark, type MagazineIssue } from "./magazine.ts";
import { referencedIds } from "./magazine-check.ts";

type FeedIssue = MagazineIssue & { cover?: ImageMetadata | undefined };

type IssueFeedItem = {
  title: string;
  link: string;
  description: string;
  content: string;
  pubDate: Date;
};

export function magazineFeedConfig({
  issues,
  find,
  origin,
  base,
}: {
  issues: readonly FeedIssue[];
  find: FindBookmark;
  origin: string;
  base: string;
}) {
  const page = siteRoot({ origin, base });
  return {
    title: "Magazine",
    description: "A daily magazine made from the posts saved from X.",
    site: new URL("magazine/", page).href,
    items: issues.map((issue) => issueItem({ issue, find, page })),
    ...selfLink(new URL("magazine/rss.xml", page)),
  };
}

function issueItem({ issue, find, page }: { issue: FeedIssue; find: FindBookmark; page: URL }): IssueFeedItem {
  const { date, title, subtitle, editor_note: editorNote, cover } = issue;
  const stories = referencedIds(issue)
    .map(find)
    .map(({ id, tldr }) => `<li><a href="${escapeHtml(cardUrl(page, id).href)}">${escapeHtml(tldr)}</a></li>`)
    .join("");
  const coverImage =
    cover === undefined ? [] : [`<p><img src="${escapeHtml(new URL(cover.src, page).href)}" alt=""></p>`];
  const paragraphs = [subtitle, editorNote].flatMap((text) =>
    text === undefined ? [] : [`<p>${escapeHtml(text)}</p>`],
  );
  return {
    title,
    link: new URL(`magazine/${date}/`, page).href,
    description: subtitle ?? editorNote ?? title,
    content: [...coverImage, ...paragraphs, ...(stories === "" ? [] : [`<ul>${stories}</ul>`])].join(""),
    pubDate: issueDay(date),
  };
}
