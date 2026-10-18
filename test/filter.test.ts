import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER, filterSearch, parseFilter } from "../src/lib/filter.ts";

describe("parseFilter", () => {
  it("reads the query, a known topic, the sort and the done filter", () => {
    expect(parseFilter("?q=tokyo&topic=japan-tech&sort=oldest&done=show")).toEqual({
      query: "tokyo",
      topic: "japan-tech",
      sort: "oldest",
      showDone: true,
    });
  });

  it("opens on what is left to read, newest saved first, and ignores unknown values", () => {
    expect(parseFilter("?topic=crypto&sort=posted&done=yes&news=hide&view=today")).toEqual(DEFAULT_FILTER);
  });
});

describe("filterSearch", () => {
  it("leaves the defaults out of the address", () => {
    expect(filterSearch({ ...DEFAULT_FILTER, query: "  " })).toBe("");
    expect(filterSearch({ ...DEFAULT_FILTER, query: "tokyo", topic: "design", sort: "oldest" })).toBe(
      "?q=tokyo&topic=design&sort=oldest",
    );
  });

  it("round-trips through parseFilter", () => {
    const filter = {
      query: "local first",
      topic: "japan-tech",
      sort: "oldest",
      showDone: true,
    } as const;
    expect(parseFilter(filterSearch(filter))).toEqual(filter);
  });
});
