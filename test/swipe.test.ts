import { describe, expect, it } from "vitest";
import { restOffset, swipeAxis, swipeOffset, swipeRest, swipeVelocity } from "../src/lib/swipe.ts";

const CARD_WIDTH = 343;
const STILL = 0;

const LIST_TRAYS = { left: 160, right: 0 };
const SWIPE_MODE_TRAYS = { left: 160, right: 152 };

describe("swiping a card", () => {
  it("waits to decide until the finger has moved a little", () => {
    expect(swipeAxis(4, 3)).toBe("undecided");
  });

  it("treats a mostly sideways drag as a swipe and a mostly vertical one as scrolling", () => {
    expect(swipeAxis(-30, 8)).toBe("horizontal");
    expect(swipeAxis(6, 40)).toBe("vertical");
  });

  it("opens the buttons after a drag past half of them", () => {
    expect(swipeRest(-90, LIST_TRAYS, STILL)).toBe("left");
    expect(restOffset("left", LIST_TRAYS)).toBe(-160);
  });

  it("closes again after a short, slow drag", () => {
    expect(swipeRest(-40, LIST_TRAYS, -0.1)).toBe("closed");
    expect(restOffset("closed", LIST_TRAYS)).toBe(0);
  });

  it("opens the buttons after a short, quick flick", () => {
    expect(swipeRest(-40, LIST_TRAYS, -0.9)).toBe("left");
  });

  it("ignores a flick too small to be meant", () => {
    expect(swipeRest(-12, LIST_TRAYS, -1.5)).toBe("closed");
  });

  it("stops at the buttons however far or fast the card is swiped", () => {
    expect(swipeRest(-340, LIST_TRAYS, -3)).toBe("left");
    expect(swipeOffset(-150, CARD_WIDTH, LIST_TRAYS)).toBe(-150);
    const past = swipeOffset(-340, CARD_WIDTH, LIST_TRAYS);
    expect(past).toBeLessThan(-160);
    expect(past).toBeGreaterThan(-260);
  });

  it("closes when the finger turns around before letting go", () => {
    expect(swipeRest(-150, LIST_TRAYS, 0.6)).toBe("closed");
  });

  it("opens the buttons on the left after a drag to the right, when there are any", () => {
    expect(swipeRest(100, SWIPE_MODE_TRAYS, STILL)).toBe("right");
    expect(restOffset("right", SWIPE_MODE_TRAYS)).toBe(152);
    expect(swipeRest(200, LIST_TRAYS, STILL)).toBe("closed");
  });

  it("follows the finger over the buttons and resists past them", () => {
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
