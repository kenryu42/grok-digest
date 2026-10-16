import { describe, expect, it } from "vitest";
import { readingPlan, speechLang, speechRate, spokenText, wordMs } from "../src/lib/reading.ts";

const joined = (tokens: { text: string }[]) => tokens.map(({ text }) => text).join("");

describe("readingPlan", () => {
  it("keeps every character of each block, in order", () => {
    const texts = ["Agents copy code, so stale comments spread.", "サンプル: 東京でミートアップを開きます。"];
    const { blocks } = readingPlan(texts);
    expect(blocks.map(joined)).toEqual(texts);
  });

  it("gives one step to each word", () => {
    const { weights, blocks } = readingPlan(["Delete most comments"]);
    expect(weights).toHaveLength(3);
    expect(blocks[0]?.filter(({ word }) => word).map(({ step }) => step)).toEqual([0, 1, 2]);
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

  it("times Japanese by its characters", () => {
    const { weights } = readingPlan(["東京で開きます"]);
    expect(weights.length).toBeGreaterThan(1);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const blockPause = 1.5;
    expect(total - blockPause).toBeCloseTo(7 / 2, 5);
  });
});

describe("wordMs", () => {
  it("reads a plain word in one beat at the chosen speed", () => {
    expect(wordMs(1, 300)).toBe(200);
    expect(wordMs(2, 300)).toBe(400);
  });
});

describe("spokenText", () => {
  it("speaks from the chosen word and knows where each word starts", () => {
    const plan = readingPlan(["Plan first.", "Then edit"]);
    const { text, starts } = spokenText(plan, 1);
    expect(text).toBe("first.\nThen edit");
    expect(starts.map((start) => text.slice(start).split(/\W/)[0])).toEqual(["first", "Then", "edit"]);
  });
});

describe("speech", () => {
  it("speaks Japanese posts in Japanese and the rest in English", () => {
    expect(speechLang("東京でミートアップ")).toBe("ja-JP");
    expect(speechLang("Plan before editing")).toBe("en-US");
  });

  it("speeds speech up and down with the reading speed, within what voices allow", () => {
    expect(speechRate(380)).toBeGreaterThan(speechRate(190));
    expect(speechRate(2000)).toBe(2);
    expect(speechRate(20)).toBe(0.5);
  });
});
