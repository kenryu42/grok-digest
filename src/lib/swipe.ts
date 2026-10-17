const DECIDE_DISTANCE = 10;
const FLICK_SPEED = 0.5;
const FLICK_DISTANCE = 24;
const RETURN_SPEED = 0.3;
const RUBBER_BAND = 0.55;
const VELOCITY_WINDOW_MS = 100;

export type SwipeAxis = "undecided" | "horizontal" | "vertical";

export type SwipeSample = { x: number; time: number };

export type SwipeTrays = { left: number; right: number };

export type SwipeRest = "closed" | "left" | "right";

export function swipeAxis(dx: number, dy: number): SwipeAxis {
  if (Math.hypot(dx, dy) < DECIDE_DISTANCE) return "undecided";
  return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
}

function resist(distance: number, width: number): number {
  return width * (1 - 1 / ((distance * RUBBER_BAND) / width + 1));
}

export function swipeOffset(dx: number, width: number, trays: SwipeTrays): number {
  if (dx < -trays.left) return -trays.left - resist(-dx - trays.left, width);
  if (dx > trays.right) return trays.right + resist(dx - trays.right, width);
  return dx;
}

export function swipeVelocity(samples: readonly SwipeSample[]): number {
  const last = samples.at(-1);
  if (last === undefined) return 0;
  const first = samples.find(({ time }) => last.time - time <= VELOCITY_WINDOW_MS) ?? last;
  const elapsed = last.time - first.time;
  return elapsed === 0 ? 0 : (last.x - first.x) / elapsed;
}

function opens(offset: number, tray: number, velocity: number): boolean {
  if (tray === 0 || velocity <= -RETURN_SPEED) return false;
  const flicked = velocity >= FLICK_SPEED && offset >= FLICK_DISTANCE;
  return flicked || offset >= tray / 2;
}

export function swipeRest(offset: number, trays: SwipeTrays, velocity: number): SwipeRest {
  if (offset < 0) return opens(-offset, trays.left, -velocity) ? "left" : "closed";
  return opens(offset, trays.right, velocity) ? "right" : "closed";
}

export function restOffset(rest: SwipeRest, trays: SwipeTrays): number {
  if (rest === "left") return -trays.left;
  return rest === "right" ? trays.right : 0;
}
