export const DEPTHS = ["headline", "gist", "points", "full"] as const;

export type Depth = (typeof DEPTHS)[number];

export const DEPTH_LABELS: Record<Depth, string> = {
  headline: "Minimal",
  gist: "Light",
  points: "Deep",
  full: "Full",
};

export const NARROW_SCREEN_QUERY = "(width < 40rem)";

export function isDepth(value: unknown): value is Depth {
  return DEPTHS.some((depth) => depth === value);
}

type StartingDepths = { phone: Depth; desktop: Depth };

const STARTING_DEPTHS: StartingDepths = { phone: "headline", desktop: "full" };

export function startingDepth(stored: unknown, narrowScreen: boolean, starting = STARTING_DEPTHS): Depth {
  if (isDepth(stored)) return stored;
  return narrowScreen ? starting.phone : starting.desktop;
}

export function tappedDepth(shown: Depth, listDepth: Depth): Depth {
  if (shown !== "full") return "full";
  return listDepth === "full" ? "headline" : listDepth;
}

export function shows(depth: Depth, level: Depth): boolean {
  return DEPTHS.indexOf(depth) >= DEPTHS.indexOf(level);
}
