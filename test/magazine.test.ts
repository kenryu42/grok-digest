import { describe, expect, it } from "vitest";
import { parseBookmarks } from "../src/lib/bookmarks.ts";
import {
  issueDateLabel,
  issueShortDateLabel,
  MAGAZINE_BLOCK_TYPES,
  parseMagazine,
  parseMagazineIssue,
} from "../src/lib/magazine.ts";
import { entryFinder, issueWarnings, readableIssue } from "../src/lib/magazine-check.ts";
import { magazineFeedConfig } from "../src/lib/magazine-feed.ts";
import { postFinder } from "../src/lib/posts.ts";
import samples from "../template/data/bookmarks.json";

const bookmarks = parseBookmarks({ raw: samples, source: "data/bookmarks.json" });
const byId = postFinder(bookmarks, []);
const [agents, tokyo, design] = samples.map(({ id }) => id);
const SOURCE = "data/magazine/2026-10-19.json";
const QUOTE = "We let the agent write a plan,\n and then we wait.";

const issue = {
  date: "2026-10-19",
  title: "Agents that ask first",
  theme: { palette: "ocean", fonts: "serif-sans" },
  sections: [{ type: "cover-story", bookmark: agents, headline: "Plan, then wait" }],
};

const withSections = (...sections: unknown[]) => ({ ...issue, sections });
const parse = (raw: unknown) => parseMagazineIssue({ raw, source: SOURCE });

const typesOf = (raw: unknown) => readableIssue(parse(raw), byId).sections.map(({ type }) => type);

const warningsOf = (raw: unknown, latestToday = "2026-10-20") =>
  issueWarnings({ issue: parse(raw), bookmarks, latestToday });

const spansOf = (raw: unknown) => readableIssue(parse(raw), byId).sections.map(({ type, span }) => `${type}:${span}`);
const half = (type: string, bookmark: string | undefined) => ({ type, bookmark, span: "half" });

