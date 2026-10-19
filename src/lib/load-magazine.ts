import files from "virtual:grok-digest/magazine";
import { bookmarks } from "./load-bookmarks.ts";
import { bookmarkFinder, parseMagazine } from "./magazine.ts";

export const issues = parseMagazine({ files, bookmarks });
export const findBookmark = bookmarkFinder(bookmarks);
