import { describe, expect, it } from "vitest";
import { shows } from "../src/lib/depth.ts";

describe("shows", () => {
  it("includes every shorter level", () => {
    expect(shows("points", "gist")).toBe(true);
    expect(shows("points", "points")).toBe(true);
    expect(shows("points", "full")).toBe(false);
  });
});
