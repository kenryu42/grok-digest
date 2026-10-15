import { describe, expect, it } from "vitest";
import { parseBookmarks } from "../src/lib/bookmarks.ts";
import type { View } from "../src/lib/filter.ts";
import { matchingIds, toSearchEntry } from "../src/lib/search.ts";
import type { Topic } from "../src/lib/topics.ts";

const base = {
  url: "https://x.com/someone/status/1",
  posted_at: "2026-02-01",
  saved_at: "2026-02-02T09:00:00+09:00",
  text: "",
  key_points: [],
  action: "",
  links: [],
};

const entries = parseBookmarks({
  source: "test.json",
  raw: [
    {
      ...base,
      id: "a",
      author: { name: "Agent Lab", handle: "agentlab" },
      topic: "ai-agents",
      tldr: "Agents should plan first",
      summary: "Planning loops for coding agents.",
      text: "The rule is plan-before-edit.",
      action: "Try a dry-run mode first",
      links: [{ title: "Planner design notes", url: "https://example.com/planner" }],
    },
    {
      ...base,
      id: "b",
      author: { name: "Tokyo Notes", handle: "tokyo" },
      topic: "japan-tech",
      tldr: "A meetup in Shibuya",
      summary: "東京のミートアップ",
      key_points: ["Local-first apps"],
    },
  ],
}).map(toSearchEntry);

const ids = (
  query: string,
  {
    topic = null,
    view = "all",
    done = [],
    review = [],
  }: { topic?: Topic | null; view?: View; done?: string[]; review?: string[] } = {},
) =>
  [
    ...matchingIds({
      entries,
      filter: { query, topic, view },
      triage: { done: new Set(done), review: new Set(review) },
    }),
  ].toSorted();

describe("matchingIds", () => {
  it("returns everything for an empty query and no topic", () => {
    expect(ids("  ")).toEqual(["a", "b"]);
  });

  it("matches every term, case-insensitively, across fields", () => {
    expect(ids("CODING agents")).toEqual(["a"]);
    expect(ids("local-first")).toEqual(["b"]);
    expect(ids("@tokyo")).toEqual(["b"]);
    expect(ids("plan-before-edit")).toEqual(["a"]);
    expect(ids("shibuya")).toEqual(["b"]);
    expect(ids("dry-run")).toEqual(["a"]);
    expect(ids("design notes")).toEqual(["a"]);
    expect(ids("coding tokyo")).toEqual([]);
  });

  it("matches Japanese text and full-width input", () => {
    expect(ids("東京")).toEqual(["b"]);
    expect(ids("ＡＧＥＮＴ")).toEqual(["a"]);
  });

  it("matches topic labels and filters by topic", () => {
    expect(ids("japan tech")).toEqual(["b"]);
    expect(ids("", { topic: "ai-agents" })).toEqual(["a"]);
    expect(ids("tokyo", { topic: "ai-agents" })).toEqual([]);
  });

  it("shows today's review, the inbox, or what is done", () => {
    expect(ids("", { view: "today", review: ["b"] })).toEqual(["b"]);
    expect(ids("", { view: "inbox", done: ["a"] })).toEqual(["b"]);
    expect(ids("", { view: "done", done: ["a"] })).toEqual(["a"]);
    expect(ids("", { view: "today", review: ["b"], topic: "ai-agents" })).toEqual([]);
  });

  it("searches every bookmark whatever the view", () => {
    expect(ids("agents", { view: "today", review: ["b"] })).toEqual(["a"]);
    expect(ids("agents", { view: "inbox", done: ["a"] })).toEqual(["a"]);
  });
});
