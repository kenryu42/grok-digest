import type { ImageMetadata } from "astro";
import { describe, expect, it } from "vitest";
import { parseBookmarks } from "../src/lib/bookmarks.ts";
import { parseMagazineIssue } from "../src/lib/magazine.ts";
import { entryFinder } from "../src/lib/magazine-check.ts";
import { issueDigest, type DigestGroup } from "../src/lib/magazine-digest.ts";
import { postFinder } from "../src/lib/posts.ts";
import samples from "../template/data/bookmarks.json";

const bookmarks = parseBookmarks({ raw: samples, source: "data/bookmarks.json" });
const find = entryFinder(postFinder(bookmarks, []));
const [agents = "", tokyo = "", design = ""] = samples.map(({ id }) => id);
const QUOTE = "We let the agent write a plan";
const PICTURE: ImageMetadata = { src: "/end.jpg", width: 1500, height: 1000, format: "jpg" };

const digestOf = (sections: unknown[], art: ReadonlyMap<string, ImageMetadata> = new Map()) => {
  const issue = parseMagazineIssue({
    raw: { date: "2026-10-19", title: "Digest", theme: { palette: "ocean", fonts: "serif" }, sections },
    source: "data/magazine/2026-10-19.json",
  });
  return issueDigest({ sections: issue.sections, art }, find);
};

const outline = (groups: DigestGroup[]) =>
  groups.map(({ corner, entries }) => ({
    corner: corner?.label,
    entries: entries.map((entry) => (entry.kind === "post" ? entry.post.id : `picture: ${entry.caption}`)),
  }));

const lines = (groups: DigestGroup[]) =>
  groups.flatMap(({ entries }) =>
    entries.flatMap((entry) => (entry.kind === "post" ? [{ title: entry.title, line: entry.line }] : [])),
  );

describe("issueDigest", () => {
  it("lists each post once, in issue order, under the corner it sits in, without decorative blocks", () => {
    const groups = digestOf([
      { type: "cover-story", bookmark: agents, headline: "Plan first" },
      { type: "topic-divider", topic: "design" },
      { type: "corner", corner: "brief" },
      { type: "brief-grid", items: [{ bookmark: tokyo }, { bookmark: design }] },
      { type: "corner", corner: "lead" },
      { type: "corner", corner: "open-window", label: "Elsewhere" },
      { type: "feature", bookmark: tokyo },
      { type: "pull-quote", bookmark: design, quote: QUOTE },
    ]);
    expect(outline(groups)).toEqual([
      { corner: undefined, entries: [agents] },
      { corner: "The Brief", entries: [tokyo, design] },
    ]);
  });

  it("shows the why line first, then the block's own note or deck, then the post's tldr", () => {
    const groups = digestOf([
      { type: "cover-story", bookmark: agents, headline: "Plan first", deck: "A deck", why: "It saves a rewrite" },
      {
        type: "numbered-list",
        items: [
          { bookmark: tokyo, headline: "Tokyo", note: "A note" },
          { bookmark: design, headline: "Short card" },
        ],
      },
    ]);
    expect(lines(groups)).toEqual([
      { title: "Plan first", line: { kind: "why", text: "It saves a rewrite" } },
      { title: "Tokyo", line: { kind: "note", text: "A note" } },
      { title: "Short card", line: { kind: "note", text: "A short sample card with no key points" } },
    ]);
  });

  it("falls back to the summary's first sentence when the title is already the tldr", () => {
    const [entry] = lines(digestOf([{ type: "feature", bookmark: design }]));
    expect(entry).toEqual({
      title: "A short sample card with no key points",
      line: {
        kind: "note",
        text: "Sample entry with no key points and no post text, to show how a short card renders.",
      },
    });
  });

  it("shows a pull quote's quote and a sidebar's action", () => {
    const groups = digestOf([
      { type: "pull-quote", bookmark: agents, quote: QUOTE },
      { type: "sidebar-box", bookmark: agents },
    ]);
    expect(lines(groups).map(({ line }) => line)).toEqual([{ kind: "quote", text: QUOTE }]);
    const [sidebar] = lines(digestOf([{ type: "sidebar-box", bookmark: agents }]));
    expect(sidebar?.line?.kind).toBe("try");
    expect(sidebar?.line?.text).toMatch(/^Ask your coding agent for a plan/);
  });

  it("keeps an item's tags and source label", () => {
    const [group] = digestOf([
      {
        type: "closer",
        bookmark: tokyo,
        tags: ["unverified", "new-to-you"],
        source_label: "Tokyo Dev Notes",
      },
    ]);
    expect(group?.entries[0]).toMatchObject({ tags: ["unverified", "new-to-you"], sourceLabel: "Tokyo Dev Notes" });
  });

  it("shows the image of the day where it sits when its picture is there, and leaves it out when not", () => {
    const sections = [
      { type: "feature", bookmark: agents },
      { type: "image-of-the-day", art: "end.jpg", caption: "Hills at dusk." },
    ];
    expect(outline(digestOf(sections, new Map([["end.jpg", PICTURE]])))).toEqual([
      { corner: undefined, entries: [agents, "picture: Hills at dusk."] },
    ]);
    expect(outline(digestOf(sections))).toEqual([{ corner: undefined, entries: [agents] }]);
  });

  it("leaves a painting out, even with its picture there", () => {
    const sections = [
      { type: "feature", bookmark: agents },
      {
        type: "painting",
        art: "temeraire.jpg",
        title: "The Fighting Temeraire",
        artist: "J. M. W. Turner",
        year: "1839",
        source_url: "https://www.nationalgallery.org.uk/paintings/the-fighting-temeraire",
        license: "Public domain",
        caption: "The old ship still shines.",
      },
      { type: "closer", bookmark: tokyo },
    ];
    expect(outline(digestOf(sections, new Map([["temeraire.jpg", PICTURE]])))).toEqual([
      { corner: undefined, entries: [agents, tokyo] },
    ]);
  });

  it("leaves interludes out, even with their pictures there", () => {
    const sections = [
      { type: "feature", bookmark: agents },
      { type: "interlude", art: "end.jpg", caption: "A pause." },
      { type: "corner", corner: "kicker" },
      { type: "closer", bookmark: tokyo },
    ];
    expect(outline(digestOf(sections, new Map([["end.jpg", PICTURE]])))).toEqual([
      { corner: undefined, entries: [agents] },
      { corner: "Kicker", entries: [tokyo] },
    ]);
  });
});
