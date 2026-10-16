const DECIDE_DISTANCE = 10;
const COMMIT_SHARE_OF_WIDTH = 0.35;
const COMMIT_DISTANCE_MAX = 120;
const FLICK_SPEED = 0.5;
const FLICK_DISTANCE = 24;
const RETURN_SPEED = 0.3;
const RUBBER_BAND = 0.55;
const VELOCITY_WINDOW_MS = 100;
const FLY_OFF_MIN_SPEED = 1.2;
const FLY_OFF_MS = { min: 120, max: 280 };

export type SwipeAxis = "undecided" | "horizontal" | "vertical";

export type SwipeSample = { x: number; time: number };

export function swipeAxis(dx: number, dy: number): SwipeAxis {
  if (Math.hypot(dx, dy) < DECIDE_DISTANCE) return "undecided";
  return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
}

export function swipeOffset(dx: number, width: number): number {
  if (dx <= 0) return dx;
  return width * (1 - 1 / ((dx * RUBBER_BAND) / width + 1));
}

export function swipeVelocity(samples: readonly SwipeSample[]): number {
  const last = samples.at(-1);
  if (last === undefined) return 0;
  const first = samples.find(({ time }) => last.time - time <= VELOCITY_WINDOW_MS) ?? last;
  const elapsed = last.time - first.time;
  return elapsed === 0 ? 0 : (last.x - first.x) / elapsed;
}

export function swipeCommits(dx: number, width: number, velocity: number): boolean {
  if (velocity >= RETURN_SPEED) return false;
  const flicked = velocity <= -FLICK_SPEED && dx <= -FLICK_DISTANCE;
  return flicked || dx <= -Math.min(width * COMMIT_SHARE_OF_WIDTH, COMMIT_DISTANCE_MAX);
}

export function flyOffMs(remaining: number, velocity: number): number {
  const speed = Math.max(Math.abs(velocity), FLY_OFF_MIN_SPEED);
  return Math.min(Math.max(remaining / speed, FLY_OFF_MS.min), FLY_OFF_MS.max);
}
