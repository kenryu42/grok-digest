import { describe, expect, it } from "vitest";
import { swipeAxis, swipeCommits, swipeOffset, swipeVelocity } from "../src/lib/swipe.ts";

const CARD_WIDTH = 343;
const STILL = 0;

describe("swiping a card", () => {
  it("waits to decide until the finger has moved a little", () => {
    expect(swipeAxis(4, 3)).toBe("undecided");
  });

  it("treats a mostly sideways drag as a swipe and a mostly vertical one as scrolling", () => {
    expect(swipeAxis(-30, 8)).toBe("horizontal");
    expect(swipeAxis(6, 40)).toBe("vertical");
  });

  it("marks the card done after a long drag to the left", () => {
    expect(swipeCommits(-130, CARD_WIDTH, STILL)).toBe(true);
  });

  it("snaps back after a short, slow drag", () => {
    expect(swipeCommits(-60, CARD_WIDTH, -0.1)).toBe(false);
  });

  it("marks the card done after a short, quick flick", () => {
    expect(swipeCommits(-60, CARD_WIDTH, -0.9)).toBe(true);
  });

  it("ignores a flick too small to be meant", () => {
    expect(swipeCommits(-12, CARD_WIDTH, -1.5)).toBe(false);
  });

  it("snaps back when the finger turns around before letting go", () => {
    expect(swipeCommits(-150, CARD_WIDTH, 0.6)).toBe(false);
  });

  it("asks a narrow card for a shorter drag", () => {
    expect(swipeCommits(-80, 200, STILL)).toBe(true);
  });

  it("never marks the card done when dragged to the right", () => {
    expect(swipeCommits(200, CARD_WIDTH, STILL)).toBe(false);
  });

  it("follows the finger to the left and resists to the right", () => {
    expect(swipeOffset(-50, CARD_WIDTH)).toBe(-50);
    const resisted = swipeOffset(100, CARD_WIDTH);
    expect(resisted).toBeGreaterThan(0);
    expect(resisted).toBeLessThan(60);
    expect(swipeOffset(1000, CARD_WIDTH)).toBeLessThan(CARD_WIDTH);
  });
});

describe("swipeVelocity", () => {
  it("measures how fast the finger moved just before letting go", () => {
    const samples = [
      { x: 300, time: 0 },
      { x: 290, time: 200 },
      { x: 250, time: 250 },
      { x: 200, time: 300 },
    ];
    expect(swipeVelocity(samples)).toBe(-0.9);
  });

  it("reads a quick drag that stopped before letting go as slow", () => {
    const samples = [
      { x: 300, time: 0 },
      { x: 240, time: 50 },
      { x: 240, time: 250 },
    ];
    expect(Math.abs(swipeVelocity(samples))).toBeLessThan(0.5);
  });

  it("reads a finger that never moved as still", () => {
    expect(swipeVelocity([])).toBe(0);
    expect(swipeVelocity([{ x: 10, time: 5 }])).toBe(0);
  });
});
