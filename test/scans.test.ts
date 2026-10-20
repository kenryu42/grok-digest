import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBookmarks, parseScans } from "../src/lib/bookmarks.ts";
import { feedConfig } from "../src/lib/feed.ts";
import { DEFAULT_FILTER, filterSearch, parseFilter } from "../src/lib/filter.ts";
import { langOf } from "../src/lib/lang.ts";
import { issueContents, parseMagazineIssue, sectionHeading, type MagazineIssue } from "../src/lib/magazine.ts";
import { entryFinder, issueWarnings, readableIssue } from "../src/lib/magazine-check.ts";
import { pagePosts, postFinder } from "../src/lib/posts.ts";
import { matchingIds, toSearchEntry } from "../src/lib/search.ts";
import samples from "../template/data/bookmarks.json";

const SOURCE = "data/magazine/2026-10-20.json";
const bookmarks = parseBookmarks({ raw: samples, source: "data/bookmarks.json" });
const [agents, tokyo, design] = samples.map(({ id }) => id);

const scanEntry = (id: string, extra: object = {}) => ({
  id,
  url: `https://x.com/naturenews/status/${id}`,
  author: { name: "Nature News", handle: "naturenews" },
  posted_at: "2026-10-19",
  saved_at: "2026-10-20T08:00:00+09:00",
  topic: "science",
  shelf_life: "evergreen",
  tldr: `Scan ${id}`,
  summary: "A finding worth knowing.",
  text: "",
  key_points: [],
  action: "",
  links: [{ title: "The paper", url: "https://www.nature.com/articles/x" }],
  ...extra,
});

const scans = parseScans({
  source: "data/scans.json",
  raw: [
    scanEntry("901", { pick: true }),
    scanEntry("902"),
    scanEntry("903", { links: [] }),
    scanEntry(agents ?? "", { pick: true }),
  ],
});
const find = postFinder(bookmarks, scans);

const parse = (sections: unknown[]): MagazineIssue =>
  parseMagazineIssue({
    raw: { date: "2026-10-20", title: "Scans", theme: { palette: "forest", fonts: "serif" }, sections },
    source: SOURCE,
  });

