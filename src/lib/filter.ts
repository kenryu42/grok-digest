import { TOPICS, type Topic } from "./topics";

export function isTopic(value: string | null | undefined): value is Topic {
  return TOPICS.some((topic) => topic === value);
}

export function parseFilter(search: string): { query: string; topic: Topic | null } {
  const params = new URLSearchParams(search);
  const topic = params.get("topic");
  return {
    query: params.get("q") ?? "",
    topic: isTopic(topic) ? topic : null,
  };
}

export function filterSearch({ query, topic }: { query: string; topic: Topic | null }): string {
  const params = new URLSearchParams();
  const trimmed = query.trim();
  if (trimmed !== "") params.set("q", trimmed);
  if (topic !== null) params.set("topic", topic);
  const search = params.toString();
  return search === "" ? "" : `?${search}`;
}