function errorOf(raw: unknown, source = SOURCE): string {
  try {
    parseMagazineIssue({ raw, source });
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const allBlocks = withSections(
  { type: "cover-story", bookmark: agents, headline: "Cover", deck: "Deck", kicker: "Cover story" },
  { type: "feature", bookmark: tokyo, variant: "aside", emphasis: "loud", span: "half" },
  { type: "pull-quote", bookmark: agents, quote: QUOTE, span: "half" },
  { type: "photo-spread", items: [{ bookmark: design }] },
  {
    type: "brief-grid",
    columns: 3,
    items: [
      { bookmark: tokyo, note: "Why" },
      { bookmark: design, headline: "Short" },
    ],
  },
  { type: "numbered-list", items: [{ bookmark: tokyo, note: "Why" }, { bookmark: design }] },
  { type: "compare", items: [{ bookmark: agents, label: "A", note: "One" }, { bookmark: design }], verdict: "Both." },
  { type: "timeline", items: [{ bookmark: design }, { bookmark: tokyo, label: "Meetup", note: "Then" }] },
  { type: "topic-divider", topic: "design", variant: "band" },
  { type: "sidebar-box", bookmark: agents, headline: "Try this" },
  { type: "corner", corner: "kicker" },
  { type: "closer", bookmark: design, note: "To end on." },
);

describe("magazine issue schema", () => {
  it("accepts an issue and fills in each block's default variant, emphasis and span", () => {
    expect(parse(issue).sections).toEqual([
      {
        type: "cover-story",
        bookmark: agents,
        headline: "Plan, then wait",
        tags: [],
        variant: "stacked",
        emphasis: "normal",
        span: "full",
      },
    ]);
  });

  it("accepts every block type without looking at the bookmarks", () => {
    expect(parse(allBlocks).sections.map(({ type }) => type)).toEqual(MAGAZINE_BLOCK_TYPES);
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
    ["a bad span", withSections({ ...issue.sections[0], span: "third" }), "sections[0].span"],
    ["a headline that is too long", withSections({ ...issue.sections[0], headline: "x".repeat(121) }), "headline"],
    [
      "a note that is too long",
      withSections({ type: "compare", items: [{ bookmark: agents, note: "x".repeat(201) }, { bookmark: tokyo }] }),
      "sections[0].items[0].note",
    ],
    ["one side in a compare", withSections({ type: "compare", items: [{ bookmark: agents }] }), "sections[0].items"],
    ["five columns", withSections({ type: "brief-grid", columns: 5, items: [] }), "sections[0].columns"],
  ])("rejects %s, naming the file and the field", (_case, raw, field) => {
    const error = errorOf(raw);
    expect(error).toContain(`${SOURCE} is invalid:`);
    expect(error).toContain(field);
  });

  it("rejects a date that does not match the file name", () => {
    expect(errorOf({ ...issue, date: "2026-10-18" })).toMatch(
      /must match the file name 2026-10-19\.json\n {2}→ at date/,
    );
  });

  it("rejects a file not named after a date before it looks at the contents", () => {
    expect(errorOf({}, "data/magazine/notes.json")).toBe(
      "data/magazine/notes.json is not an issue: name an issue after its date, such as 2026-10-19.json",
    );
  });

  it("reads the date from a Windows path too", () => {
    expect(errorOf(issue, "data\\magazine\\2026-10-19.json")).toBe("");
  });
});

describe("readableIssue", () => {
  it("keeps two half blocks in a row side by side, and widens a half block left without a partner", () => {
    expect(spansOf(withSections(half("feature", tokyo), half("feature", design)))).toEqual([
      "feature:half",
      "feature:half",
    ]);
    expect(
      spansOf(
        withSections(half("feature", tokyo), half("feature", design), half("feature", agents), issue.sections[0]),
      ),
    ).toEqual(["feature:half", "feature:half", "feature:full", "cover-story:full"]);
    expect(spansOf(withSections(half("feature", tokyo), issue.sections[0], half("feature", design)))).toEqual([
      "feature:full",
      "cover-story:full",
      "feature:full",
    ]);
  });

  it("widens a half block whose partner the page leaves out", () => {
    expect(spansOf(withSections(half("feature", "gone"), { ...half("pull-quote", agents), quote: QUOTE }))).toEqual([
      "pull-quote:full",
    ]);
  });

  it("keeps every block whose bookmarks exist and fit it", () => {
    expect(typesOf(allBlocks)).toEqual(MAGAZINE_BLOCK_TYPES.filter((type) => type !== "photo-spread"));
  });

  it("leaves out an item whose bookmark is missing and keeps the rest of the block", () => {
    const [grid] = readableIssue(
      parse(
        withSections({ type: "brief-grid", items: [{ bookmark: agents }, { bookmark: "gone" }, { bookmark: tokyo }] }),
      ),
      byId,
    ).sections;
    expect(grid?.type === "brief-grid" && grid.items.map(({ bookmark }) => bookmark)).toEqual([agents, tokyo]);
  });

  it("leaves out a block that a missing bookmark drops below its fewest items", () => {
    expect(typesOf(withSections({ type: "compare", items: [{ bookmark: agents }, { bookmark: "gone" }] }))).toEqual([]);
    expect(typesOf(withSections({ type: "timeline", items: [{ bookmark: "gone" }, { bookmark: tokyo }] }))).toEqual([]);
  });

  it("leaves out a one-bookmark block whose bookmark is missing or no longer fits it", () => {
    expect(
      typesOf(
        withSections(
          { type: "feature", bookmark: "gone" },
          { type: "pull-quote", bookmark: agents, quote: "Agents never wait." },
          { type: "sidebar-box", bookmark: tokyo },
          { type: "photo-spread", items: [{ bookmark: design }] },
          { type: "topic-divider", topic: "design" },
        ),
      ),
    ).toEqual(["topic-divider"]);
  });
});

describe("issueWarnings", () => {
  it("has none for an issue whose bookmarks all fit", () => {
    const fitting = withSections(
      { type: "cover-story", bookmark: agents, headline: "Cover", emphasis: "loud" },
      { type: "pull-quote", bookmark: agents, quote: QUOTE },
      { type: "brief-grid", items: [{ bookmark: tokyo }, { bookmark: design }] },
    );
    expect(warningsOf(fitting)).toEqual([]);
  });

  it("names each missing bookmark and what the page does without it", () => {
    expect(
      warningsOf(
        withSections(
          { type: "feature", bookmark: "404" },
          { type: "brief-grid", items: [{ bookmark: agents }, { bookmark: tokyo }, { bookmark: "405" }] },
          { type: "compare", items: [{ bookmark: agents }, { bookmark: "406" }] },
        ),
      ),
    ).toEqual([
      {
        path: ["sections", 0, "bookmark"],
        message: '"404" is not a bookmark id in bookmarks.json; the page leaves the block out',
      },
      {
        path: ["sections", 1, "items", 2, "bookmark"],
        message: '"405" is not a bookmark id in bookmarks.json; the page leaves the item out',
      },
      {
        path: ["sections", 2, "items", 1, "bookmark"],
        message: '"406" is not a bookmark id in bookmarks.json; the page leaves the block out',
      },
    ]);
  });

  it("points a quote that is not in the post at the quote, and a bookmark that no longer fits at the bookmark", () => {
    expect(
      warningsOf(
        withSections(
          { type: "pull-quote", bookmark: agents, quote: "Agents never wait." },
          { type: "sidebar-box", bookmark: tokyo },
          { type: "photo-spread", items: [{ bookmark: design }] },
        ),
      ),
    ).toEqual([
      {
        path: ["sections", 0, "quote"],
        message: `the quote is not in the text of bookmark "${agents}"; the page leaves the block out`,
      },
      {
        path: ["sections", 1, "bookmark"],
        message: `bookmark "${tokyo}" has no action; the page leaves the block out`,
      },
      {
        path: ["sections", 2, "items", 0, "bookmark"],
        message: `bookmark "${design}" has no media; the page leaves the block out`,
      },
    ]);
  });

  it("warns about a second loud block, a bookmark in three blocks, and a date in the future", () => {
    const loud = { type: "feature", bookmark: agents, emphasis: "loud" };
    expect(warningsOf(withSections(loud, loud, { type: "sidebar-box", bookmark: agents }), "2026-10-18")).toEqual([
      { path: ["date"], message: '"2026-10-19" is in the future' },
      { path: ["sections", 1, "emphasis"], message: 'use "loud" on at most 1 block' },
      { path: ["sections", 2], message: `bookmark "${agents}" is in 3 blocks; show it in at most 2` },
    ]);
  });
});

describe("parseMagazine", () => {
  it("orders issues newest first", () => {
    const parsed = parseMagazine(
      ["2026-10-17", "2026-10-19", "2026-10-18"].map((date) => ({
        source: `data/magazine/${date}.json`,
        raw: { ...issue, date },
      })),
    );
    expect(parsed.map(({ date }) => date)).toEqual(["2026-10-19", "2026-10-18", "2026-10-17"]);
  });
});

describe("issue dates", () => {
  it("shows the file's calendar date, weekday included", () => {
    expect(issueDateLabel("2026-10-19")).toBe("Monday, October 19, 2026");
    expect(issueDateLabel("2024-02-29")).toBe("Thursday, February 29, 2024");
    expect(issueDateLabel("2027-01-01")).toBe("Friday, January 1, 2027");
    expect(issueShortDateLabel("2026-10-19")).toBe("Oct 19, 2026");
  });
});

describe("magazineFeedConfig", () => {
  it("links each issue and the cards it covers under the base path, escaped, dated by the issue's day", () => {
    const parsed = parse({ ...issue, title: "Plans & <waits>", subtitle: "A <b>bold</b> week" });
    const feed = magazineFeedConfig({
      issues: [parsed],
      find: entryFinder(byId),
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
        pubDate: new Date(Date.UTC(2026, 9, 19)),
      },
    ]);
  });
});
