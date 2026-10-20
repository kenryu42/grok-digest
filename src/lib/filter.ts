import type { PostSource } from "./posts.ts";
import { TOPICS, type Topic } from "./topics.ts";

export const SORTS = ["newest", "oldest"] as const;

export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = { newest: "Newest", oldest: "Oldest" };

export const SOURCE_FILTERS = ["all", "bookmarks", "scans"] as const;

export type SourceFilter = (typeof SOURCE_FILTERS)[number];

export const SOURCE_FILTER_LABELS: Record<SourceFilter, string> = {
  all: "All",
  bookmarks: "Bookmarks",
  scans: "Scans",
};

export const SOURCE_OF_FILTER: Record<Exclude<SourceFilter, "all">, PostSource> = {
  bookmarks: "bookmark",
  scans: "scan",
};

export type Filter = { query: string; topic: Topic | null; sort: Sort; showDone: boolean; source: SourceFilter };

export const DEFAULT_FILTER: Filter = { query: "", topic: null, sort: "newest", showDone: false, source: "all" };

const SHOW_DONE = "show";

export function isTopic(value: string | null | undefined): value is Topic {
  return TOPICS.some((topic) => topic === value);
}

function isSort(value: string | null): value is Sort {
  return SORTS.some((sort) => sort === value);
}

function isSourceFilter(value: string | null): value is SourceFilter {
  return SOURCE_FILTERS.some((source) => source === value);
}

export function parseFilter(search: string): Filter {
  const params = new URLSearchParams(search);
  const topic = params.get("topic");
  const sort = params.get("sort");
  const source = params.get("source");
  return {
    query: params.get("q") ?? "",
    topic: isTopic(topic) ? topic : null,
    sort: isSort(sort) ? sort : DEFAULT_FILTER.sort,
    showDone: params.get("done") === SHOW_DONE,
    source: isSourceFilter(source) ? source : DEFAULT_FILTER.source,
  };
}

export function filterSearch({ query, topic, sort, showDone, source }: Filter): string {
  const params = new URLSearchParams();
  const trimmed = query.trim();
  if (trimmed !== "") params.set("q", trimmed);
  if (topic !== null) params.set("topic", topic);
  if (sort !== DEFAULT_FILTER.sort) params.set("sort", sort);
  if (showDone) params.set("done", SHOW_DONE);
  if (source !== DEFAULT_FILTER.source) params.set("source", source);
  const search = params.toString();
  return search === "" ? "" : `?${search}`;
}
