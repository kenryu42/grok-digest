import { describe, expect, it } from "vitest";
import { pendingDeletes, REMOVE_REQUEST, removeRequest } from "../src/lib/deletions.ts";

describe("deleting bookmarks", () => {
  it("asks the Grok bot to remove each post, one link per line", () => {
    expect(removeRequest(["https://x.com/a/status/1", "https://x.com/b/status/2"])).toBe(
      `${REMOVE_REQUEST}\nhttps://x.com/a/status/1\nhttps://x.com/b/status/2`,
    );
  });

  it("forgets a deleted bookmark once the bot has removed it from the data", () => {
    expect(pendingDeletes(["1", "2", "3"], new Set(["1", "3", "4"]))).toEqual(["1", "3"]);
  });

  it("starts empty when nothing usable was stored", () => {
    expect(pendingDeletes(null, new Set(["1"]))).toEqual([]);
    expect(pendingDeletes({ id: "1" }, new Set(["1"]))).toEqual([]);
    expect(pendingDeletes([1, "1"], new Set(["1"]))).toEqual(["1"]);
  });
});
