import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBookmarks } from "../src/lib/bookmarks.ts";
import { OVERRIDABLE_COMPONENTS, siteConfigSchema } from "../src/lib/custom.ts";
import { REMOVE_REQUEST } from "../src/lib/deletions.ts";
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
});
