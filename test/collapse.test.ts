import { describe, expect, it } from "vitest";
import { startsCollapsed } from "../src/lib/collapse.ts";

describe("startsCollapsed", () => {
  it("collapses cards on a phone and expands them on a wider screen", () => {
    expect(startsCollapsed(null, true)).toBe(true);
    expect(startsCollapsed(null, false)).toBe(false);
  });

  it("keeps the reader's own choice on any screen", () => {
    expect(startsCollapsed(false, true)).toBe(false);
    expect(startsCollapsed(true, false)).toBe(true);
  });

  it("ignores a stored value that is not a choice", () => {
    expect(startsCollapsed("yes", true)).toBe(true);
  });
});
