import { describe, expect, it } from "vitest";
import { REMOVE_REQUEST, removeRequest } from "../src/lib/remove-request.ts";

describe("removeRequest", () => {
  it("asks the Grok bot to remove each post, one link per line", () => {
    expect(removeRequest(["https://x.com/a/status/1", "https://x.com/b/status/2"])).toBe(
      `${REMOVE_REQUEST}\nhttps://x.com/a/status/1\nhttps://x.com/b/status/2`,
    );
  });
});
