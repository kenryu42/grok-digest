import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultDataFiles, validateFiles } from "../src/lib/validate.ts";
import templateSamples from "./fixtures/bookmarks-v1-template.json";

let cwd = "";

const errorOf = (report: Awaited<ReturnType<typeof validateFiles>>[number] | undefined): string =>
  report === undefined || report.ok ? "" : report.error;

async function writeData(files: Record<string, string>): Promise<void> {
  await mkdir(path.join(cwd, "data", "magazine"), { recursive: true });
  await Promise.all(Object.entries(files).map(([name, text]) => writeFile(path.join(cwd, "data", name), text)));
}

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), "grok-digest-"));
});

describe("defaultDataFiles", () => {
  it("lists every issue in data/magazine/ after the other data files", async () => {
    await writeData({
      "bookmarks.json": "[]",
      "magazine/2026-10-19.json": "{}",
      "magazine/notes.txt": "",
      "magazine/processed.json": "[]",
    });
    expect(await defaultDataFiles({ cwd, dataDir: "data" })).toEqual([
      path.join("data", "bookmarks.json"),
      path.join("data", "magazine", "2026-10-19.json"),
    ]);
  });

  it("lists bookmarks.json and only the state files that exist", async () => {
    await writeData({ "bookmarks.json": "[]", "processed.json": "[]" });
    expect(await defaultDataFiles({ cwd, dataDir: "data" })).toEqual([
      path.join("data", "bookmarks.json"),
      path.join("data", "processed.json"),
    ]);
  });
});

describe("validateFiles", () => {
  it("checks each file against the schema its name implies", async () => {
    await writeData({
      "bookmarks.json": JSON.stringify(templateSamples),
      "processed.json": '["403121"]',
      "removed.json": "[]",
    });
    const reports = await validateFiles({
      cwd,
      files: ["data/bookmarks.json", "data/processed.json", "data/removed.json"],
    });
    expect(reports).toEqual([
      { source: "data/bookmarks.json", ok: true, summary: "3 bookmarks" },
      { source: "data/processed.json", ok: true, summary: "1 id" },
      { source: "data/removed.json", ok: true, summary: "0 ids" },
    ]);
  });

  it("names the file and the field that is wrong", async () => {
    await writeData({ "bookmarks.json": JSON.stringify([{ ...templateSamples[0], topic: "crypto" }]) });
    const [report] = await validateFiles({ cwd, files: ["data/bookmarks.json"] });
    expect(errorOf(report)).toMatch(/data\/bookmarks\.json is invalid:[\s\S]*\[0\]\.topic/);
  });

  it("checks a magazine issue against the bookmarks next to it, naming the file and the field", async () => {
    const issue = {
      date: "2026-10-19",
      title: "Issue",
      theme: { palette: "ocean", fonts: "serif" },
      sections: [{ type: "feature", bookmark: templateSamples[0]?.id }],
    };
    await writeData({
      "bookmarks.json": JSON.stringify(templateSamples),
      "magazine/2026-10-19.json": JSON.stringify(issue),
      "magazine/2026-10-20.json": JSON.stringify({
        ...issue,
        date: "2026-10-20",
        sections: [{ type: "feature", bookmark: "9" }],
      }),
    });
    const reports = await validateFiles({
      cwd,
      files: ["data/magazine/2026-10-19.json", "data/magazine/2026-10-20.json"],
    });
    expect(reports[0]).toEqual({ source: "data/magazine/2026-10-19.json", ok: true, summary: "1 section" });
    expect(errorOf(reports[1])).toMatch(
      /data\/magazine\/2026-10-20\.json is invalid:\n✖ "9" is not a bookmark id in bookmarks\.json\n {2}→ at sections\[0\]\.bookmark/,
    );
  });

  it("reports an issue as unchecked while the bookmarks it names are invalid", async () => {
    await writeData({ "bookmarks.json": "[{}]", "magazine/2026-10-19.json": "{}", "magazine/2026-10-20.json": "{}" });
    const reports = await validateFiles({
      cwd,
      files: ["data/bookmarks.json", "data/magazine/2026-10-19.json", "data/magazine/2026-10-20.json"],
    });
    expect(errorOf(reports[0])).toContain("data/bookmarks.json is invalid");
    expect(reports.slice(1).map(errorOf)).toEqual([
      "data/magazine/2026-10-19.json cannot be checked until data/bookmarks.json is valid: data/bookmarks.json is invalid",
      "data/magazine/2026-10-20.json cannot be checked until data/bookmarks.json is valid: data/bookmarks.json is invalid",
    ]);
  });

  it("checks the bookmarks of a data folder named magazine as bookmarks", async () => {
    await mkdir(path.join(cwd, "magazine"));
    await writeFile(path.join(cwd, "magazine/bookmarks.json"), JSON.stringify(templateSamples));
    const [report] = await validateFiles({ cwd, files: ["magazine/bookmarks.json"] });
    expect(report).toEqual({ source: "magazine/bookmarks.json", ok: true, summary: "3 bookmarks" });
  });

  it("reports a file that is not JSON", async () => {
    await writeData({ "removed.json": "[1," });
    const [report] = await validateFiles({ cwd, files: ["data/removed.json"] });
    expect(errorOf(report)).toContain("data/removed.json is not valid JSON");
  });
});
