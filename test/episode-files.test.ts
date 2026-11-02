import { mkdir, mkdtemp, readdir, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_EPISODE_BYTES } from "../src/lib/episode.ts";
import { pruneEpisodes } from "../src/lib/prune-episodes.ts";
import { defaultDataFiles, validateFiles } from "../src/lib/validate.ts";
import { runCli } from "./linked-site.ts";

const NOW = new Date("2026-11-02T12:00:00Z");
const CLI_TIMEOUT_MS = 30_000;
const EPISODE = {
  date: "2026-11-02",
  voice: "ignored",
  song: {
    title: "Here Comes the Sun",
    artist: "The Beatles",
    appleMusicId: "1441164589",
    url: "https://music.apple.com/jp/album/1441164426?i=1441164589",
  },
  languages: {
    en: { file: "episode-en.mp3", duration: 120, chapters: [{ start: 0, title: "Jingle" }] },
    ja: { file: "episode-ja.mp3", duration: 130, chapters: [{ start: 0, title: "ジングル" }] },
  },
};

let cwd = "";

const folder = (date: string): string => path.join(cwd, "data/magazine", date);

async function writeEpisode(date: string, files: string[], episode: object = EPISODE): Promise<void> {
  await mkdir(folder(date), { recursive: true });
  await writeFile(path.join(folder(date), "episode.json"), JSON.stringify(episode));
  await writeFile(path.join(cwd, "data/magazine", `${date}.json`), "{}");
  await Promise.all(files.map((name) => writeFile(path.join(folder(date), name), "ID3")));
}

const validate = (date: string, now = NOW) =>
  validateFiles({ cwd, files: [`data/magazine/${date}/episode.json`], now }).then(([report]) => report);

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), "grok-digest-episode-"));
  await mkdir(path.join(cwd, "data/magazine"), { recursive: true });
  await writeFile(path.join(cwd, "data/bookmarks.json"), "[]");
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("validating an episode", () => {
  it("lists each issue's episode.json among the data files", async () => {
    await writeEpisode("2026-11-02", []);
    await mkdir(folder("2026-11-01"), { recursive: true });
    await mkdir(path.join(cwd, "data/magazine/drafts"), { recursive: true });
    await writeFile(path.join(cwd, "data/magazine/drafts/episode.json"), "{}");
    expect(await defaultDataFiles({ cwd, dataDir: "data" })).toEqual([
      path.join("data", "bookmarks.json"),
      path.join("data", "magazine", "2026-11-02.json"),
      path.join("data", "magazine", "2026-11-02", "episode.json"),
    ]);
  });

  it("passes an episode whose files are all there, ignoring fields the page does not use", async () => {
    await writeEpisode("2026-11-02", ["episode-en.mp3", "episode-ja.mp3"]);
    expect(await validate("2026-11-02")).toEqual({
      source: "data/magazine/2026-11-02/episode.json",
      ok: true,
      summary: 'episode in en, ja, then "Here Comes the Sun"',
    });
  });

  it("warns about an episode without its issue, since no page plays it", async () => {
    await writeEpisode("2026-11-02", ["episode-en.mp3", "episode-ja.mp3"]);
    await rm(path.join(cwd, "data/magazine/2026-11-02.json"));
    expect(await validate("2026-11-02")).toMatchObject({
      ok: true,
      warnings: ["there is no issue data/magazine/2026-11-02.json, so no page plays this episode"],
    });
  });

  it("fails a missing file and a file over 10 MB", async () => {
    await writeEpisode("2026-11-02", ["episode-en.mp3"]);
    await truncate(path.join(folder("2026-11-02"), "episode-en.mp3"), MAX_EPISODE_BYTES + 1);
    const report = await validate("2026-11-02");
    expect(report?.ok).toBe(false);
    const error = report?.ok === false ? report.error : "";
    expect(error).toContain("data/magazine/2026-11-02/episode-en.mp3 is 10.0 MB; keep each episode file at most 10 MB");
    expect(error).toContain("data/magazine/2026-11-02/episode-ja.mp3 is missing");
  });

  it("fails a file not named after its language", async () => {
    const misnamed = { languages: { en: { ...EPISODE.languages.en, file: "episode-ja-test-dialogue.mp3" } } };
    await writeEpisode("2026-11-02", ["episode-ja-test-dialogue.mp3"], misnamed);
    const report = await validate("2026-11-02");
    expect(report?.ok === false ? report.error : "").toMatch(/must be episode-en\.mp3[\s\S]*languages\.en\.file/);
  });

  it("warns about an episode older than 60 days and says how to prune it", async () => {
    await writeEpisode("2026-09-01", ["episode-en.mp3", "episode-ja.mp3"]);
    expect(await validate("2026-09-01")).toMatchObject({
      ok: true,
      warnings: [
        "the episode is 62 days old; run grok-digest prune-episodes --days 60 to delete episodes older than 60 days",
      ],
    });
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): string => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);

describe("pruning episodes", () => {
  const OLD = daysAgo(90);
  const RECENT = daysAgo(3);

  beforeEach(async () => {
    await writeEpisode(OLD, ["episode-en.mp3", "episode-ja.mp3", "episode-ja-test-dialogue.mp3"]);
    await writeFile(path.join(folder(OLD), "art.jpg"), "");
    await writeEpisode(RECENT, ["episode-en.mp3"]);
  });

  it("lists the episode files older than the days given without deleting them on a dry run", async () => {
    const magazineDir = path.join(cwd, "data/magazine");
    const listed = await pruneEpisodes({ magazineDir, days: 60, dryRun: true });
    expect(listed.map((file) => path.relative(magazineDir, file))).toEqual([
      path.join(OLD, "episode.json"),
      path.join(OLD, "episode-en.mp3"),
      path.join(OLD, "episode-ja.mp3"),
    ]);
    expect(await readdir(folder(OLD))).toHaveLength(5);
  });

  it("deletes only episode.json and the episode MP3s of old issues", async () => {
    const magazineDir = path.join(cwd, "data/magazine");
    expect(await pruneEpisodes({ magazineDir, days: 60 })).toHaveLength(3);
    expect((await readdir(folder(OLD))).toSorted()).toEqual(["art.jpg", "episode-ja-test-dialogue.mp3"]);
    expect((await readdir(folder(RECENT))).toSorted()).toEqual(["episode-en.mp3", "episode.json"]);
    expect(await pruneEpisodes({ magazineDir: path.join(cwd, "missing"), days: 60 })).toEqual([]);
  });

  it(
    "runs from the command line, with --dry-run and --days",
    async () => {
      const dry = await runCli(cwd, ["prune-episodes", "--days", "1", "--dry-run"]);
      expect(dry.code).toBe(0);
      expect(dry.output).toContain(`Would delete data/magazine/${OLD}/episode.json`);
      expect(dry.output).toContain("Would delete 5 files.");
      expect(await readdir(folder(RECENT))).toHaveLength(2);

      const pruned = await runCli(cwd, ["prune-episodes"]);
      expect(pruned.code).toBe(0);
      expect(pruned.output).toContain("Deleted 3 files.");
      expect(await readdir(folder(RECENT))).toHaveLength(2);

      const invalid = ["soon", "", "1.5", "-1"];
      const refused = await Promise.all(invalid.map((days) => runCli(cwd, ["prune-episodes", `--days=${days}`])));
      refused.forEach(({ code, output }, index) => {
        expect(code).toBe(1);
        expect(output).toContain(`--days must be a whole number of days, not "${invalid[index] ?? ""}"`);
      });
      expect(await readdir(folder(RECENT))).toHaveLength(2);
    },
    CLI_TIMEOUT_MS,
  );
});
