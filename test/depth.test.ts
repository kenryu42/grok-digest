import { describe, expect, it } from "vitest";
import { shows, startingDepth, tappedDepth } from "../src/lib/depth.ts";

describe("startingDepth", () => {
  it("shows headlines on a phone and whole cards on a wider screen", () => {
    expect(startingDepth(null, true)).toBe("headline");
    expect(startingDepth(null, false)).toBe("full");
  });

  it("keeps the reader's own choice on any screen", () => {
    expect(startingDepth("points", true)).toBe("points");
    expect(startingDepth("gist", false)).toBe("gist");
  });

  it("starts at the levels the site chose until the reader picks one", () => {
    const site = { phone: "points", desktop: "gist" } as const;
    expect(startingDepth(null, true, site)).toBe("points");
    expect(startingDepth(null, false, site)).toBe("gist");
    expect(startingDepth("full", true, site)).toBe("full");
  });

  it("ignores a stored value that is not a level", () => {
    expect(startingDepth(true, true)).toBe("headline");
    expect(startingDepth("everything", false)).toBe("full");
  });
});

describe("tapping a card", () => {
  it("opens a card in full from any shorter level", () => {
    expect(tappedDepth("headline", "headline")).toBe("full");
    expect(tappedDepth("points", "points")).toBe("full");
  });

  it("returns an open card to the list's level", () => {
    expect(tappedDepth("full", "gist")).toBe("gist");
  });

  it("closes a card to its headline when the whole list is open", () => {
    expect(tappedDepth("full", "full")).toBe("headline");
  });
});

describe("shows", () => {
  it("includes every shorter level", () => {
    expect(shows("points", "gist")).toBe(true);
    expect(shows("points", "points")).toBe(true);
    expect(shows("points", "full")).toBe(false);
  });
});
