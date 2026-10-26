import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import samples from "../template/data/bookmarks.json";
import { linkedSite, runCli, startDevServer, stop, withoutBuildHashes } from "./linked-site.ts";

const BUILD_TIMEOUT_MS = 60_000;
const ORIGIN = "https://example.github.io";
const BASE_PATH = "/mag-check";
const [agents, tokyo, design] = samples.map(({ id }) => id);
const COVER_PICTURE = path.resolve("src/assets/icon-512.png");
const ART_PICTURE = path.resolve("dev/data/magazine/2026-02-13/beaks.jpg");

let site = "";

const read = (file: string): Promise<string> => readFile(path.join(site, file), "utf8");

async function writeIssue(date: string, issue: object): Promise<void> {
  await mkdir(path.join(site, "data/magazine"), { recursive: true });
  await writeFile(path.join(site, `data/magazine/${date}.json`), JSON.stringify({ date, ...issue }));
}

async function build(env: Record<string, string> = {}): Promise<string> {
  const { code, output } = await runCli(site, ["build"], env);
  expect({ code, output }).toMatchObject({ code: 0 });
  return output;
}

async function builtFiles(dir = "dist"): Promise<string[]> {
  const entries = await readdir(path.join(site, dir), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(path.join(site, dir), path.join(entry.parentPath, entry.name)))
    .toSorted();
}

const theme = { palette: "plum", fonts: "sans-serif" };

const coverOf = (page: string, date: string): string =>
  new RegExp(`<div data-issue-cover="${BASE_PATH}/magazine/${date}/"[\\s\\S]*?</div>`).exec(page)?.[0] ?? "";

beforeEach(async () => {
  site = await linkedSite();
});

afterEach(async () => {
  await rm(site, { recursive: true, force: true });
});

describe("a site without magazine issues", () => {
  it(
    "builds no magazine and no Magazine link, the same when data/magazine/ holds only a file not named after a date",
    async () => {
      await build();
      const html = await read("dist/index.html");
      const files = await builtFiles();
      expect(html).not.toMatch(/magazine/i);
      expect(files.filter((file) => file.startsWith("magazine"))).toEqual([]);

      await mkdir(path.join(site, "data/magazine"));
      await writeFile(path.join(site, "data/magazine/notes.json"), "{}");
      await build();
      expect(await read("dist/index.html")).toBe(html);
      expect(await builtFiles()).toEqual(files);
    },
    2 * BUILD_TIMEOUT_MS,
  );
});

