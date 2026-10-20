import raw, { source } from "virtual:grok-digest/bookmarks";
import rawScans, { source as scansSource } from "virtual:grok-digest/scans";
import { parseBookmarks, parseScans } from "./bookmarks.ts";
import { pagePosts, postFinder } from "./posts.ts";

const bookmarks = parseBookmarks({ raw, source });
const scans = parseScans({ raw: rawScans, source: scansSource });

export const posts = pagePosts(bookmarks, scans);
export const findPost = postFinder(bookmarks, scans);
