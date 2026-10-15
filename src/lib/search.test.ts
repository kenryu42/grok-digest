import { describe, expect, it } from "vitest";
import { parseBookmarks } from "./bookmarks";
import { matchingIds, toSearchEntry } from "./search";
import type { Topic } from "./topics";

const base = {
  url: "https://x.com/someone/status/1",
  posted_at: "2026-02-01",
  text: "",
  key_points: [],
};

const entries = parseBookmarks({
  source: "test.json",
  raw: [
    {
      ...base,
      id: "a",
      author: { name: "Agent Lab", handle: "agentlab" },
      topic: "ai-agents",
      summary: "Planning loops for coding agents.",
      text: "The rule is plan-before-edit.",
    },
    {
      ...base,
      id: "b",
      author: { name: "Tokyo Notes", handle: "tokyo" },
      topic: "japan-tech",
      summary: "東京のミートアップ",
      key_points: ["Local-first apps"],
    },
  ],
}).map(toSearchEntry);

const ids = (query: string, topic: Topic | null = null) => [...matchingIds({ entries, query, topic })].toSorted();

describe("matchingIds", () => {
  it("returns everything for an empty query and no topic", () => {
    expect(ids("  ")).toEqual(["a", "b"]);
  });

  it("matches every term, case-insensitively, across fields", () => {
    expect(ids("CODING agents")).toEqual(["a"]);
    expect(ids("local-first")).toEqual(["b"]);
    expect(ids("@tokyo")).toEqual(["b"]);
    expect(ids("plan-before-edit")).toEqual(["a"]);
    expect(ids("coding tokyo")).toEqual([]);
  });

  it("matches Japanese text and full-width input", () => {
    expect(ids("東京")).toEqual(["b"]);
    expect(ids("ＡＧＥＮＴ")).toEqual(["a"]);
  });

  it("matches topic labels and filters by topic", () => {
    expect(ids("japan tech")).toEqual(["b"]);
    expect(ids("", "ai-agents")).toEqual(["a"]);
    expect(ids("tokyo", "ai-agents")).toEqual([]);
  });
});
