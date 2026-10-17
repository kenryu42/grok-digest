const DECIDE_DISTANCE = 10;
const FULL_SHARE_OF_WIDTH = 0.6;
const FULL_PAST_ACTIONS = 40;
const FLICK_SPEED = 0.5;
const FLICK_DISTANCE = 24;
const RETURN_SPEED = 0.3;
const RUBBER_BAND = 0.55;
const VELOCITY_WINDOW_MS = 100;
const FLY_OFF_MIN_SPEED = 1.2;
const FLY_OFF_MS = { min: 120, max: 280 };

export type SwipeAxis = "undecided" | "horizontal" | "vertical";

export type SwipeSample = { x: number; time: number };

export type SwipeTrays = { left: number; right: number };

export type SwipeRest = "closed" | "left" | "right" | "full";

export function swipeAxis(dx: number, dy: number): SwipeAxis {
  if (Math.hypot(dx, dy) < DECIDE_DISTANCE) return "undecided";
  return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
}

function resist(distance: number, width: number): number {
  return width * (1 - 1 / ((distance * RUBBER_BAND) / width + 1));
}

export function swipeOffset(dx: number, width: number, trays: SwipeTrays): number {
  if (dx <= trays.right) return dx;
  return trays.right + resist(dx - trays.right, width);
}

export function swipeVelocity(samples: readonly SwipeSample[]): number {
  const last = samples.at(-1);
  if (last === undefined) return 0;
  const first = samples.find(({ time }) => last.time - time <= VELOCITY_WINDOW_MS) ?? last;
  const elapsed = last.time - first.time;
  return elapsed === 0 ? 0 : (last.x - first.x) / elapsed;
}

export function fullSwipeDistance(width: number, trays: SwipeTrays): number {
  return Math.max(width * FULL_SHARE_OF_WIDTH, trays.left + FULL_PAST_ACTIONS);
}

function opens(offset: number, tray: number, velocity: number): boolean {
  if (tray === 0 || velocity <= -RETURN_SPEED) return false;
  const flicked = velocity >= FLICK_SPEED && offset >= FLICK_DISTANCE;
  return flicked || offset >= tray / 2;
}

export function swipeRest(offset: number, width: number, trays: SwipeTrays, velocity: number): SwipeRest {
  if (offset < 0 && velocity < RETURN_SPEED) {
    const flickedPastTray = velocity <= -FLICK_SPEED && offset <= -Math.max(trays.left, FLICK_DISTANCE);
    if (flickedPastTray || offset <= -fullSwipeDistance(width, trays)) return "full";
  }
  if (offset < 0) return opens(-offset, trays.left, -velocity) ? "left" : "closed";
  return opens(offset, trays.right, velocity) ? "right" : "closed";
}

export function restOffset(rest: SwipeRest, trays: SwipeTrays): number {
  if (rest === "left") return -trays.left;
  return rest === "right" ? trays.right : 0;
}

export function flyOffMs(remaining: number, velocity: number): number {
  const speed = Math.max(Math.abs(velocity), FLY_OFF_MIN_SPEED);
  return Math.min(Math.max(remaining / speed, FLY_OFF_MS.min), FLY_OFF_MS.max);
}
