import { describe, expect, it } from "vitest";
import { focusIndex, graphemes, readingPlan, stepMs } from "../src/lib/reading.ts";

const joined = (tokens: { text: string }[]) => tokens.map(({ text }) => text).join("");

describe("readingPlan", () => {
  it("keeps every character of each block, in order", () => {
    const texts = ["Agents copy code, so stale comments spread.", "サンプル: 東京でミートアップを開きます。"];
    const { blocks } = readingPlan(texts);
    expect(blocks.map(joined)).toEqual(texts);
  });

  it("flashes one word at a time, keeping its punctuation with it", () => {
    const { words } = readingPlan(['Agents copy code, so "stale" comments spread.']);
    expect(words.map(({ text }) => text)).toEqual(["Agents", "copy", "code,", "so", '"stale"', "comments", "spread."]);
  });

  it("knows which block each word comes from", () => {
    const { words } = readingPlan(["Plan first", "Then edit"]);
    expect(words.map(({ block }) => block)).toEqual([0, 0, 1, 1]);
  });

  it("keeps the focus letter on the word itself, not on leading punctuation", () => {
    const { words } = readingPlan(["(fictional)"]);
    const [word] = words;
    expect(word?.text).toBe("(fictional)");
    expect(graphemes(word?.text ?? "")[word?.focus ?? 0]).toBe("c");
  });

  it("pauses longer after a sentence than after a comma", () => {
    const { weights } = readingPlan(["One, two. Three four"]);
    const [afterComma = 0, afterSentence = 0, plain = 0] = weights;
    expect(afterComma).toBeGreaterThan(plain);
    expect(afterSentence).toBeGreaterThan(afterComma);
  });

  it("pauses at the end of each block", () => {
    const { weights } = readingPlan(["Plan first", "Then edit"]);
    expect(weights[1]).toBeGreaterThan(weights[0] ?? 0);
  });

  it("gives long words a little more time", () => {
    const { weights } = readingPlan(["a understanding b"]);
    expect(weights[1]).toBeGreaterThan(weights[0] ?? 0);
  });

  it("times Japanese by its characters", () => {
    const { weights } = readingPlan(["東京で開きます"]);
    expect(weights.length).toBeGreaterThan(1);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const blockPause = 1.5;
    expect(total - blockPause).toBeCloseTo(7 / 2, 5);
  });
});

describe("focusIndex", () => {
  it("puts the focus letter about a third into a word", () => {
    expect(focusIndex("a")).toBe(0);
    expect(focusIndex("code")).toBe(1);
    expect(focusIndex("comments")).toBe(2);
    expect(focusIndex("understanding")).toBe(3);
  });

  it("centers Japanese words", () => {
    expect(focusIndex("東京")).toBe(0);
    expect(focusIndex("ミートアップ")).toBe(2);
  });
});

describe("stepMs", () => {
  it("shows a plain word for one beat at the chosen speed once up to speed", () => {
    const plan = readingPlan(["one two three four five six"]);
    expect(stepMs(plan, 4, 600)).toBe(100);
  });

  it("starts slower and ramps up over the first words", () => {
    const plan = readingPlan(["one two three four five six"]);
    expect(stepMs(plan, 0, 600)).toBeGreaterThan(stepMs(plan, 2, 600));
    expect(stepMs(plan, 2, 600)).toBeGreaterThan(stepMs(plan, 4, 600));
  });
});
