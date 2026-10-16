export const DEPTHS = ["headline", "gist", "points", "full"] as const;

export type Depth = (typeof DEPTHS)[number];

export const DEPTH_LABELS: Record<Depth, string> = {
  headline: "Headline",
  gist: "Gist",
  points: "Points",
  full: "Full",
};

export const NARROW_SCREEN_QUERY = "(width < 40rem)";

export function isDepth(value: unknown): value is Depth {
  return DEPTHS.some((depth) => depth === value);
}

export function startingDepth(stored: unknown, narrowScreen: boolean): Depth {
  if (isDepth(stored)) return stored;
  return narrowScreen ? "headline" : "full";
}

export function tappedDepth(shown: Depth, listDepth: Depth): Depth {
  if (shown !== "full") return "full";
  return listDepth === "full" ? "headline" : listDepth;
}

export function shows(depth: Depth, level: Depth): boolean {
  return DEPTHS.indexOf(depth) >= DEPTHS.indexOf(level);
}
