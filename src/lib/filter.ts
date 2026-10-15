import { TOPICS, type Topic } from "./topics.ts";

export const VIEWS = ["today", "inbox", "done", "all"] as const;

export type View = (typeof VIEWS)[number];

const DEFAULT_VIEW: View = "today";

export type Filter = { query: string; topic: Topic | null; view: View };

export function isTopic(value: string | null | undefined): value is Topic {
  return TOPICS.some((topic) => topic === value);
}

function isView(value: string | null): value is View {
  return VIEWS.some((view) => view === value);
}

export function parseFilter(search: string): Filter {
  const params = new URLSearchParams(search);
  const topic = params.get("topic");
  const view = params.get("view");
  return {
    query: params.get("q") ?? "",
    topic: isTopic(topic) ? topic : null,
    view: isView(view) ? view : DEFAULT_VIEW,
  };
}

export function filterSearch({ query, topic, view }: Filter): string {
  const params = new URLSearchParams();
  const trimmed = query.trim();
  if (trimmed !== "") params.set("q", trimmed);
  if (topic !== null) params.set("topic", topic);
  if (view !== DEFAULT_VIEW) params.set("view", view);
  const search = params.toString();
  return search === "" ? "" : `?${search}`;
}
