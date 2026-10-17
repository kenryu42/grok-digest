import { describe, expect, it } from "vitest";
import { parseBookmarks } from "../src/lib/bookmarks.ts";
import { feedConfig } from "../src/lib/feed.ts";

const bookmarks = parseBookmarks({
  source: "test.json",
  raw: [
    {
      id: "1",
      url: "https://x.com/someone/status/1",
      author: { name: "A & B", handle: "someone" },
      posted_at: "2026-02-01",
      saved_at: "2026-02-03T08:00:00+09:00",
      topic: "design",
      shelf_life: "evergreen",
      tldr: "A headline.",
      summary: "A summary.",
      text: "Watch <script> tags. https://t.co/Aaaaaaaaa1\n\nThe end.",
      key_points: [],
      action: "Try <b>this</b>.",
      links: [
        { title: "Docs & guide", url: "https://example.com/docs?a=1&b=2" },
        {
          title: "The launch post",
          url: "https://example.com/launch",
          image: "https://pbs.twimg.com/card_img/1/AbCd?format=jpg&name=small",
        },
      ],
      media: [
        {
          url: "https://pbs.twimg.com/media/GaBcDeFgHiJ?format=jpg&name=large",
          alt: 'A "before" screenshot',
          link: "https://t.co/Aaaaaaaaa1",
        },
      ],
    },
    {
      id: "2",
      url: "https://x.com/other/status/2",
      author: { name: "Other", handle: "other" },
      posted_at: "2026-01-01",
      saved_at: "2026-01-02T08:00:00+09:00",
      topic: "other",
      shelf_life: "evergreen",
      tldr: "No words.",
      summary: "No words.",
      text: "",
      key_points: ["One point."],
      action: "",
      links: [],
    },
  ],
});

const config = feedConfig({
  bookmarks,
  topic: "design",
  origin: "https://example.github.io",
  base: "/grok-digest/",
});

describe("feedConfig", () => {
  it("limits a topic feed to that topic and escapes the post", () => {
    expect(config.title).toBe("Bookmarks: Design");
    expect(config.items).toHaveLength(1);
    const [item] = config.items;
    expect(item?.link).toBe("https://example.github.io/grok-digest/#b-1");
    expect(item?.content).toContain("&lt;script&gt;");
    expect(item?.content).toContain("A &amp; B");
    expect(item?.content).not.toContain("<script>");
  });

  it("titles an item with the tldr, dates it by the save, and keeps the summary in the body", () => {
    const [item] = config.items;
    expect(item?.title).toBe("A headline.");
    expect(item?.pubDate).toEqual(new Date("2026-02-02T23:00:00Z"));
    expect(item?.content).toContain("<p>A summary.</p>");
  });

  it("includes what to try and the post's links, escaped", () => {
    const [item] = config.items;
    expect(item?.content).toContain("<p>Try: Try &lt;b&gt;this&lt;/b&gt;.</p>");
    expect(item?.content).toContain('<li><a href="https://example.com/docs?a=1&amp;b=2">Docs &amp; guide</a></li>');
  });

  it("shows a link's preview image inside the link, above its title", () => {
    const [item] = config.items;
    expect(item?.content).toContain(
      '<li><a href="https://example.com/launch"><img src="https://pbs.twimg.com/card_img/1/AbCd?format=jpg&amp;name=small" alt=""><br>The launch post</a></li>',
    );
  });

  it("shows each image in the post in place of its short link, escaped", () => {
    const [item] = config.items;
    expect(item?.content).toContain(
      [
        "<blockquote>",
        "<p>Watch &lt;script&gt; tags.</p>",
        '<p><img src="https://pbs.twimg.com/media/GaBcDeFgHiJ?format=jpg&amp;name=large" alt="A &quot;before&quot; screenshot"></p>',
        "<p>The end.</p>",
        "</blockquote>",
      ].join(""),
    );
    expect(item?.content).not.toContain("t.co/");
  });

  it("names the feed address in the self link", () => {
    expect(config.customData).toContain("https://example.github.io/grok-digest/rss/design.xml");
  });

  it("keeps the project path when the base has no trailing slash", () => {
    const bare = feedConfig({ bookmarks, topic: null, origin: "https://example.github.io", base: "/grok-digest" });
    expect(bare.site).toBe("https://example.github.io/grok-digest/");
    expect(bare.customData).toContain("https://example.github.io/grok-digest/rss.xml");
    expect(bare.items[0]?.link).toBe("https://example.github.io/grok-digest/#b-1");
  });

  it("omits the quote when the post has no text", () => {
    const all = feedConfig({ bookmarks, topic: null, origin: "https://example.github.io", base: "/" });
    const quiet = all.items.find((item) => item.title === "No words.");
    expect(quiet?.content).not.toContain("<blockquote>");
    expect(quiet?.content).not.toContain("Try:");
    expect(quiet?.content).toContain("<li>One point.</li>");
    expect(all.customData).toContain("https://example.github.io/rss.xml");
  });

  it("shows a link with a short link in place in the post, and links every other address", () => {
    const [linked] = parseBookmarks({
      source: "test.json",
      raw: [
        {
          id: "3",
          url: "https://x.com/someone/status/3",
          author: { name: "Someone", handle: "someone" },
          posted_at: "2026-02-01",
          saved_at: "2026-02-03T08:00:00+09:00",
          topic: "dev-tools",
          shelf_life: "evergreen",
          tldr: "Docs.",
          summary: "Docs.",
          key_points: [],
          action: "",
          text: "Read the docs https://t.co/Docs123456\n\nNotes at https://example.org/notes.",
          links: [{ title: "Docs", url: "https://example.com/docs", short: "https://t.co/Docs123456" }],
        },
      ],
    });
    const feed = feedConfig({
      bookmarks: linked === undefined ? [] : [linked],
      topic: null,
      origin: "https://example.github.io",
      base: "/",
    });
    const content = feed.items[0]?.content ?? "";
    expect(content).toContain(
      [
        "<blockquote>",
        "<p>Read the docs</p>",
        '<p><a href="https://example.com/docs">Docs</a></p>',
        '<p>Notes at <a href="https://example.org/notes">https://example.org/notes</a>.</p>',
        "</blockquote>",
      ].join(""),
    );
    expect(content).not.toContain("<li><a");
  });
});
