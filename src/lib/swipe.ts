const DECIDE_DISTANCE = 10;
const COMMIT_SHARE_OF_WIDTH = 0.35;
const COMMIT_DISTANCE_MAX = 120;

export type SwipeAxis = "undecided" | "horizontal" | "vertical";

export function swipeAxis(dx: number, dy: number): SwipeAxis {
  if (Math.hypot(dx, dy) < DECIDE_DISTANCE) return "undecided";
  return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
}

export function swipeOffset(dx: number): number {
  return Math.min(dx, 0);
}

export function swipeCommits(dx: number, width: number): boolean {
  return dx <= -Math.min(width * COMMIT_SHARE_OF_WIDTH, COMMIT_DISTANCE_MAX);
}
