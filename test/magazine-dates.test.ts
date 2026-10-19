import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const LIB = new URL("../src/lib/", import.meta.url).href;

const DATES_IN_TIME_ZONE = `
const { issueDateLabel, issueShortDateLabel } = await import("${LIB}magazine.ts");
const { magazineFeedConfig } = await import("${LIB}magazine-feed.ts");
const issue = {
  date: "2026-10-19",
  title: "Issue",
  theme: { palette: "ocean", fonts: "serif" },
  sections: [{ type: "topic-divider", topic: "design", variant: "rule", emphasis: "normal", span: "full" }],
};
const [item] = magazineFeedConfig({ issues: [issue], find: () => undefined, origin: "https://example.github.io", base: "/" }).items;
console.log(JSON.stringify({ long: issueDateLabel(issue.date), short: issueShortDateLabel(issue.date), pubDate: item.pubDate.toUTCString() }));
`;

function datesIn(timeZone: string): unknown {
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", DATES_IN_TIME_ZONE], {
    env: { ...process.env, TZ: timeZone },
    encoding: "utf8",
  });
  return JSON.parse(output);
}

describe("issue dates", () => {
  it.each(["America/Los_Angeles", "Asia/Tokyo", "UTC"])("show the file's date in %s", (timeZone) => {
    expect(datesIn(timeZone)).toEqual({
      long: "Monday, October 19, 2026",
      short: "Oct 19, 2026",
      pubDate: "Mon, 19 Oct 2026 00:00:00 GMT",
    });
  });
});
