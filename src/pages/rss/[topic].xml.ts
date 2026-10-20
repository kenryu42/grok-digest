import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { feedConfig, feedOrigin, topicFromParam } from "../../lib/feed.ts";
import { posts } from "../../lib/load-bookmarks.ts";
import { TOPICS } from "../../lib/topics.ts";

export function getStaticPaths() {
  return TOPICS.map((topic) => ({ params: { topic } }));
}

export function GET(context: APIContext) {
  return rss(
    feedConfig({
      bookmarks: posts,
      topic: topicFromParam(context.params["topic"]),
      origin: feedOrigin(context.site),
      base: import.meta.env.BASE_URL,
    }),
  );
}
