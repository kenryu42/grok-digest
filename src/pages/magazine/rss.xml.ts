import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { feedOrigin } from "../../lib/feed.ts";
import { findEntry, issues } from "../../lib/load-magazine.ts";
import { magazineFeedConfig } from "../../lib/magazine-feed.ts";

export function GET(context: APIContext) {
  return rss(
    magazineFeedConfig({
      issues,
      find: findEntry,
      origin: feedOrigin(context.site),
      base: import.meta.env.BASE_URL,
    }),
  );
}
