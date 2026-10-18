const DEPTHS = ["headline", "gist", "points", "full"] as const;

export type Depth = (typeof DEPTHS)[number];

export function shows(depth: Depth, level: Depth): boolean {
  return DEPTHS.indexOf(depth) >= DEPTHS.indexOf(level);
}
