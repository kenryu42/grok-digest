import { describe, expect, it } from "vitest";
import { parseBookmarks, SCHEMA_VERSION, stateFileSchema } from "../src/lib/bookmarks.ts";
import botWritten from "./fixtures/bookmarks-v1-bot.json";
import templateSamples from "./fixtures/bookmarks-v1-template.json";

const valid = {
  id: "1",
  url: "https://x.com/someone/status/1",
  author: { name: "Someone", handle: "@someone" },
  posted_at: "2026-02-01",
  saved_at: "2026-02-02T09:30:00+09:00",
  topic: "dev-tools",
  shelf_life: "evergreen",
  tldr: "A headline.",
  summary: "A summary.",
  text: "The original post.",
  key_points: ["One point."],
  action: "Try the CLI on a small repo.",
  links: [{ title: "The project's README", url: "https://github.com/someone/project" }],
};

const parse = (raw: unknown) => parseBookmarks({ raw, source: "test.json" });

describe("parseBookmarks", () => {
  it.each([
    ["the template samples", templateSamples],
    ["a file the Grok bot wrote", botWritten],
  ])("accepts version 1 files: %s", (_, file) => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(parse(file)).toHaveLength(file.length);
  });

  it("reads a bot timestamp and strips the @ from a handle", () => {
    const [newest, oldest] = parse(botWritten);
    expect(newest?.author.handle).toBe("Example_Lab");
    expect(oldest?.postedAt.toISOString()).toBe("2026-10-13T23:24:10.000Z");
  });

  it("maps the file format to the domain shape", () => {
    const [bookmark] = parse([valid]);
    expect(bookmark).toEqual({
      id: "1",
      url: "https://x.com/someone/status/1",
      author: { name: "Someone", handle: "someone" },
      postedAt: new Date("2026-02-01"),
      savedAt: new Date("2026-02-02T00:30:00Z"),
      topic: "dev-tools",
      shelfLife: "evergreen",
      tldr: "A headline.",
      summary: "A summary.",
      text: "The original post.",
      keyPoints: ["One point."],
      action: "Try the CLI on a small repo.",
      links: [{ title: "The project's README", url: "https://github.com/someone/project" }],
      media: [],
    });
  });

  it("keeps a post's images in thread order, with the short link that stands for them in the post", () => {
    const media = [
      {
        url: "https://pbs.twimg.com/media/GaBcDeFgHiJ.jpg",
        alt: "A terminal running the CLI",
        link: "pic.x.com/AbCdEf",
      },
      { url: "https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/KlMnOp.jpg" },
    ];
    expect(parse([{ ...valid, text: "The CLI. pic.x.com/AbCdEf", media }])[0]?.media).toEqual(media);
  });

  it("sorts by when the bookmark was saved, newest first", () => {
    const ids = parse([
      { ...valid, id: "saved-earlier", posted_at: "2026-03-01", saved_at: "2026-03-02T09:00:00+09:00" },
      { ...valid, id: "old-post-saved-later", posted_at: "2023-05-01", saved_at: "2026-03-03T09:00:00+09:00" },
    ]).map(({ id }) => id);
    expect(ids).toEqual(["old-post-saved-later", "saved-earlier"]);
  });

  it.each([
    ["an unknown topic", { ...valid, topic: "crypto" }, "topic"],
    ["a non-X url", { ...valid, url: "https://example.com/post/1" }, "url"],
    ["a bad date", { ...valid, posted_at: "Feb 1" }, "posted_at"],
    ["a save date without a time", { ...valid, saved_at: "2026-02-02" }, "saved_at"],
    ["a missing tldr", { ...valid, tldr: "" }, "tldr"],
    ["an unknown shelf life", { ...valid, shelf_life: "forever" }, "shelf_life"],
    ["a plain-http link", { ...valid, links: [{ title: "Blog", url: "http://example.com/post" }] }, "links"],
    ["a link without a title", { ...valid, links: [{ title: " ", url: "https://example.com/post" }] }, "links"],
    ["a misspelled field", { ...valid, keypoints: [] }, "keypoints"],
    ["a missing summary", { ...valid, summary: " " }, "summary"],
    ["an image behind a t.co link", { ...valid, media: [{ url: "https://t.co/AbCdEf" }] }, "media"],
    ["a plain-http image", { ...valid, media: [{ url: "http://pbs.twimg.com/media/GaBcDeFgHiJ.jpg" }] }, "media"],
    ["an empty alt text", { ...valid, media: [{ url: "https://pbs.twimg.com/media/A.jpg", alt: " " }] }, "media"],
    [
      "an image link that is not in the post",
      { ...valid, media: [{ url: "https://pbs.twimg.com/media/A.jpg", link: "https://t.co/Missing123" }] },
      "media",
    ],
    ["an image as a string", { ...valid, media: ["https://pbs.twimg.com/media/A.jpg"] }, "media"],
  ])("rejects %s", (_, entry, field) => {
    expect(() => parse([entry])).toThrow(field);
  });

  it("keeps an empty post", () => {
    expect(parse([{ ...valid, text: "  " }])[0]?.text).toBe("");
  });

  it("keeps a post with nothing to try and no links", () => {
    const [bookmark] = parse([{ ...valid, action: " ", links: [] }]);
    expect(bookmark?.action).toBe("");
    expect(bookmark?.links).toEqual([]);
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

describe("stateFileSchema", () => {
  it("accepts a list of ids", () => {
    expect(stateFileSchema.parse(["403121", "405309"])).toEqual(["403121", "405309"]);
    expect(stateFileSchema.parse([])).toEqual([]);
  });

  it("rejects anything else", () => {
    expect(stateFileSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(stateFileSchema.safeParse([""]).success).toBe(false);
  });
});
