import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBookmarks } from "../src/lib/bookmarks.ts";
import { TOPIC_LABELS, TOPICS } from "../src/lib/topics.ts";

const manual = readFileSync(new URL("../BOT.md", import.meta.url), "utf8");

describe("BOT.md", () => {
  it("shows an entry the build accepts, with every field", () => {
    const example = /## The entry\s+```json\n([\s\S]*?)\n```/.exec(manual)?.[1];
    expect(example).toBeDefined();
    const [bookmark] = parseBookmarks({ raw: [JSON.parse(example ?? "")], source: "BOT.md" });
    expect(bookmark?.action).not.toBe("");
    expect(bookmark?.links).not.toHaveLength(0);
  });

  it("lists every topic the build accepts, with its label", () => {
    for (const topic of TOPICS) {
      expect(manual).toContain(`| \`${topic}\``);
      expect(manual).toContain(TOPIC_LABELS[topic]);
    }
  });
});
