import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import samples from "../template/data/bookmarks.json";
import { buildSite, linkedSite, runCli } from "./linked-site.ts";

const BUILD_TIMEOUT_MS = 60_000;
const BASE_PATH = "/pod-check";
const DATE = "2026-11-02";
const TOKEN_ENDPOINT = "https://relay.example/musickit-token";
const [agents] = samples.map(({ id }) => id);
const SONG = {
  title: "Here Comes the Sun",
  artist: "The Beatles",
  appleMusicId: "1441164589",
  url: "https://music.apple.com/jp/album/1441164426?i=1441164589",
};

let site = "";

const read = (file: string): Promise<string> => readFile(path.join(site, file), "utf8");

async function writeIssue(date: string): Promise<void> {
  await mkdir(path.join(site, "data/magazine"), { recursive: true });
  await writeFile(
    path.join(site, `data/magazine/${date}.json`),
    JSON.stringify({
      date,
      title: "One open port is enough",
      theme: { palette: "ocean", fonts: "serif" },
      sections: [{ type: "feature", bookmark: agents }],
    }),
  );
}

async function writeEpisode(): Promise<void> {
  const dir = path.join(site, `data/magazine/${DATE}`);
  await mkdir(path.join(dir, "seg-en"), { recursive: true });
  await writeFile(
    path.join(dir, "episode.json"),
    JSON.stringify({
      song: { ...SONG, why: "Rain today" },
      script: "not shipped",
      languages: {
        en: {
          file: "episode-en.mp3",
          duration: 235.57,
          voice: { id: "x" },
          chapters: [
            { start: 0, id: "jingle", title: "Jingle" },
            { start: 41.55, title: "A kernel bug" },
          ],
        },
        ja: { file: "episode-ja.mp3", duration: 240, chapters: [{ start: 0, title: "ジングル" }] },
      },
    }),
  );
  await Promise.all(
    ["episode-en.mp3", "episode-ja.mp3", "episode-ja-test-dialogue.mp3", "seg-en/take-1.mp3"].map((name) =>
      writeFile(path.join(dir, name), `ID3 ${name}`),
    ),
  );

  await writeFile(path.join(dir, "script-en.txt"), "the script");
}

const build = (): Promise<void> => buildSite(site, { BASE_PATH });

async function builtFiles(): Promise<string[]> {
  const entries = await readdir(path.join(site, "dist"), { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

beforeEach(async () => {
  site = await linkedSite();
  await writeIssue(DATE);
  await writeIssue("2026-11-01");
  await writeEpisode();
});

afterEach(async () => {
  await rm(site, { recursive: true, force: true });
});

describe("an issue with a podcast episode", () => {
  it(
    "publishes only the MP3s episode.json names and shows the player in the magazine view only",
    async () => {
      await build();
      const files = await builtFiles();
      expect(files.filter((name) => name.endsWith(".mp3")).map((name) => name.replace(/\.[^.]+\.mp3$/, ""))).toEqual(
        expect.arrayContaining(["episode-en", "episode-ja"]),
      );
      expect(files.filter((name) => name.endsWith(".mp3"))).toHaveLength(2);
      expect(
        files.some((name) => name.includes("test-dialogue") || name.includes("take-") || name.startsWith("script-")),
      ).toBe(false);

      const page = await read(`dist/magazine/${DATE}/index.html`);
      const [magazine = "", digest = ""] = page.split('data-view-panel="digest"');
      expect(digest).not.toContain("data-podcast");
      const player = /<section data-podcast="2026-11-02"[\s\S]*?<\/section>/.exec(magazine)?.[0] ?? "";
      expect(player).toContain('role="tablist"');
      expect(player).toMatch(/<button[^>]*role="tab"[^>]*data-podcast-tab="en"[^>]*aria-selected="true"/);
      expect(player).toMatch(/<button[^>]*role="tab"[^>]*data-podcast-tab="ja"[^>]*aria-selected="false"/);
      expect(player).toContain(">日本語<");
      expect(player).not.toContain('data-podcast-tab="zh"');
      expect(player).toMatch(
        new RegExp(`<audio[^>]*preload="none"[^>]*src="${BASE_PATH}/_astro/episode-en\\.[^"]+\\.mp3"`),
      );
      expect(player).toMatch(/<button[^>]*data-start="41.55"[^>]*aria-current="false"[\s\S]*?0:41[\s\S]*?A kernel bug/);
      expect(player).toMatch(/data-podcast-next[^>]*hidden/);
      expect(player).toContain("Here Comes the Sun</span> — The Beatles");
      expect(player).toContain(`href="${SONG.url}" target="_blank" rel="noopener noreferrer"`);
      expect(player).not.toContain("data-music-player");
      expect(player).not.toContain("data-token-endpoint");
      expect(player).toContain("print:hidden");
      expect(page).not.toContain("not shipped");

      const other = await read("dist/magazine/2026-11-01/index.html");
      expect(other).not.toContain("<section data-podcast");
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "offers one-tap Apple Music play when custom/config.json names a MusicKit token endpoint",
    async () => {
      await mkdir(path.join(site, "custom"), { recursive: true });
      await writeFile(
        path.join(site, "custom/config.json"),
        JSON.stringify({ musicKit: { tokenEndpoint: TOKEN_ENDPOINT } }),
      );
      await build();
      const page = await read(`dist/magazine/${DATE}/index.html`);
      expect(page).toContain(`data-token-endpoint="${TOKEN_ENDPOINT}"`);
      const player = page.slice(page.indexOf("<div data-music-player"), page.indexOf("data-music-duration"));
      expect(player).not.toBe("");
      expect(player).toContain('data-music-state="idle"');
      expect(player).toMatch(
        /<button[^>]*data-music-signin[^>]*hidden[^>]*>\s*Sign in to Apple Music for the full song/,
      );
      expect(player).toMatch(/<button[^>]*data-music-back[^>]*aria-label="Back 15 seconds"[^>]*disabled/);
      expect(player).toMatch(/<button[^>]*data-music-play[^>]*aria-label="Play Here Comes the Sun"[^>]*disabled/);
      expect(player).toMatch(/<button[^>]*data-music-forward[^>]*aria-label="Forward 15 seconds"[^>]*disabled/);
      expect(player).toMatch(
        /<input[^>]*type="range"[^>]*data-music-scrub[^>]*aria-label="Position in Here Comes the Sun"[^>]*aria-valuetext="0:00 of 0:00"/,
      );
      expect(player).toContain("<span data-music-time>0:00</span>");
      expect(page).toMatch(/<span[^>]*data-music-preview[^>]*hidden/);
      expect(page).toContain(`href="${SONG.url}"`);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "fails the build on an invalid episode.json, naming the file and the field",
    async () => {
      await writeFile(
        path.join(site, `data/magazine/${DATE}/episode.json`),
        JSON.stringify({ languages: { en: { file: "en.mp3", duration: 10, chapters: [{ start: 0, title: "A" }] } } }),
      );
      const { code, output } = await runCli(site, ["build"]);
      expect(code).not.toBe(0);
      expect(output).toContain(`data/magazine/${DATE}/episode.json is invalid`);
      expect(output).toContain("languages.en.file");
    },
    BUILD_TIMEOUT_MS,
  );
});