describe("a site with magazine issues", () => {
  beforeEach(async () => {
    await writeIssue("2026-10-18", {
      title: "Older <script>alert(1)</script>",
      theme,
      sections: [
        { type: "feature", bookmark: tokyo },
        { type: "numbered-list", items: [{ bookmark: tokyo }, { bookmark: design }] },
      ],
    });
    await writeIssue("2026-10-19", {
      title: "Newest issue",
      subtitle: "Plans first",
      theme: { ...theme, accent: "#1d4ed8" },
      sections: [
        { type: "cover-story", bookmark: agents, headline: "Plan, then wait", variant: "overlay" },
        { type: "sidebar-box", bookmark: agents },
        { type: "topic-divider", topic: "design" },
      ],
    });
  });

  it(
    "shows a cover for each issue at magazine/, each issue with prev and next, and a feed, under the base path, in any time zone",
    async () => {
      await build({ SITE_URL: ORIGIN, BASE_PATH, TZ: "America/Los_Angeles" });
      const header = /<header[\s\S]*?<\/header>/.exec(await read("dist/index.html"))?.[0] ?? "";
      expect(header).toMatch(new RegExp(`<a href="${BASE_PATH}/magazine/"[^>]*>\\s*Magazine\\s*</a>`));

      const latest = await read("dist/magazine/index.html");
      expect(latest.indexOf("Newest issue")).toBeLessThan(latest.indexOf("Older &lt;script&gt;"));
      expect(latest).toContain('data-palette="plum"');
      expect(latest).toContain("--issue-accent:#1d4ed8");
      expect(latest).toContain(`href="${BASE_PATH}/magazine/2026-10-18/"`);
      expect(latest).toContain(`<time datetime="2026-10-19">Oct 19, 2026</time>`);
      expect(latest).toMatch(new RegExp(`<a href="${BASE_PATH}/"[^>]*>\\s*Bookmarks\\s*</a>`));
      expect(latest).toContain(`href="${BASE_PATH}/magazine/rss.xml"`);
      expect(latest).not.toContain(`href="${BASE_PATH}/rss.xml"`);

      const newer = await read("dist/magazine/2026-10-19/index.html");
      const older = await read("dist/magazine/2026-10-18/index.html");
      expect(newer).toContain(`href="${BASE_PATH}/#b-${agents}"`);
      expect(newer).toContain('No. 2 · <time datetime="2026-10-19">Monday, October 19, 2026</time>');
      expect(older).toContain("No. 1 ·");
      expect(newer).toContain(`rel="prev" href="${BASE_PATH}/magazine/2026-10-18/"`);
      expect(newer).not.toContain('rel="next"');
      expect(older).toContain(`rel="next" href="${BASE_PATH}/magazine/2026-10-19/"`);
      expect(older).not.toContain('rel="prev"');
      expect(older).toContain("Older &lt;script&gt;alert(1)&lt;/script&gt;");
      expect(older.replaceAll(/="[^"]*"/g, "")).not.toContain("<script>alert(1)");

      for (const page of [latest, newer, older]) {
        const local = [...page.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map(([, url]) => url ?? "");
        expect(local.filter((url) => !url.startsWith(`${BASE_PATH}/`))).toEqual([]);
        expect(page).not.toMatch(/<iframe/);
      }

      const feed = await read("dist/magazine/rss.xml");
      expect(feed).toContain(`<link>${ORIGIN}${BASE_PATH}/magazine/2026-10-19/</link>`);
      expect(feed).toContain(`<link>${ORIGIN}${BASE_PATH}/magazine/2026-10-18/</link>`);
      expect(feed.indexOf("2026-10-19/</link>")).toBeLessThan(feed.indexOf("2026-10-18/</link>"));
      expect(feed).toContain("<pubDate>Mon, 19 Oct 2026 00:00:00 GMT</pubDate>");
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "shows an issue's own picture on its covers and in the feed, and a lettered cover for an issue without one",
    async () => {
      await copyFile(COVER_PICTURE, path.join(site, "data/magazine/2026-10-19.png"));
      await build({ SITE_URL: ORIGIN, BASE_PATH });
      const archive = await read("dist/magazine/index.html");
      const newest = await read("dist/magazine/2026-10-19/index.html");
      const older = await read("dist/magazine/2026-10-18/index.html");

      const sources = [coverOf(archive, "2026-10-19"), coverOf(newest, "2026-10-19")].map((cover) =>
        [...(/srcset="([^"]+)"/.exec(cover)?.[1] ?? "").matchAll(/(\S+) \d+w/g)].map(([, url]) => url ?? ""),
      );
      expect(sources.map((urls) => urls.length > 1)).toEqual([true, true]);
      const built = sources.flat().map((url) => (url.startsWith(`${BASE_PATH}/`) ? url.slice(BASE_PATH.length) : url));
      const sizes = await Promise.all(
        built.map(async (file) => (await readFile(path.join(site, "dist", file))).length),
      );
      expect(sizes.every((size) => size > 0)).toBe(true);
      for (const cover of [coverOf(archive, "2026-10-18"), coverOf(older, "2026-10-18")]) {
        expect(cover).not.toContain("<img");
        expect(cover).toContain("Older &lt;script&gt;alert(1)&lt;/script&gt;");
      }

      const feed = await read("dist/magazine/rss.xml");
      const pictures = [...feed.matchAll(new RegExp(`&lt;img src=&quot;${ORIGIN}${BASE_PATH}(/[^&]+)&quot;`, "g"))].map(
        ([, file]) => file ?? "",
      );
      expect(pictures).toHaveLength(1);
      await expect(readFile(path.join(site, "dist", pictures[0] ?? ""))).resolves.toEqual(
        await readFile(COVER_PICTURE),
      );
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "shows art from the issue's folder, resized, where the post has no image, and leaves out what is missing",
    async () => {
      await writeIssue("2026-10-17", {
        title: "Drawn issue",
        theme,
        sections: [
          { type: "feature", bookmark: tokyo, art: "lead.jpg", art_alt: "Green hills" },
          { type: "feature", bookmark: design, art: "gone.jpg" },
          { type: "image-of-the-day", art: "day/end.jpg", headline: "The day, drawn", caption: "Soft green hills." },
        ],
      });
      await writeIssue("2026-10-16", {
        title: "Missing picture",
        theme,
        sections: [
          { type: "feature", bookmark: design },
          { type: "image-of-the-day", art: "gone.jpg", caption: "Never shown." },
        ],
      });
      await mkdir(path.join(site, "data/magazine/2026-10-17/day"), { recursive: true });
      await copyFile(ART_PICTURE, path.join(site, "data/magazine/2026-10-17/lead.jpg"));
      await copyFile(ART_PICTURE, path.join(site, "data/magazine/2026-10-17/day/end.jpg"));
      await build({ BASE_PATH });

      const drawn = await read("dist/magazine/2026-10-17/index.html");
      const arts = [...drawn.matchAll(/<img[^>]*data-art[^>]*>/g)].map(([tag]) => tag);
      expect(arts).toHaveLength(2);
      expect(arts[0]).toContain('alt="Green hills"');
      for (const tag of arts) {
        const sources = [...(/srcset="([^"]+)"/.exec(tag)?.[1] ?? "").matchAll(/(\S+) \d+w/g)].map(([, url]) => url);
        expect(sources.length).toBeGreaterThan(1);
        expect(sources.every((url) => url?.startsWith(`${BASE_PATH}/_astro/`))).toBe(true);
      }
      expect(drawn).toContain("The day, drawn");
      expect(drawn).toContain("Soft green hills.");
      expect(drawn.match(/data-block="feature"/g)).toHaveLength(2);

      const missing = await read("dist/magazine/2026-10-16/index.html");
      expect(missing).not.toContain('data-block="image-of-the-day"');
      expect(missing).not.toContain("Never shown.");
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "lets custom/theme.css change a palette",
    async () => {
      await mkdir(path.join(site, "custom"));
      await writeFile(path.join(site, "custom/theme.css"), '[data-palette="plum"] { --palette-hue: 7; }\n');
      await build();
      const page = await read("dist/magazine/2026-10-19/index.html");
      const sheets = [...page.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)].map(([, file]) => file ?? "");
      const css = (await Promise.all(sheets.map((file) => read(`dist/${file}`)))).join("\n");
      const hues = [...css.matchAll(/data-palette=(?:"plum"|plum)\]\{--palette-hue:(\d+)/g)].map(([, hue]) => hue);
      expect(hues.at(-1)).toBe("7");
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "keeps validating and building after a bookmark an issue shows is removed, leaving that block out",
    async () => {
      await writeIssue("2026-10-17", {
        title: "Removed bookmark",
        theme,
        sections: [
          { type: "feature", bookmark: "404" },
          {
            type: "brief-grid",
            headline: "Still here",
            items: [{ bookmark: tokyo }, { bookmark: design }, { bookmark: "405" }],
          },
        ],
      });
      const validate = await runCli(site, ["validate"]);
      expect(validate.code).toBe(0);
      expect(validate.output).toContain(
        '⚠ data/magazine/2026-10-17.json: "404" is not a bookmark id in bookmarks.json; the page leaves the block out\n  → at sections[0].bookmark',
      );
      await build();
      const page = await read("dist/magazine/2026-10-17/index.html");
      expect(page).not.toContain('data-block="feature"');
      expect(page).toContain("Still here");
      expect(page.match(/<li class="flex flex-col gap-1.5/g)).toHaveLength(2);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "leaves the bookmarks page as it is without issues, apart from the Magazine link and the stylesheet name",
    async () => {
      await build();
      const withIssues = await read("dist/index.html");
      await rm(path.join(site, "data/magazine"), { recursive: true });
      await build();
      const withoutIssues = await read("dist/index.html");
      const link = /<a href="\/magazine\/"[^>]*>\s*Magazine\s*<\/a>/;
      expect(withIssues).toMatch(link);
      expect(withoutBuildHashes(withIssues.replace(link, ""))).toBe(withoutBuildHashes(withoutIssues));
    },
    2 * BUILD_TIMEOUT_MS,
  );
});

describe("dev", () => {
  it(
    "adds the magazine and its link when the first issue appears, and removes them with the last",
    async () => {
      const dev = await startDevServer(site);
      const status = async (): Promise<number> => (await fetch(new URL("magazine/", dev.address))).status;
      const linked = async (): Promise<boolean> =>
        (await (await fetch(dev.address)).text()).includes('href="/magazine/"');
      const waitFor = { timeout: 20_000, interval: 500 };
      try {
        expect(await status()).toBe(404);
        await writeIssue("2026-10-19", {
          title: "Fresh issue",
          theme,
          sections: [{ type: "feature", bookmark: agents }],
        });
        await vi.waitFor(async () => expect(await status()).toBe(200), waitFor);
        expect(await linked()).toBe(true);
        await copyFile(COVER_PICTURE, path.join(site, "data/magazine/2026-10-19.jpg"));
        await vi.waitFor(async () => {
          const archive = await (await fetch(new URL("magazine/", dev.address))).text();
          expect(archive).toMatch(/<div data-issue-cover="\/magazine\/2026-10-19\/"[^>]*>\s*<img/);
        }, waitFor);
        await rm(path.join(site, "data/magazine/2026-10-19.json"));
        await vi.waitFor(async () => expect(await status()).toBe(404), waitFor);
        expect(await linked()).toBe(false);
      } finally {
        await stop(dev.child);
      }
    },
    BUILD_TIMEOUT_MS,
  );
});
