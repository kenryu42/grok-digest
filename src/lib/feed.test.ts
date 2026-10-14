import { describe, expect, it } from "vitest";
import { parseBookmarks } from "./bookmarks";
import { feedConfig } from "./feed";

const bookmarks = parseBookmarks({
  source: "test.json",
  raw: [
    {
      id: "1",
      url: "https://x.com/someone/status/1",
      author: { name: "A & B", handle: "someone" },
      posted_at: "2026-02-01",
      topic: "design",
      summary: "A summary.",
      text: "Watch <script> tags.",
      key_points: [],
    },
    {
      id: "2",
      url: "https://x.com/other/status/2",
      author: { name: "Other", handle: "other" },
      posted_at: "2026-01-01",
      topic: "other",
      summary: "No words.",
      text: "",
      key_points: ["One point."],
    },
  ],
});

const config = feedConfig({
  bookmarks,
  topic: "design",
  origin: "https://example.github.io",
  base: "/x-bookmarks/",
});

describe("feedConfig", () => {
  it("limits a topic feed to that topic and escapes the post", () => {
    expect(config.title).toBe("Bookmarks: Design");
    expect(config.items.map((item) => item.title)).toEqual(["A summary."]);
    const [item] = config.items;
    expect(item?.link).toBe("https://example.github.io/x-bookmarks/#b-1");
    expect(item?.content).toContain("&lt;script&gt;");
    expect(item?.content).toContain("A &amp; B");
    expect(item?.content).not.toContain("<script>");
  });

  it("names the feed address in the self link", () => {
    expect(config.customData).toContain("https://example.github.io/x-bookmarks/rss/design.xml");
  });

  it("keeps the project path when the base has no trailing slash", () => {
    const bare = feedConfig({ bookmarks, topic: null, origin: "https://example.github.io", base: "/x-bookmarks" });
    expect(bare.site).toBe("https://example.github.io/x-bookmarks/");
    expect(bare.customData).toContain("https://example.github.io/x-bookmarks/rss.xml");
    expect(bare.items[0]?.link).toBe("https://example.github.io/x-bookmarks/#b-1");
  });

  it("omits the quote when the post has no text", () => {
    const all = feedConfig({ bookmarks, topic: null, origin: "https://example.github.io", base: "/" });
    const quiet = all.items.find((item) => item.title === "No words.");
    expect(quiet?.content).not.toContain("<blockquote>");
    expect(quiet?.content).toContain("<li>One point.</li>");
    expect(all.customData).toContain("https://example.github.io/rss.xml");
  });
});
