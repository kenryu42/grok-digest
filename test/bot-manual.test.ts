import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBookmarks, parseScans } from "../src/lib/bookmarks.ts";
import { OVERRIDABLE_COMPONENTS, siteConfigSchema } from "../src/lib/custom.ts";
import {
  CORNER_LABELS,
  MAGAZINE_CORNERS,
  MAGAZINE_EMPHASES,
  MAGAZINE_FONTS,
  MAGAZINE_PALETTES,
  MAGAZINE_SPANS,
  MAGAZINE_TAGS,
  magazineBlockSchema,
  magazineIssueSchema,
} from "../src/lib/magazine.ts";
import { issueWarnings } from "../src/lib/magazine-check.ts";
import { REMOVE_REQUEST } from "../src/lib/remove-request.ts";
import { TOPIC_LABELS, TOPICS } from "../src/lib/topics.ts";

const manual = readFileSync(new URL("../BOT.md", import.meta.url), "utf8");

describe("BOT.md", () => {
  it("shows an entry the build accepts, with every field", () => {
    const example = /## The entry\s+```json\n([\s\S]*?)\n```/.exec(manual)?.[1];
    expect(example).toBeDefined();
    const [bookmark] = parseBookmarks({ raw: [JSON.parse(example ?? "")], source: "BOT.md" });
    expect(bookmark?.action).not.toBe("");
    expect(bookmark?.links[0]?.image).toBeDefined();
    expect(bookmark?.media).not.toHaveLength(0);
  });

  it("lists every topic the build accepts, with its label", () => {
    for (const topic of TOPICS) {
      expect(manual).toContain(`| \`${topic}\``);
      expect(manual).toContain(TOPIC_LABELS[topic]);
    }
  });

  it("lists every page setting and shows an example the build accepts", () => {
    const settings = Object.entries(siteConfigSchema.parse({})).flatMap(([key, value]) =>
      typeof value === "object" ? Object.keys(value).map((inner) => `${key}.${inner}`) : [key],
    );
    for (const setting of settings) expect(manual).toContain(`| \`${setting}\``);
    const example = /### Settings[\s\S]*?```json\n([\s\S]*?)\n```/.exec(manual)?.[1];
    expect(siteConfigSchema.safeParse(JSON.parse(example ?? "")).success).toBe(true);
  });

  it("shows the removal request the page copies for the bot", () => {
    const example = /```text\n(Remove these bookmarks[\s\S]*?)\n```/.exec(manual)?.[1] ?? "";
    expect(example.split("\n")[0]).toBe(REMOVE_REQUEST);
  });

  it("lists every component a site can eject", () => {
    for (const name of OVERRIDABLE_COMPONENTS) expect(manual).toContain(`| \`${name}\``);
  });

  it("shows a magazine issue the schema accepts, which follows its own advice", () => {
    const example = /### The issue\s+```json\n([\s\S]*?)\n```/.exec(manual)?.[1];
    const issue = magazineIssueSchema.parse(JSON.parse(example ?? ""));
    const warnings = issueWarnings({ issue, bookmarks: [], latestToday: issue.date });
    expect(warnings.filter(({ message }) => !message.includes("is not a bookmark id"))).toEqual([]);
    for (const span of MAGAZINE_SPANS) expect(manual).toContain(`\`${span}\``);
  });

  it("lists every magazine block with its variants, and every palette, font pairing and emphasis", () => {
    for (const option of magazineBlockSchema.options) {
      const type = option.shape.type.value;
      const row = manual.split("\n").find((line) => line.startsWith(`| \`${type}\``)) ?? "";
      expect(row).not.toBe("");
      expect(row).toContain(
        option.shape.variant
          .unwrap()
          .options.map((variant) => `\`${variant}\``)
          .join(", "),
      );
    }
    for (const name of [...MAGAZINE_PALETTES, ...MAGAZINE_FONTS]) expect(manual).toContain(`| \`${name}\``);
    for (const emphasis of MAGAZINE_EMPHASES) expect(manual).toContain(`\`${emphasis}\``);
  });

  it("shows a scan entry the build accepts, as a strong pick with a source link", () => {
    const example = /### The scan entry[\s\S]*?```json\n([\s\S]*?)\n```/.exec(manual)?.[1];
    const [scan] = parseScans({ raw: [JSON.parse(example ?? "")], source: "BOT.md" });
    expect(scan?.pick).toBe(true);
    expect(scan?.links).not.toHaveLength(0);
  });

  it("shows an issue laid out in corners that passes its own balance checks", () => {
    const example = /An issue laid out this way:\s+```json\n([\s\S]*?)\n```/.exec(manual)?.[1];
    const issue = magazineIssueSchema.parse(JSON.parse(example ?? ""));
    expect(issue.sections.some(({ type }) => type === "corner")).toBe(true);
    const warnings = issueWarnings({ issue, bookmarks: [], latestToday: issue.date });
    expect(warnings.filter(({ message }) => !/is not a (bookmark|scan) id/.test(message))).toEqual([]);
  });

  it("lists every corner with its label, and every tag", () => {
    for (const corner of MAGAZINE_CORNERS) expect(manual).toContain(`| \`${corner}\``);
    for (const corner of MAGAZINE_CORNERS) expect(manual).toContain(CORNER_LABELS[corner]);
    for (const tag of MAGAZINE_TAGS) expect(manual).toContain(`\`${tag}\``);
  });
});
