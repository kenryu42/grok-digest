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
  await mkdir(path.join(cwd, "data"), { recursive: true });
  await Promise.all(Object.entries(files).map(([name, text]) => writeFile(path.join(cwd, "data", name), text)));
}

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), "grok-digest-"));
});

describe("defaultDataFiles", () => {
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

  it("reports a file that is not JSON", async () => {
    await writeData({ "removed.json": "[1," });
    const [report] = await validateFiles({ cwd, files: ["data/removed.json"] });
    expect(errorOf(report)).toContain("data/removed.json is not valid JSON");
  });
});
