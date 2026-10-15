import raw, { source } from "virtual:grok-digest/bookmarks";
import { parseBookmarks } from "./bookmarks.ts";

export const bookmarks = parseBookmarks({ raw, source });
