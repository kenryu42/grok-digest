import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOPICS } from "../src/lib/topics.ts";

const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

function hueOf(topic: string): string | undefined {
  return new RegExp(`\\[data-topic="${topic}"\\]\\s*\\{[^}]*--topic-hue:\\s*([\\d.]+)`).exec(css)?.[1];
}

describe("topic colors", () => {
  it("gives every topic its own hue", () => {
    const hues = TOPICS.map(hueOf);
    expect(hues).not.toContain(undefined);
    expect(new Set(hues).size).toBe(TOPICS.length);
  });
});
