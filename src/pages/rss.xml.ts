import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { feedConfig, feedOrigin } from "@/lib/feed";
import { bookmarks } from "@/lib/load-bookmarks";

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
