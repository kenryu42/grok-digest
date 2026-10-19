import { describe, expect, it } from "vitest";
import { parseBookmarks } from "../src/lib/bookmarks.ts";
import { bookmarkFinder, MAGAZINE_BLOCK_TYPES, parseMagazine, parseMagazineIssue } from "../src/lib/magazine.ts";
import { magazineFeedConfig } from "../src/lib/magazine-feed.ts";
import samples from "../template/data/bookmarks.json";

const bookmarks = parseBookmarks({ raw: samples, source: "data/bookmarks.json" });
const [agents, tokyo, design] = samples.map(({ id }) => id);
const SOURCE = "data/magazine/2026-10-19.json";

const issue = {
  date: "2026-10-19",
  title: "Agents that ask first",
  theme: { palette: "ocean", fonts: "serif-sans" },
  sections: [{ type: "cover-story", bookmark: agents, headline: "Plan, then wait" }],
};

const withSections = (...sections: unknown[]) => ({ ...issue, sections });

function errorOf(raw: unknown, source = SOURCE): string {
  try {
    parseMagazineIssue({ raw, source, bookmarks });
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("magazine issue schema", () => {
  it("accepts an issue and fills in each block's default variant and emphasis", () => {
    const parsed = parseMagazineIssue({ raw: issue, source: SOURCE, bookmarks });
    expect(parsed.sections).toEqual([
      { type: "cover-story", bookmark: agents, headline: "Plan, then wait", variant: "stacked", emphasis: "normal" },
    ]);
  });

  it("accepts every block type", () => {
    const parsed = parseMagazineIssue({
      raw: withSections(
        { type: "cover-story", bookmark: agents, headline: "Cover", deck: "Deck", kicker: "Cover story" },
        { type: "feature", bookmark: tokyo, variant: "aside", emphasis: "loud" },
        { type: "pull-quote", bookmark: agents, quote: "We let the agent write a plan,\n and then we wait." },
        { type: "brief-grid", columns: 3, items: [{ bookmark: tokyo }, { bookmark: design, headline: "Short" }] },
        { type: "numbered-list", items: [{ bookmark: tokyo, note: "Why" }, { bookmark: design }] },
        { type: "compare", items: [{ bookmark: agents, label: "A" }, { bookmark: design }], verdict: "Both." },
        { type: "timeline", items: [{ bookmark: design }, { bookmark: tokyo, label: "Meetup" }] },
        { type: "topic-divider", topic: "design", variant: "band" },
        { type: "sidebar-box", bookmark: agents, headline: "Try this" },
      ),
      source: SOURCE,
      bookmarks,
    });
    expect(parsed.sections.map(({ type }) => type)).toEqual(
      MAGAZINE_BLOCK_TYPES.filter((type) => type !== "photo-spread"),
    );
  });

  it.each([
    ["an unknown key", { ...issue, layout: "grid" }, "Unrecognized key"],
    ["an unknown palette", { ...issue, theme: { palette: "rainbow", fonts: "serif" } }, "theme.palette"],
    ["an unknown font pairing", { ...issue, theme: { palette: "ocean", fonts: "comic" } }, "theme.fonts"],
    [
      "raw CSS as the accent",
      { ...issue, theme: { ...issue.theme, accent: "red; background: url(x)" } },
      "theme.accent",
    ],
    ["CSS in the theme", { ...issue, theme: { ...issue.theme, css: "body{}" } }, '"css"'],
    ["a date that is not a date", { ...issue, date: "19 October" }, "date"],
    ["a title that is too long", { ...issue, title: "x".repeat(81) }, "title"],
    ["no sections", withSections(), "sections"],
    ["an unknown block type", withSections({ type: "iframe", bookmark: agents }), "sections[0].type"],
    ["a URL in a block", withSections({ ...issue.sections[0], url: "https://example.com" }), '"url"'],
    ["a bad variant", withSections({ ...issue.sections[0], variant: "spinning" }), "sections[0].variant"],
    ["a bad emphasis", withSections({ ...issue.sections[0], emphasis: "blink" }), "sections[0].emphasis"],
    ["a headline that is too long", withSections({ ...issue.sections[0], headline: "x".repeat(121) }), "headline"],
    ["one side in a compare", withSections({ type: "compare", items: [{ bookmark: agents }] }), "sections[0].items"],
    ["five columns", withSections({ type: "brief-grid", columns: 5, items: [] }), "sections[0].columns"],
  ])("rejects %s, naming the file and the field", (_case, raw, field) => {
    const error = errorOf(raw);
    expect(error).toContain(`${SOURCE} is invalid:`);
    expect(error).toContain(field);
  });

  it("rejects a date that does not match the file name", () => {
    expect(errorOf({ ...issue, date: "2026-10-18" })).toMatch(
      /"2026-10-18" does not match the file name 2026-10-19\.json\n {2}→ at date/,
    );
  });

  it("reads the date from a Windows path too", () => {
    expect(errorOf(issue, "data\\magazine\\2026-10-19.json")).toBe("");
  });

  it("rejects a file name that is not a date", () => {
    expect(errorOf(issue, "data/magazine/latest.json")).toContain(
      "data/magazine/latest.json is invalid:\n✖ the file name must be the issue's date, such as 2026-10-19.json",
    );
  });

  it("rejects a bookmark id that is not in bookmarks.json, naming the field", () => {
    expect(errorOf(withSections({ ...issue.sections[0], bookmark: "404" }))).toMatch(
      /"404" is not a bookmark id in bookmarks\.json\n {2}→ at sections\[0\]\.bookmark/,
    );
    expect(errorOf(withSections({ type: "timeline", items: [{ bookmark: tokyo }, { bookmark: "405" }] }))).toMatch(
      /"405" is not a bookmark id in bookmarks\.json\n {2}→ at sections\[0\]\.items\[1\]\.bookmark/,
    );
  });

  it("rejects a quote that is not in the post, a photo spread without photos, and a box without an action", () => {
    expect(errorOf(withSections({ type: "pull-quote", bookmark: agents, quote: "Agents never wait." }))).toMatch(
      /must be copied word for word from the text of bookmark "1000000000000000001"\n {2}→ at sections\[0\]\.quote/,
    );
    expect(errorOf(withSections({ type: "photo-spread", items: [{ bookmark: design }] }))).toMatch(
      /bookmark "1000000000000000003" has no media to show\n {2}→ at sections\[0\]\.items\[0\]\.bookmark/,
    );
    expect(errorOf(withSections({ type: "sidebar-box", bookmark: tokyo }))).toMatch(
      /bookmark "1000000000000000002" has no action to show\n {2}→ at sections\[0\]\.bookmark/,
    );
  });
});

describe("parseMagazine", () => {
  it("orders issues newest first", () => {
    const parsed = parseMagazine({
      files: ["2026-10-17", "2026-10-19", "2026-10-18"].map((date) => ({
        source: `data/magazine/${date}.json`,
        raw: { ...issue, date },
      })),
      bookmarks,
    });
    expect(parsed.map(({ date }) => date)).toEqual(["2026-10-19", "2026-10-18", "2026-10-17"]);
  });
});

describe("magazineFeedConfig", () => {
  it("links each issue and the cards it covers under the base path, escaped", () => {
    const parsed = parseMagazineIssue({
      raw: { ...issue, title: "Plans & <waits>", subtitle: "A <b>bold</b> week" },
      source: SOURCE,
      bookmarks,
    });
    const feed = magazineFeedConfig({
      issues: [parsed],
      find: bookmarkFinder(bookmarks),
      origin: "https://example.github.io",
      base: "/grok-digest",
    });
    expect(feed.site).toBe("https://example.github.io/grok-digest/magazine/");
    expect(feed.customData).toContain("https://example.github.io/grok-digest/magazine/rss.xml");
    expect(feed.items).toEqual([
      {
        title: "Plans & <waits>",
        link: "https://example.github.io/grok-digest/magazine/2026-10-19/",
        description: "A <b>bold</b> week",
        content: `<p>A &lt;b&gt;bold&lt;/b&gt; week</p><ul><li><a href="https://example.github.io/grok-digest/#b-${agents}">Make the coding agent plan before it edits</a></li></ul>`,
        pubDate: new Date("2026-10-19"),
      },
    ]);
  });
});
