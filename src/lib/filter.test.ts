import { describe, expect, it } from "vitest";
import { filterSearch, parseFilter } from "./filter";

describe("parseFilter", () => {
  it("reads the query and a known topic", () => {
    expect(parseFilter("?q=tokyo&topic=japan-tech")).toEqual({ query: "tokyo", topic: "japan-tech" });
  });

  it("ignores an unknown topic and a missing query", () => {
    expect(parseFilter("?topic=crypto")).toEqual({ query: "", topic: null });
  });
});

describe("filterSearch", () => {
  it("omits empty parts", () => {
    expect(filterSearch({ query: "  ", topic: null })).toBe("");
    expect(filterSearch({ query: "tokyo", topic: "design" })).toBe("?q=tokyo&topic=design");
  });

  it("round-trips through parseFilter", () => {
    const search = filterSearch({ query: "local first", topic: "japan-tech" });
    expect(parseFilter(search)).toEqual({ query: "local first", topic: "japan-tech" });
  });
});
