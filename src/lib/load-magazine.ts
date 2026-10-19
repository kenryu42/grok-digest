import files from "virtual:grok-digest/magazine";
import { bookmarks } from "./load-bookmarks.ts";
import { parseMagazine, type PublishedIssue } from "./magazine.ts";
import { bookmarkFinder, indexBookmarks, readableIssue } from "./magazine-check.ts";

const byId = indexBookmarks(bookmarks);
const parsed = parseMagazine(files);

export const issues: PublishedIssue[] = parsed.map((issue, index) =>
  Object.assign(readableIssue(issue, byId), { number: parsed.length - index }),
);
export const findBookmark = bookmarkFinder(bookmarks);
