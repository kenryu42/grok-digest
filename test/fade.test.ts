import { describe, expect, it } from "vitest";
import {
  EPISODE_FADE_SECONDS,
  fadeIn,
  fadeLevel,
  fadeOut,
  type FrameClock,
  volumeIsSettable,
} from "../src/lib/fade.ts";

function fakeClock() {
  let time = 0;
  let frames = new Map<number, () => void>();
  let nextId = 1;
  const clock: FrameClock = {
    now: () => time,
    nextFrame: (step) => {
      const id = nextId;
      nextId += 1;
      frames.set(id, step);
      return id;
    },
    cancelFrame: (id) => {
      frames.delete(id);
    },
  };
  const advance = (ms: number): void => {
    time += ms;
    const due = [...frames.values()];
    frames = new Map();
    for (const step of due) step();
  };
  return { clock, advance, pending: () => frames.size };
}

describe("fadeLevel", () => {
  it("is full outside the fade and silent at its end, on an equal-power curve", () => {
    expect(fadeLevel(10, EPISODE_FADE_SECONDS)).toBe(1);
    expect(fadeLevel(EPISODE_FADE_SECONDS, EPISODE_FADE_SECONDS)).toBe(1);
    expect(fadeLevel(0, EPISODE_FADE_SECONDS)).toBe(0);
    expect(fadeLevel(-1, EPISODE_FADE_SECONDS)).toBe(0);
    expect(fadeLevel(Number.NaN, EPISODE_FADE_SECONDS)).toBe(1);
    expect(fadeLevel(2.5, 5)).toBeCloseTo(Math.SQRT1_2);
    const fadingOut = fadeLevel(1, 5);
    const fadingIn = fadeLevel(5 - 1, 5);
    expect(fadingOut ** 2 + fadingIn ** 2).toBeCloseTo(1);
  });

  it("only falls as the end comes closer", () => {
    const levels = [5, 4, 3, 2, 1, 0].map((left) => fadeLevel(left, 5));
    expect(levels).toEqual(levels.toSorted((a, b) => b - a));
  });
});

describe("fadeIn", () => {
  it("starts silent and rises to full volume over the fade, then stops asking for frames", () => {
    const { clock, advance, pending } = fakeClock();
    const levels: number[] = [];
    fadeIn({ seconds: 4, apply: (level) => levels.push(level), clock });
    expect(levels).toEqual([0]);
    for (let elapsed = 0; elapsed < 5000; elapsed += 250) advance(250);
    expect(levels.at(-1)).toBe(1);
    expect(levels).toEqual(levels.toSorted((a, b) => a - b));
    expect(levels[8]).toBeCloseTo(Math.SQRT1_2);
    expect(pending()).toBe(0);
  });

  it("restores full volume at once when cancelled mid-fade, and fades no further", () => {
    const { clock, advance, pending } = fakeClock();
    const levels: number[] = [];
    const cancel = fadeIn({ seconds: 4, apply: (level) => levels.push(level), clock });
    advance(1000);
    expect(levels.at(-1)).toBeLessThan(1);
    cancel();
    expect(levels.at(-1)).toBe(1);
    expect(pending()).toBe(0);
    advance(1000);
    expect(levels.at(-1)).toBe(1);
  });
});

function episode(left: number) {
  const state = { left, levels: [] as number[], done: 0, accept: true };
  return {
    state,
    remaining: () => state.left,
    apply: (level: number) => {
      if (!state.accept) return false;
      state.levels.push(level);
      return true;
    },
    done: () => {
      state.done += 1;
    },
  };
}
describe("fadeOut", () => {
  it("follows the time left down to silence, then reports it is done", () => {
    const { clock, advance, pending } = fakeClock();
    const { state, remaining, apply, done } = episode(5);
    fadeOut({ seconds: 5, remaining, apply, done, clock });
    for (const left of [4, 3, 2, 1, 0]) {
      state.left = left;
      advance(1000);
    }
    expect(state.levels.at(-1)).toBe(0);
    expect(state.levels).toEqual(state.levels.toSorted((a, b) => b - a));
    expect(state.done).toBe(0);
    state.left = Number.NaN;
    advance(50);
    expect(state.done).toBe(1);
    expect(pending()).toBe(0);
  });

  it.each([
    ["the reader seeks back out of the fade", (state: { left: number }) => (state.left = 60)],
    [
      "the player declines a level, as on a pause or a changed volume",
      (state: { accept: boolean }) => (state.accept = false),
    ],
  ] as const)("stops and reports it is done when %s", (_case, interrupt) => {
    const { clock, advance, pending } = fakeClock();
    const { state, remaining, apply, done } = episode(3);
    fadeOut({ seconds: 5, remaining, apply, done, clock });
    advance(50);
    interrupt(state);
    advance(50);
    expect(state.done).toBe(1);
    expect(state.levels).toHaveLength(1);
    expect(pending()).toBe(0);
  });

  it("can be cancelled without reporting done, so the caller restores the volume itself", () => {
    const { clock, advance, pending } = fakeClock();
    const { state, remaining, apply, done } = episode(3);
    const stop = fadeOut({ seconds: 5, remaining, apply, done, clock });
    advance(50);
    stop();
    advance(50);
    expect(state.levels).toHaveLength(1);
    expect(state.done).toBe(0);
    expect(pending()).toBe(0);
  });
});

describe("volumeIsSettable", () => {
  it("tells a player that takes a volume from one that ignores it, as Safari on iPhone does, leaving it as it was", () => {
    const desktop = { volume: 1 };
    expect(volumeIsSettable(desktop)).toBe(true);
    expect(desktop.volume).toBe(1);
    const iphone = {
      get volume() {
        return 1;
      },
      set volume(_ignored: number) {},
    };
    expect(volumeIsSettable(iphone)).toBe(false);
  });
});
