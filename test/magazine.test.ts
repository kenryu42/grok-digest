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
  {
    type: "painting",
    art: "temeraire.jpg",
    title: "The Fighting Temeraire",
    artist: "J. M. W. Turner",
    year: "1839",
    source_url: "https://www.nationalgallery.org.uk/paintings/joseph-mallord-william-turner-the-fighting-temeraire",
    license: "Public domain",
  },
  { type: "image-of-the-day", art: "day.jpg", caption: "The day in one picture." },
  { type: "interlude", art: "pause.jpg", variant: "square", caption: "A pause." },
  { type: "closer", bookmark: design, note: "To end on." },
);

const withArt = (art: string) => withSections({ ...issue.sections[0], art });
const artFeature = (bookmark: string | undefined, art: string) => ({ type: "feature", bookmark, art });
const imageOfTheDay = { type: "image-of-the-day", art: "day.jpg", caption: "The day." };

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
    ["art that climbs out of the issue's folder", withArt("../2026-10-18.jpg"), "sections[0].art"],
    ["art at an absolute path", withArt("/etc/art.jpg"), "sections[0].art"],
    ["art at a web address", withArt("https://example.com/art.jpg"), "sections[0].art"],
    ["art in another format", withArt("art.gif"), "must end in .jpg, .png, .webp"],
    ["art on a block that takes none", withSections({ type: "closer", bookmark: agents, art: "a.jpg" }), '"art"'],
    ["an image of the day without a caption", withSections({ type: "image-of-the-day", art: "a.jpg" }), "caption"],
    [
      "a fourth block with art",
      withSections(...["a.jpg", "b.jpg", "c.jpg", "d.jpg"].map((art) => artFeature(agents, art))),
      'at most 3 blocks with "art"\n  → at sections[3]',
    ],
    [
      "a second image of the day",
      withSections(imageOfTheDay, imageOfTheDay),
      'at most 1 "image-of-the-day" block\n  → at sections[1]',
    ],
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

  it("warns that art on a post with its own image does not show", () => {
    const photo = { url: "https://pbs.twimg.com/media/G3xAmPLeAAAbCdE.jpg" };
    const raw = structuredClone(samples);
    const designSample = raw.find((sample) => sample.id === design);
    if (designSample !== undefined) Object.assign(designSample, { media: [photo] });
    const withPhoto = parseBookmarks({ raw, source: "data/bookmarks.json" });
    const framed = withSections(artFeature(design, "a.jpg"), artFeature(tokyo, "b.jpg"));
    expect(issueWarnings({ issue: parse(framed), bookmarks: withPhoto, latestToday: "2026-10-20" })).toEqual([
      {
        path: ["sections", 0, "art"],
        message: `bookmark "${design}" has its own image, which the page shows instead of the art`,
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

const picture = (width: number, height: number) => ({ src: "/art.jpg", width, height, format: "jpg" as const });

describe("parseMagazine with art", () => {
  it("keeps art that is there and large enough, and shows the block without the rest", () => {
    const [parsed] = parseMagazine([
      {
        source: SOURCE,
        raw: withSections(
          artFeature(tokyo, "big.jpg"),
          artFeature(tokyo, "small.jpg"),
          artFeature(tokyo, "missing.jpg"),
          { ...imageOfTheDay, art: "big.jpg" },
        ),
        art: { "big.jpg": picture(1600, 1067), "small.jpg": picture(800, 600) },
      },
    ]);
    expect(parsed?.sections.map((block) => `${block.type}:${"art" in block ? block.art : ""}`)).toEqual([
      "feature:big.jpg",
      "feature:undefined",
      "feature:undefined",
      "image-of-the-day:big.jpg",
    ]);
    expect([...(parsed?.art.keys() ?? [])]).toEqual(["big.jpg"]);
  });

  it("leaves out an image of the day whose picture is too small", () => {
    const [parsed] = parseMagazine([
      {
        source: SOURCE,
        raw: withSections(issue.sections[0], imageOfTheDay),
        art: { "day.jpg": picture(1199, 800) },
      },
    ]);
    expect(parsed?.sections.map(({ type }) => type)).toEqual(["cover-story"]);
  });
});

const cover = issue.sections[0];
const closer = { type: "closer", bookmark: design };
const interlude = (extra: object = {}) => ({ type: "interlude", art: "pause.jpg", ...extra });
const between = (...middle: unknown[]) => withSections(cover, ...middle, closer);

describe("interlude", () => {
  it("defaults to the wide variant and takes no emphasis or span of its own", () => {
    expect(parse(between(interlude())).sections[1]).toEqual({
      type: "interlude",
      art: "pause.jpg",
      variant: "wide",
      emphasis: "normal",
      span: "full",
    });
  });

  it("accepts four interludes beside three blocks with art and an image of the day", () => {
    const arts = ["a.jpg", "b.jpg", "c.jpg"].map((art) => artFeature(tokyo, art));
    const raw = between(
      ...arts.flatMap((block, index) => [block, interlude({ variant: ["wide", "square", "quiet"][index] })]),
      imageOfTheDay,
      interlude({ caption: "x".repeat(60) }),
    );
    expect(parse(raw).sections.filter(({ type }) => type === "interlude")).toHaveLength(4);
  });

  it.each([
    [
      "a fifth interlude",
      between(...Array.from({ length: 5 }, () => [interlude(), closer]).flat()),
      'at most 4 "interlude" blocks\n  → at sections[9]',
    ],
    [
      "two interludes back to back",
      between(interlude(), interlude()),
      'an "interlude" cannot follow another; put a block between them\n  → at sections[2]',
    ],
    [
      "an interlude as the first block",
      withSections(interlude(), closer),
      'an "interlude" cannot open the issue; put it between two other blocks\n  → at sections[0]',
    ],
    [
      "an interlude as the last block",
      withSections(cover, interlude()),
      'an "interlude" cannot end the issue; put it between two other blocks\n  → at sections[1]',
    ],
    ["an interlude without art", between({ type: "interlude" }), "sections[1].art"],
    ["an interlude at a path out of its folder", between(interlude({ art: "../x.jpg" })), "issue's own folder"],
    ["an interlude at a web address", between(interlude({ art: "https://x.com/a.jpg" })), "issue's own folder"],
    ["an interlude in another format", between(interlude({ art: "pause.gif" })), "must end in .jpg, .png, .webp"],
    ["a caption over 60 characters", between(interlude({ caption: "x".repeat(61) })), "sections[1].caption"],
    ["a bookmark on an interlude", between(interlude({ bookmark: agents })), '"bookmark"'],
    ["a headline on an interlude", between(interlude({ headline: "Pause" })), '"headline"'],
    ["emphasis on an interlude", between(interlude({ emphasis: "normal" })), 'takes no "emphasis"'],
    ["a span on an interlude", between(interlude({ span: "full" })), 'takes no "span"'],
    ["an unknown interlude variant", between(interlude({ variant: "standard" })), "sections[1].variant"],
  ])("rejects %s", (_case, raw, field) => {
    const error = errorOf(raw);
    expect(error).toContain(`${SOURCE} is invalid:`);
    expect(error).toContain(field);
  });

  it("is left out of the contents and refers to no post", () => {
    expect(warningsOf(between(interlude()))).toEqual([]);
  });

  it("is left out when the blocks the page drops leave it first, last, or next to another", () => {
    const gone = { type: "feature", bookmark: "404" };
    expect(typesOf(withSections(gone, interlude(), closer))).toEqual(["closer"]);
    expect(typesOf(withSections(cover, interlude(), gone))).toEqual(["cover-story"]);
    expect(typesOf(between(interlude(), gone, interlude()))).toEqual(["cover-story", "interlude", "closer"]);
  });

  it.each([
    ["wide", picture(1200, 300), true],
    ["wide", picture(1199, 2000), false],
    ["quiet", picture(1200, 200), true],
    ["quiet", picture(1000, 200), false],
    ["square", picture(800, 800), true],
    ["square", picture(1200, 799), false],
  ])("keeps a %s interlude whose picture is %o: %s", (variant, size, kept) => {
    const [parsed] = parseMagazine([
      { source: SOURCE, raw: between(interlude({ variant })), art: { "pause.jpg": size } },
    ]);
    expect(parsed?.sections.map(({ type }) => type)).toEqual(
      kept ? ["cover-story", "interlude", "closer"] : ["cover-story", "closer"],
    );
    expect(parsed?.art.has("pause.jpg")).toBe(kept);
  });
});

const painting = (extra: object = {}) => ({
  type: "painting",
  art: "temeraire.jpg",
  art_alt: "An old warship towed up a river by a small steam tug at sunset",
  title: "The Fighting Temeraire",
  artist: "J. M. W. Turner",
  year: "1839",
  collection: "National Gallery, London",
  source_url: "https://commons.wikimedia.org/wiki/File:Turner,_J._M._W._-_The_Fighting_T%C3%A9m%C3%A9raire.jpg",
  license: "Public domain",
  ...extra,
});

describe("painting", () => {
  it("parses with a fixed style, and refers to no post", () => {
    const raw = between(painting({ year: "c. 1665", license: "CC0", caption: "x".repeat(100) }));
    expect(parse(raw).sections[1]).toMatchObject({ year: "c. 1665", variant: "standard", span: "full" });
    expect(warningsOf(raw)).toEqual([]);
  });

  it("does not count toward the three blocks with art, the image of the day, or the interludes", () => {
    const arts = ["a.jpg", "b.jpg", "c.jpg"].map((art) => artFeature(tokyo, art));
    const raw = between(...arts, painting(), imageOfTheDay, interlude(), closer);
    expect(parse(raw).sections.map(({ type }) => type)).toContain("painting");
  });

  it.each([
    ["a second painting", between(painting(), closer, painting()), 'at most 1 "painting" block\n  → at sections[3]'],
    ["a painting first", withSections(painting(), closer), 'a "painting" cannot open the issue'],
    ["a painting last", withSections(cover, painting()), 'a "painting" cannot end the issue;'],
    [
      "a painting after an interlude",
      between(interlude(), painting()),
      'cannot sit next to an "interlude"; put a block between them\n  → at sections[2]',
    ],
    [
      "a painting before an interlude",
      between(painting(), interlude()),
      'next to an "interlude"; put a block between them\n  → at sections[1]',
    ],
    ["a painting without a title", between(painting({ title: undefined })), "sections[1].title"],
    ["a painting without an artist", between(painting({ artist: undefined })), "sections[1].artist"],
    ["a painting without a year", between(painting({ year: undefined })), "sections[1].year"],
    ["a painting without a license", between(painting({ license: undefined })), "sections[1].license"],
    ["a license that is not public domain", between(painting({ license: "CC BY-SA 4.0" })), "sections[1].license"],
    ["a painting without a source", between(painting({ source_url: undefined })), "sections[1].source_url"],
    ["a source over http", between(painting({ source_url: "http://example.org/a" })), "must be an https address"],
    ["a hotlinked painting", between(painting({ art: "https://upload.wikimedia.org/a.jpg" })), "issue's own folder"],
    ["a collection over 60 characters", between(painting({ collection: "x".repeat(61) })), "sections[1].collection"],
    ["a caption over 100 characters", between(painting({ caption: "x".repeat(101) })), "sections[1].caption"],
    ["a headline on a painting", between(painting({ headline: "Hunger" })), '"headline"'],
    ["a bookmark on a painting", between(painting({ bookmark: agents })), '"bookmark"'],
    ["emphasis on a painting", between(painting({ emphasis: "loud" })), 'a "painting" takes no "emphasis"'],
  ])("rejects %s", (_case, raw, field) => {
    expect(errorOf(raw)).toContain(field);
  });

  it("warns when it has no art_alt", () => {
    expect(warningsOf(between(painting({ art_alt: undefined })))).toEqual([
      {
        path: ["sections", 1, "art_alt"],
        message: 'the painting has no "art_alt"; describe what it shows for screen readers',
      },
    ]);
  });

  it("is left out when the blocks the page drops leave it first, last, or next to an interlude", () => {
    const gone = { type: "feature", bookmark: "404" };
    expect(typesOf(withSections(gone, painting(), closer))).toEqual(["closer"]);
    expect(typesOf(withSections(cover, painting(), gone))).toEqual(["cover-story"]);
    expect(typesOf(between(painting(), gone, interlude()))).toEqual(["cover-story", "painting", "closer"]);
  });

  it.each([
    [picture(1200, 900), true],
    [picture(900, 1200), true],
    [picture(1199, 1199), false],
  ])("keeps a painting whose picture is %o: %s", (size, kept) => {
    const [parsed] = parseMagazine([{ source: SOURCE, raw: between(painting()), art: { "temeraire.jpg": size } }]);
    expect(parsed?.sections.map(({ type }) => type)).toEqual(
      kept ? ["cover-story", "painting", "closer"] : ["cover-story", "closer"],
    );
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
