import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import samples from "../template/data/bookmarks.json";
import { linkedSite, runCli, startDevServer, stop } from "./linked-site.ts";

const BUILD_TIMEOUT_MS = 60_000;
const ORIGIN = "https://example.github.io";
const BASE_PATH = "/mag-check";
const [agents, tokyo, design] = samples.map(({ id }) => id);

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

beforeEach(async () => {
  site = await linkedSite();
});

afterEach(async () => {
  await rm(site, { recursive: true, force: true });
});

describe("a site without magazine issues", () => {
  it(
    "builds no magazine and no Magazine link, the same with or without an empty data/magazine/",
    async () => {
      await build();
      const html = await read("dist/index.html");
      const files = await builtFiles();
      expect(html).not.toMatch(/magazine/i);
      expect(files.filter((file) => file.startsWith("magazine"))).toEqual([]);

      await mkdir(path.join(site, "data/magazine"));
      await writeFile(path.join(site, "data/magazine/notes.txt"), "not an issue");
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
    "shows the latest issue and the archive at magazine/, each issue with prev and next, and a feed, under the base path",
    async () => {
      await build({ SITE_URL: ORIGIN, BASE_PATH });
      const header = /<header[\s\S]*?<\/header>/.exec(await read("dist/index.html"))?.[0] ?? "";
      expect(header).toMatch(new RegExp(`<a href="${BASE_PATH}/magazine/"[^>]*>\\s*Magazine\\s*</a>`));

      const latest = await read("dist/magazine/index.html");
      expect(latest).toContain("Newest issue");
      expect(latest).toContain('data-palette="plum"');
      expect(latest).toContain("--issue-accent:#1d4ed8");
      expect(latest).toContain(`href="${BASE_PATH}/magazine/2026-10-18/"`);
      expect(latest).toContain(`href="${BASE_PATH}/#b-${agents}"`);
      expect(latest).toMatch(new RegExp(`<a href="${BASE_PATH}/"[^>]*>\\s*Bookmarks\\s*</a>`));

      const newer = await read("dist/magazine/2026-10-19/index.html");
      const older = await read("dist/magazine/2026-10-18/index.html");
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
      expect(latest).toContain(`href="${BASE_PATH}/magazine/rss.xml"`);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "loads custom/theme.css after the magazine's styles, so an owner's palette wins",
    async () => {
      await mkdir(path.join(site, "custom"));
      await writeFile(path.join(site, "custom/theme.css"), '[data-palette="plum"] { --palette-hue: 7; }\n');
      await build();
      const page = await read("dist/magazine/2026-10-19/index.html");
      const sheets = [...page.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)].map(([, file]) => file ?? "");
      const css = (await Promise.all(sheets.map((file) => read(`dist/${file}`)))).join("\n");
      const hues = [...css.matchAll(/data-palette=(?:"plum"|plum)\]\{--palette-hue:(\d+)/g)].map(([, hue]) => hue);
      expect(hues).toEqual(["320", "7"]);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "fails validate and the build on an issue that names a missing bookmark, naming the file and the field",
    async () => {
      await writeIssue("2026-10-20", { title: "Broken", theme, sections: [{ type: "feature", bookmark: "404" }] });
      const validate = await runCli(site, ["validate"]);
      expect(validate.code).toBe(1);
      expect(validate.output).toContain("✓ data/magazine/2026-10-19.json: 3 sections");
      expect(validate.output).toMatch(
        /data\/magazine\/2026-10-20\.json is invalid:\n✖ "404" is not a bookmark id in bookmarks\.json\n {2}→ at sections\[0\]\.bookmark/,
      );
      const built = await runCli(site, ["build"]);
      expect(built.code).not.toBe(0);
      expect(built.output).toContain("data/magazine/2026-10-20.json is invalid");
    },
    BUILD_TIMEOUT_MS,
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
