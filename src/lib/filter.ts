import { TOPICS, type Topic } from "./topics.ts";

export const SORTS = ["newest", "oldest"] as const;

export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = { newest: "Newest", oldest: "Oldest" };

export type Filter = { query: string; topic: Topic | null; sort: Sort; showDone: boolean };

export const DEFAULT_FILTER: Filter = { query: "", topic: null, sort: "newest", showDone: false };

const SHOW_DONE = "show";

export function isTopic(value: string | null | undefined): value is Topic {
  return TOPICS.some((topic) => topic === value);
}

function isSort(value: string | null): value is Sort {
  return SORTS.some((sort) => sort === value);
}

export function parseFilter(search: string): Filter {
  const params = new URLSearchParams(search);
  const topic = params.get("topic");
  const sort = params.get("sort");
  return {
    query: params.get("q") ?? "",
    topic: isTopic(topic) ? topic : null,
    sort: isSort(sort) ? sort : DEFAULT_FILTER.sort,
    showDone: params.get("done") === SHOW_DONE,
  };
}

export function filterSearch({ query, topic, sort, showDone }: Filter): string {
  const params = new URLSearchParams();
  const trimmed = query.trim();
  if (trimmed !== "") params.set("q", trimmed);
  if (topic !== null) params.set("topic", topic);
  if (sort !== DEFAULT_FILTER.sort) params.set("sort", sort);
  if (showDone) params.set("done", SHOW_DONE);
  const search = params.toString();
  return search === "" ? "" : `?${search}`;
}
