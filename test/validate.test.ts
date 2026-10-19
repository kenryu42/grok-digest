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
  it("lists every JSON file in data/magazine/ after the other data files", async () => {
    await writeData({
      "bookmarks.json": "[]",
      "magazine/2026-10-19.json": "{}",
      "magazine/notes.json": "{}",
      "magazine/notes.txt": "",
    });
    expect(await defaultDataFiles({ cwd, dataDir: "data" })).toEqual([
      path.join("data", "bookmarks.json"),
      path.join("data", "magazine", "2026-10-19.json"),
      path.join("data", "magazine", "notes.json"),
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

const issue = {
  date: "2026-10-19",
  title: "Issue",
  theme: { palette: "ocean", fonts: "serif" },
  sections: [{ type: "feature", bookmark: templateSamples[0]?.id }],
};

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

  it("warns about an issue's missing bookmark, naming the file and the field, without failing", async () => {
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
      now: new Date("2026-10-20T12:00:00Z"),
    });
    expect(reports).toEqual([
      { source: "data/magazine/2026-10-19.json", ok: true, summary: "1 section" },
      {
        source: "data/magazine/2026-10-20.json",
        ok: true,
        summary: "1 section",
        warnings: [
          '"9" is not a bookmark id in bookmarks.json; the page leaves the block out\n  → at sections[0].bookmark',
        ],
      },
    ]);
  });

  it("still fails an issue that breaks the schema", async () => {
    await writeData({
      "bookmarks.json": JSON.stringify(templateSamples),
      "magazine/2026-10-19.json": JSON.stringify({ ...issue, theme: { palette: "rainbow", fonts: "serif" } }),
    });
    const [report] = await validateFiles({ cwd, files: ["data/magazine/2026-10-19.json"] });
    expect(errorOf(report)).toMatch(/data\/magazine\/2026-10-19\.json is invalid:[\s\S]*→ at theme\.palette/);
  });

  it("warns about a JSON file in data/magazine/ not named after a date, and ignores it", async () => {
    await writeData({ "magazine/notes.json": "not even JSON" });
    const [report] = await validateFiles({ cwd, files: ["data/magazine/notes.json"] });
    expect(report).toEqual({
      source: "data/magazine/notes.json",
      ok: true,
      summary: "not an issue, so the page ignores it",
      warnings: ["name an issue after its date, such as 2026-10-19.json"],
    });
  });

  it("reports an issue as unchecked while the bookmarks it names are invalid", async () => {
    await writeData({
      "bookmarks.json": "[{}]",
      "magazine/2026-10-19.json": JSON.stringify(issue),
      "magazine/2026-10-20.json": JSON.stringify({ ...issue, date: "2026-10-20" }),
    });
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
