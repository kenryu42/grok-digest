import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { feedConfig, feedOrigin } from "../lib/feed.ts";
import { posts } from "../lib/load-bookmarks.ts";

export function GET(context: APIContext) {
  return rss(
    feedConfig({
      bookmarks: posts,
      topic: null,
      origin: feedOrigin(context.site),
      base: import.meta.env.BASE_URL,
    }),
  );
}
