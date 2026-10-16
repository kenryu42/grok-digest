import { describe, expect, it } from "vitest";
import { swipeAxis, swipeCommits, swipeOffset } from "../src/lib/swipe.ts";

const CARD_WIDTH = 343;

describe("swiping a card", () => {
  it("waits to decide until the finger has moved a little", () => {
    expect(swipeAxis(4, 3)).toBe("undecided");
  });

  it("treats a mostly sideways drag as a swipe and a mostly vertical one as scrolling", () => {
    expect(swipeAxis(-30, 8)).toBe("horizontal");
    expect(swipeAxis(6, 40)).toBe("vertical");
  });

  it("marks the card done after a long drag to the left", () => {
    expect(swipeCommits(-130, CARD_WIDTH)).toBe(true);
  });

  it("snaps back after a short drag", () => {
    expect(swipeCommits(-60, CARD_WIDTH)).toBe(false);
  });

  it("asks a narrow card for a shorter drag", () => {
    expect(swipeCommits(-80, 200)).toBe(true);
  });

  it("never marks the card done when dragged to the right, and keeps it in place", () => {
    expect(swipeCommits(200, CARD_WIDTH)).toBe(false);
    expect(swipeOffset(200)).toBe(0);
    expect(swipeOffset(-50)).toBe(-50);
  });
});