function errorOf(sections: unknown[]): string {
  try {
    parse(sections);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const warningsOf = (sections: unknown[]) =>
  issueWarnings({ issue: parse(sections), bookmarks, scans, latestToday: "2026-10-21" });

const brief = (...items: object[]) => ({ type: "brief-grid", items });
const parseRaw = (raw: unknown[]) => () => parseScans({ raw, source: "data/scans.json" });
const anchorOf = (index: number) => `s-${index + 1}`;
const corner = (name: string) => ({ type: "corner", corner: name });

describe("data/scans.json", () => {
  it("takes a bookmark entry plus pick, false when left out", () => {
    expect(scans.map(({ id, pick }) => [id, pick])).toEqual([
      ["901", true],
      ["902", false],
      ["903", false],
      [agents, true],
    ]);
  });

  it("rejects a field a bookmark does not have, an invalid one, and a duplicate id, naming the entry", () => {
    expect(parseRaw([scanEntry("1", { source: "scan" })])).toThrow(/data\/scans\.json is invalid:[\s\S]*"source"/);
    expect(parseRaw([scanEntry("1", { pick: "yes" })])).toThrow(/at \[0\]\.pick/);
    expect(parseRaw([scanEntry("1", { topic: "crypto" })])).toThrow(/at \[0\]\.topic/);
    expect(parseRaw([scanEntry("1"), scanEntry("1")])).toThrow(/duplicate id "1"[\s\S]*at \[1\]\.id/);
  });
});

describe("pagePosts", () => {
  it("adds the strong picks to the bookmarks, newest saved first, and leaves out a scan the owner saved", () => {
    const posts = pagePosts(bookmarks, scans);
    expect(posts.filter(({ source }) => source === "scan").map(({ id }) => id)).toEqual(["901"]);
    expect(posts.filter(({ source }) => source === "bookmark")).toHaveLength(bookmarks.length);
    expect(posts.find(({ id }) => id === agents)?.source).toBe("bookmark");
    expect(posts[0]?.id).toBe("901");
  });

  it("is the bookmarks alone without scans", () => {
    expect(pagePosts(bookmarks, []).map(({ id }) => id)).toEqual(bookmarks.map(({ id }) => id));
  });

  it("finds each post by its source, and knows which ones have a card on the page", () => {
    expect(find({ source: "scan", id: "901" })?.onPage).toBe(true);
    expect(find({ source: "scan", id: "902" })?.onPage).toBe(false);
    expect(find({ source: "scan", id: agents ?? "" })?.onPage).toBe(false);
    expect(find({ source: "bookmark", id: "901" })).toBeUndefined();
    expect(find({ source: "scan", id: "404" })).toBeUndefined();
  });
});

describe("the digest filter", () => {
  const entries = pagePosts(bookmarks, scans).map(toSearchEntry);
  const shown = (source: (typeof DEFAULT_FILTER)["source"]) =>
    [...matchingIds({ entries, filter: { ...DEFAULT_FILTER, source }, done: new Set() })].toSorted();

  it("shows all posts, only bookmarks, or only scans", () => {
    expect(shown("all")).toHaveLength(bookmarks.length + 1);
    expect(shown("bookmarks")).toEqual(bookmarks.map(({ id }) => id).toSorted());
    expect(shown("scans")).toEqual(["901"]);
  });

  it("keeps the choice in ?source= and leaves the default out", () => {
    expect(filterSearch({ ...DEFAULT_FILTER, source: "scans" })).toBe("?source=scans");
    expect(filterSearch(DEFAULT_FILTER)).toBe("");
    expect(parseFilter("?source=bookmarks").source).toBe("bookmarks");
    expect(parseFilter("?source=everything").source).toBe("all");
  });

  it("files a scan in the feeds under its topic and Scan", () => {
    const feed = feedConfig({
      bookmarks: pagePosts(bookmarks, scans),
      topic: "science",
      origin: "https://e.x",
      base: "/",
    });
    expect(feed.items.map(({ categories }) => categories)).toEqual([["Science", "Scan"]]);
  });
});

describe("blocks that point at a scan", () => {
  it("accepts scan in place of bookmark, on a block and on an item", () => {
    const issue = parse([{ type: "feature", scan: "901" }, brief({ scan: "901" }, { bookmark: tokyo })]);
    expect(readableIssue(issue, find).sections.map(({ type }) => type)).toEqual(["feature", "brief-grid"]);
  });

  it("rejects a block or item with both or neither, naming where", () => {
    expect(errorOf([{ type: "feature", bookmark: agents, scan: "901" }])).toMatch(
      /"bookmark" or "scan"[\s\S]*at sections\[0\]/,
    );
    expect(errorOf([{ type: "feature" }])).toMatch(/"bookmark" or "scan"/);
    expect(errorOf([brief({ bookmark: agents }, { note: "x" })])).toMatch(/at sections\[0\]\.items\[1\]/);
  });

  it("warns about a missing scan id and leaves the item out", () => {
    expect(warningsOf([brief({ scan: "404" }, { bookmark: tokyo }, { bookmark: design })])).toEqual([
      {
        path: ["sections", 0, "items", 0, "scan"],
        message: '"404" is not a scan id in scans.json; the page leaves the item out',
      },
    ]);
    const kept = readableIssue(parse([brief({ scan: "404" }, { bookmark: tokyo }, { bookmark: design })]), find);
    expect(kept.sections[0]?.type === "brief-grid" && kept.sections[0].items).toHaveLength(2);
  });

  it("warns about a scan with no source link unless the item is tagged unverified", () => {
    expect(warningsOf([brief({ scan: "903" }, { bookmark: tokyo })])).toEqual([
      {
        path: ["sections", 0, "items", 0, "tags"],
        message:
          'scan "903" has no source link; add the primary source to its links in scans.json, or tag the item "unverified"',
      },
    ]);
    expect(warningsOf([brief({ scan: "903", tags: ["unverified"] }, { bookmark: tokyo })])).toEqual([]);
    expect(warningsOf([{ type: "closer", scan: "903" }]).map(({ path }) => path)).toEqual([["sections", 0, "tags"]]);
  });
});

describe("item fields", () => {
  it("accepts why, tags and source_label on items and on cover stories, features and closers", () => {
    const [feature, grid] = parse([
      { type: "feature", scan: "901", why: "It changes the story.", tags: ["new-to-you"], source_label: "Nature" },
      brief({ bookmark: agents, why: "Yours.", tags: ["from-your-saves", "new-voice"] }, { scan: "902" }),
    ]).sections;
    expect(feature).toMatchObject({ why: "It changes the story.", tags: ["new-to-you"], source_label: "Nature" });
    expect(grid?.type === "brief-grid" && grid.items.map(({ tags }) => tags)).toEqual([
      ["from-your-saves", "new-voice"],
      [],
    ]);
  });

  it("rejects a why over 200 characters, an unknown tag, and a long source label", () => {
    expect(errorOf([{ type: "feature", scan: "901", why: "x".repeat(201) }])).toContain("sections[0].why");
    expect(errorOf([{ type: "feature", scan: "901", tags: ["viral"] }])).toContain("sections[0].tags[0]");
    expect(errorOf([{ type: "feature", scan: "901", source_label: "x".repeat(41) }])).toContain(
      "sections[0].source_label",
    );
    expect(errorOf([{ type: "pull-quote", scan: "901", quote: "q", why: "No." }])).toContain('"why"');
  });
});

describe("corner and closer blocks", () => {
  it("takes a corner id with an optional label and deck, and nothing that would restyle it", () => {
    expect(parse([{ type: "corner", corner: "japan-desk", label: "日本から", deck: "From Japan" }]).sections).toEqual([
      {
        type: "corner",
        corner: "japan-desk",
        label: "日本から",
        deck: "From Japan",
        variant: "standard",
        emphasis: "normal",
        span: "full",
      },
    ]);
    expect(errorOf([{ type: "corner", corner: "sports" }])).toContain("sections[0].corner");
    expect(errorOf([{ ...corner("lead"), emphasis: "loud" }])).toContain("sections[0].emphasis");
    expect(errorOf([{ ...corner("lead"), span: "half" }])).toContain("sections[0].span");
  });

  it("takes a closer with a note, quiet text by default or with the post's photo", () => {
    const [closer] = parse([{ type: "closer", scan: "901", note: "To end on." }]).sections;
    expect(closer).toMatchObject({ type: "closer", variant: "text" });
    expect(errorOf([{ type: "closer", scan: "901", variant: "loud" }])).toContain("sections[0].variant");
  });

  it("lists a closer by its headline or tldr, and a corner not as a headline", () => {
    const findEntry = entryFinder(find);
    const [cornerBlock, closer] = parse([corner("kicker"), { type: "closer", scan: "901" }]).sections;
    expect(cornerBlock && sectionHeading(cornerBlock, findEntry)).toBeUndefined();
    expect(closer && sectionHeading(closer, findEntry)).toBe("Scan 901");
  });
});

describe("issueContents", () => {
  const findEntry = entryFinder(find);

  it("groups the headlines under each corner's label, after the ones before the first corner", () => {
    const issue = parse([
      { type: "cover-story", scan: "901", headline: "Cover" },
      { ...corner("lead"), label: "The lead" },
      { type: "feature", bookmark: agents, headline: "Lead story" },
      { type: "pull-quote", bookmark: agents, quote: "plan" },
      corner("open-window"),
      { ...brief({ scan: "901" }, { scan: "902" }), headline: "Worth knowing" },
      corner("kicker"),
    ]);
    expect(issueContents(issue.sections, findEntry, anchorOf)).toEqual([
      { corner: undefined, entries: [{ heading: "Cover", anchor: "s-1" }] },
      { corner: { heading: "The lead", anchor: "s-2" }, entries: [{ heading: "Lead story", anchor: "s-3" }] },
      { corner: { heading: "Open Window", anchor: "s-5" }, entries: [{ heading: "Worth knowing", anchor: "s-6" }] },
      { corner: { heading: "Kicker", anchor: "s-7" }, entries: [] },
    ]);
  });

  it("keeps one plain list for an issue without corners", () => {
    const issue = parse([
      { type: "feature", bookmark: agents },
      { ...brief({ bookmark: tokyo }, { bookmark: design }), headline: "In brief" },
    ]);
    expect(issueContents(issue.sections, findEntry, anchorOf)).toEqual([
      {
        corner: undefined,
        entries: [
          { heading: bookmarks.find(({ id }) => id === agents)?.tldr, anchor: "s-1" },
          { heading: "In brief", anchor: "s-2" },
        ],
      },
    ]);
  });
});

describe("the lineup warnings", () => {
  const openWindow = [corner("open-window"), { type: "feature", scan: "901" }];

  it("warns when an issue with corners has no Open Window item", () => {
    const sections = [
      corner("lead"),
      { type: "feature", bookmark: agents },
      corner("adjacent"),
      { type: "feature", bookmark: design },
      corner("open-window"),
    ];
    expect(warningsOf(sections)).toEqual([
      {
        path: ["sections"],
        message: 'the issue has no Open Window item; put one under a "corner" block with "corner": "open-window"',
      },
    ]);
  });

  it("warns when more than 60% of the counted items are interest items", () => {
    const interest = [
      corner("brief"),
      brief({ bookmark: agents }, { bookmark: tokyo }),
      corner("field-notes"),
      { type: "feature", bookmark: design },
    ];
    expect(warningsOf([...interest, ...openWindow])).toEqual([
      {
        path: ["sections"],
        message:
          "3 of 4 items (75%) are interest items, under The Brief, Lead, Field notes, Japan desk; keep them to at most 60%",
      },
    ]);
  });

  it("counts a post once, under its first corner, and leaves out Your saves and anything before the first corner", () => {
    const sections = [
      { type: "cover-story", bookmark: agents, headline: "Cover" },
      corner("lead"),
      { type: "feature", bookmark: tokyo },
      { type: "pull-quote", bookmark: tokyo, quote: "x" },
      corner("your-saves"),
      brief({ bookmark: agents }, { bookmark: design }),
      ...openWindow,
    ];
    expect(warningsOf(sections).filter(({ path }) => path.length === 1)).toEqual([]);
  });

  it("gives an issue without corners neither warning", () => {
    expect(warningsOf([brief({ bookmark: agents }, { bookmark: tokyo })])).toEqual([]);
  });
});

describe("Japanese and Chinese text", () => {
  it("names the language of text with kana, hangul or only Han characters", () => {
    expect(langOf("新しい研究")).toBe("ja");
    expect(langOf("科学家发现")).toBe("zh");
    expect(langOf("연구")).toBe("ko");
    expect(langOf("Plain English", undefined)).toBeUndefined();
  });

  it("gives the page Japanese and Chinese system fonts and strict line breaking, without downloading them", () => {
    const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
    expect(css).toMatch(/--cjk-sans:[^;]*"Hiragino Sans"[^;]*"PingFang SC"[^;]*"Microsoft YaHei"/);
    expect(css).toMatch(/--cjk-serif:[^;]*"Yu Mincho"[^;]*"Songti SC"/);
    expect(css).toMatch(/--font-sans: "Geist Variable", var\(--cjk-sans\)/);
    expect(css).toMatch(/:lang\(ja\),\s*:lang\(zh\) \{\s*line-break: strict;[^}]*overflow-wrap: anywhere;/);
    expect(css).not.toMatch(/@import "@fontsource[^"]*(jp|sc|cjk)/i);
  });
});
