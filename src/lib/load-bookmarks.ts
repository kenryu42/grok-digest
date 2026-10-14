import raw from "../../data/bookmarks.json";
import { parseBookmarks } from "./bookmarks";

export const bookmarks = parseBookmarks({ raw, source: "data/bookmarks.json" });
