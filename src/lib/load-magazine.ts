import files from "virtual:grok-digest/magazine";
import { findPost } from "./load-bookmarks.ts";
import { parseMagazine, type PublishedIssue } from "./magazine.ts";
import { entryFinder, readableIssue } from "./magazine-check.ts";

const parsed = parseMagazine(files);

export const issues: PublishedIssue[] = parsed.map((issue, index) =>
  Object.assign(readableIssue(issue, findPost), { number: parsed.length - index }),
);
export const findEntry = entryFinder(findPost);
