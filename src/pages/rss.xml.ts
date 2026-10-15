import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { feedConfig, feedOrigin } from "../lib/feed.ts";
import { bookmarks } from "../lib/load-bookmarks.ts";

export function GET(context: APIContext) {
  return rss(
    feedConfig({
      bookmarks,
      topic: null,
      origin: feedOrigin(context.site),
      base: import.meta.env.BASE_URL,
    }),
  );
}
