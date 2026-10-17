import { describe, expect, it } from "vitest";
import { restOffset, swipeAxis, swipeOffset, swipeRest, swipeVelocity } from "../src/lib/swipe.ts";

const CARD_WIDTH = 343;
const STILL = 0;

const LIST_TRAYS = { left: 128, right: 0 };
const SWIPE_MODE_TRAYS = { left: 216, right: 152 };

describe("swiping a card", () => {
  it("waits to decide until the finger has moved a little", () => {
    expect(swipeAxis(4, 3)).toBe("undecided");
  });

  it("treats a mostly sideways drag as a swipe and a mostly vertical one as scrolling", () => {
    expect(swipeAxis(-30, 8)).toBe("horizontal");
    expect(swipeAxis(6, 40)).toBe("vertical");
  });

  it("opens the actions after a drag past half of them", () => {
    expect(swipeRest(-80, CARD_WIDTH, LIST_TRAYS, STILL)).toBe("left");
    expect(restOffset("left", LIST_TRAYS)).toBe(-128);
  });

  it("closes again after a short, slow drag", () => {
    expect(swipeRest(-40, CARD_WIDTH, LIST_TRAYS, -0.1)).toBe("closed");
    expect(restOffset("closed", LIST_TRAYS)).toBe(0);
  });

  it("opens the actions after a short, quick flick", () => {
    expect(swipeRest(-40, CARD_WIDTH, LIST_TRAYS, -0.9)).toBe("left");
  });

  it("ignores a flick too small to be meant", () => {
    expect(swipeRest(-12, CARD_WIDTH, LIST_TRAYS, -1.5)).toBe("closed");
    expect(swipeRest(-12, CARD_WIDTH, { left: 0, right: 0 }, -1.5)).toBe("closed");
  });

  it("marks the card done after a drag well past the actions", () => {
    expect(swipeRest(-220, CARD_WIDTH, LIST_TRAYS, STILL)).toBe("full");
    expect(swipeRest(-290, CARD_WIDTH, SWIPE_MODE_TRAYS, STILL)).toBe("full");
  });

  it("only opens the actions when the drag stops on them", () => {
    expect(swipeRest(-240, CARD_WIDTH, SWIPE_MODE_TRAYS, STILL)).toBe("left");
  });

  it("marks the card done after a quick flick past the actions", () => {
    expect(swipeRest(-140, CARD_WIDTH, LIST_TRAYS, -0.9)).toBe("full");
  });

  it("closes when the finger turns around before letting go", () => {
    expect(swipeRest(-250, CARD_WIDTH, LIST_TRAYS, 0.6)).toBe("closed");
  });

  it("opens the actions on the left after a drag to the right, when there are any", () => {
    expect(swipeRest(100, CARD_WIDTH, SWIPE_MODE_TRAYS, STILL)).toBe("right");
    expect(restOffset("right", SWIPE_MODE_TRAYS)).toBe(152);
    expect(swipeRest(200, CARD_WIDTH, LIST_TRAYS, STILL)).toBe("closed");
  });

  it("never marks the card done when dragged to the right", () => {
    expect(swipeRest(400, CARD_WIDTH, SWIPE_MODE_TRAYS, 2)).toBe("right");
  });

  it("follows the finger to the left and over the actions, and resists past them", () => {
    expect(swipeOffset(-50, CARD_WIDTH, LIST_TRAYS)).toBe(-50);
    expect(swipeOffset(100, CARD_WIDTH, SWIPE_MODE_TRAYS)).toBe(100);
    const resisted = swipeOffset(100, CARD_WIDTH, LIST_TRAYS);
    expect(resisted).toBeGreaterThan(0);
    expect(resisted).toBeLessThan(60);
    expect(swipeOffset(1000, CARD_WIDTH, LIST_TRAYS)).toBeLessThan(CARD_WIDTH);
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
