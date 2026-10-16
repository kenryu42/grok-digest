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

  it("opens the inbox when today's review is empty, unless the address asks for today", () => {
    expect(parseFilter("", { reviewIsEmpty: true }).view).toBe("inbox");
    expect(parseFilter("?view=starred", { reviewIsEmpty: true }).view).toBe("inbox");
    expect(parseFilter("?view=today", { reviewIsEmpty: true }).view).toBe("today");
    expect(parseFilter("?view=done", { reviewIsEmpty: true }).view).toBe("done");
  });

  it("opens the view the site chose, whether or not today's review is empty", () => {
    expect(parseFilter("", { view: "all" }).view).toBe("all");
    expect(parseFilter("", { view: "all", reviewIsEmpty: true }).view).toBe("all");
    expect(parseFilter("?view=today", { view: "all" }).view).toBe("today");
  });
});

describe("filterSearch", () => {
  it("omits empty parts and the default view", () => {
    expect(filterSearch({ query: "  ", topic: null, view: "today" })).toBe("");
    expect(filterSearch({ query: "tokyo", topic: "design", view: "inbox" })).toBe("?q=tokyo&topic=design&view=inbox");
  });

  it("omits the view the site chose and names today when it is not the default", () => {
    expect(filterSearch({ query: "", topic: null, view: "all" }, { view: "all" })).toBe("");
    expect(filterSearch({ query: "", topic: null, view: "today" }, { view: "all" })).toBe("?view=today");
  });

  it("leaves the inbox out of the address when it is the page's default", () => {
    const empty = { reviewIsEmpty: true };
    expect(filterSearch({ query: "", topic: null, view: "inbox" }, empty)).toBe("");
    expect(filterSearch({ query: "", topic: null, view: "today" }, empty)).toBe("?view=today");
    expect(parseFilter(filterSearch({ query: "", topic: null, view: "today" }, empty), empty).view).toBe("today");
  });

  it("round-trips through parseFilter", () => {
    const filter = { query: "local first", topic: "japan-tech", view: "all" } as const;
    expect(parseFilter(filterSearch(filter))).toEqual(filter);
  });
});
