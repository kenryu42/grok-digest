import { describe, expect, it } from "vitest";
import shipped from "../../data/bookmarks.json";
import { parseBookmarks } from "./bookmarks";

const valid = {
  id: "1",
  url: "https://x.com/someone/status/1",
  author: { name: "Someone", handle: "@someone" },
  posted_at: "2026-02-01",
  topic: "dev-tools",
  summary: "A summary.",
  text: "The original post.",
  key_points: ["One point."],
};

const parse = (raw: unknown) => parseBookmarks({ raw, source: "test.json" });

describe("parseBookmarks", () => {
  it("accepts the shipped data/bookmarks.json", () => {
    expect(parse(shipped).length).toBeGreaterThan(0);
  });

  it("maps the file format to the domain shape", () => {
    const [bookmark] = parse([valid]);
    expect(bookmark).toEqual({
      id: "1",
      url: "https://x.com/someone/status/1",
      author: { name: "Someone", handle: "someone" },
      postedAt: new Date("2026-02-01"),
      topic: "dev-tools",
      summary: "A summary.",
      text: "The original post.",
      keyPoints: ["One point."],
    });
  });

  it("sorts newest first", () => {
    const ids = parse([
      { ...valid, id: "old", posted_at: "2025-01-01" },
      { ...valid, id: "new", posted_at: "2026-03-01T09:00:00+09:00" },
    ]).map(({ id }) => id);
    expect(ids).toEqual(["new", "old"]);
  });

  it.each([
    ["an unknown topic", { ...valid, topic: "crypto" }, "topic"],
    ["a non-X url", { ...valid, url: "https://example.com/post/1" }, "url"],
    ["a bad date", { ...valid, posted_at: "Feb 1" }, "posted_at"],
    ["a misspelled field", { ...valid, keypoints: [] }, "keypoints"],
    ["a missing summary", { ...valid, summary: " " }, "summary"],
  ])("rejects %s", (_, entry, field) => {
    expect(() => parse([entry])).toThrow(field);
  });

  it("keeps an empty post", () => {
    expect(parse([{ ...valid, text: "  " }])[0]?.text).toBe("");
  });

  it("rejects a missing post", () => {
    const raw: Record<string, unknown> = { ...valid };
    delete raw["text"];
    expect(() => parse([raw])).toThrow("text");
  });

  it("rejects duplicate ids", () => {
    expect(() => parse([valid, valid])).toThrow('duplicate id "1"');
  });

  it("rejects a file that is not an array", () => {
    expect(() => parse({ bookmarks: [valid] })).toThrow("test.json is invalid");
  });
});
