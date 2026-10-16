import { TOPICS, type Topic } from "./topics.ts";

export const VIEWS = ["today", "inbox", "done", "all"] as const;

export type View = (typeof VIEWS)[number];

export type Filter = { query: string; topic: Topic | null; view: View };

type Defaults = { view?: View; reviewIsEmpty?: boolean };

function defaultView({ view = "today", reviewIsEmpty = false }: Defaults): View {
  return view === "today" && reviewIsEmpty ? "inbox" : view;
}

export function isTopic(value: string | null | undefined): value is Topic {
  return TOPICS.some((topic) => topic === value);
}

function isView(value: string | null): value is View {
  return VIEWS.some((view) => view === value);
}

export function parseFilter(search: string, defaults: Defaults = {}): Filter {
  const params = new URLSearchParams(search);
  const topic = params.get("topic");
  const view = params.get("view");
  return {
    query: params.get("q") ?? "",
    topic: isTopic(topic) ? topic : null,
    view: isView(view) ? view : defaultView(defaults),
  };
}

export function filterSearch({ query, topic, view }: Filter, defaults: Defaults = {}): string {
  const params = new URLSearchParams();
  const trimmed = query.trim();
  if (trimmed !== "") params.set("q", trimmed);
  if (topic !== null) params.set("topic", topic);
  if (view !== defaultView(defaults)) params.set("view", view);
  const search = params.toString();
  return search === "" ? "" : `?${search}`;
}
