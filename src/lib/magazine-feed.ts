import { cardUrl, escapeHtml, selfLink, siteRoot } from "./feed.ts";
import { referencedIds, type FindBookmark, type MagazineIssue } from "./magazine.ts";

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
  issues: readonly MagazineIssue[];
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

function issueItem({ issue, find, page }: { issue: MagazineIssue; find: FindBookmark; page: URL }): IssueFeedItem {
  const { date, title, subtitle, editor_note: editorNote } = issue;
  const stories = referencedIds(issue)
    .map(find)
    .map(({ id, tldr }) => `<li><a href="${escapeHtml(cardUrl(page, id).href)}">${escapeHtml(tldr)}</a></li>`)
    .join("");
  return {
    title,
    link: new URL(`magazine/${date}/`, page).href,
    description: subtitle ?? editorNote ?? title,
    content: [subtitle, editorNote]
      .flatMap((text) => (text === undefined ? [] : [`<p>${escapeHtml(text)}</p>`]))
      .concat(stories === "" ? [] : [`<ul>${stories}</ul>`])
      .join(""),
    pubDate: new Date(date),
  };
}
