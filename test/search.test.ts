import { describe, expect, it } from "vitest";
import { parseBookmarks } from "../src/lib/bookmarks.ts";
import { DEFAULT_FILTER, type Filter } from "../src/lib/filter.ts";
import { matchingIds, sortedIds, toSearchEntry } from "../src/lib/search.ts";

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
      shelf_life: "evergreen",
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
      shelf_life: "evergreen",
      tldr: "A meetup in Shibuya",
      summary: "東京のミートアップ",
      key_points: ["Local-first apps"],
    },
    {
      ...base,
      id: "c",
      author: { name: "Daily Wire", handle: "wire" },
      topic: "design",
      shelf_life: "news",
      posted_at: "2026-01-15",
      saved_at: "2026-02-03T09:00:00+09:00",
      tldr: "A model launched today",
      summary: "Launch news.",
    },
  ],
}).map(toSearchEntry);

const ids = (query: string, filter: Partial<Filter> = {}, done: string[] = []) =>
  [...matchingIds({ entries, filter: { ...DEFAULT_FILTER, ...filter, query }, done: new Set(done) })].toSorted();

describe("matchingIds", () => {
  it("lists every bookmark not done for an empty query and no topic", () => {
    expect(ids("  ")).toEqual(["a", "b", "c"]);
    expect(ids("", {}, ["a"])).toEqual(["b", "c"]);
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
    expect(ids("", { topic: "design" })).toEqual(["c"]);
    expect(ids("tokyo", { topic: "ai-agents" })).toEqual([]);
  });

  it("shows done bookmarks only when asked, and hides news when asked", () => {
    expect(ids("", { showDone: true }, ["a"])).toEqual(["a", "b", "c"]);
    expect(ids("", { hideNews: true })).toEqual(["a", "b"]);
    expect(ids("", { hideNews: true, topic: "design" })).toEqual([]);
  });

  it("searches every bookmark in the topic, done or news", () => {
    expect(ids("agents", { hideNews: true }, ["a"])).toEqual(["a"]);
    expect(ids("launch", { hideNews: true })).toEqual(["c"]);
  });
});

describe("sortedIds", () => {
  it("orders by save date, newest or oldest first, or by post date, newest first", () => {
    expect(sortedIds(entries, "newest")).toEqual(["c", "a", "b"]);
    expect(sortedIds(entries, "oldest")).toEqual(["a", "b", "c"]);
    expect(sortedIds(entries, "posted")).toEqual(["a", "b", "c"]);
  });
});
