import { describe, expect, it } from "vitest";
import { filterSearch, parseFilter } from "../src/lib/filter.ts";

describe("parseFilter", () => {
  it("reads the query, a known topic and a view", () => {
    expect(parseFilter("?q=tokyo&topic=japan-tech&view=done")).toEqual({
      query: "tokyo",
      topic: "japan-tech",
      view: "done",
    });
  });

  it("opens today's review and ignores unknown values", () => {
    expect(parseFilter("?topic=crypto&view=starred")).toEqual({ query: "", topic: null, view: "today" });
  });
});

describe("filterSearch", () => {
  it("omits empty parts and the default view", () => {
    expect(filterSearch({ query: "  ", topic: null, view: "today" })).toBe("");
    expect(filterSearch({ query: "tokyo", topic: "design", view: "inbox" })).toBe("?q=tokyo&topic=design&view=inbox");
  });

  it("round-trips through parseFilter", () => {
    const filter = { query: "local first", topic: "japan-tech", view: "all" } as const;
    expect(parseFilter(filterSearch(filter))).toEqual(filter);
  });
});
