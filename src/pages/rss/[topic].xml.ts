import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { feedConfig, feedOrigin, topicFromParam } from "@/lib/feed";
import { bookmarks } from "@/lib/load-bookmarks";
import { TOPICS } from "@/lib/topics";

export function getStaticPaths() {
  return TOPICS.map((topic) => ({ params: { topic } }));
}

export function GET(context: APIContext) {
  return rss(
    feedConfig({
      bookmarks,
      topic: topicFromParam(context.params["topic"]),
      origin: feedOrigin(context.site),
      base: import.meta.env.BASE_URL,
    }),
  );
}
