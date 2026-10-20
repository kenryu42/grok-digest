import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import samples from "../template/data/bookmarks.json";
import { linkedSite, runCli } from "./linked-site.ts";

const BUILD_TIMEOUT_MS = 60_000;
const [agents, tokyo] = samples.map(({ id }) => id);
const PICK = "2000000000000000001";
const UNPICKED = "2000000000000000002";
const BASE_PATH = "/scan-check";

let site = "";

const read = (file: string): Promise<string> => readFile(path.join(site, file), "utf8");

const scan = (id: string, extra: object) => ({
  id,
  url: `https://x.com/nhk_news/status/${id}`,
  author: { name: "NHK", handle: "nhk_news" },
  posted_at: "2026-10-19",
  saved_at: "2026-10-20T08:00:00+09:00",
  topic: "science",
  shelf_life: "evergreen",
  tldr: "白色矮星が緑色に光る理由がわかった",
  summary: "研究チームが、緑色に見える白色矮星の大気に炭素が多いことを示した。",
  text: "",
  key_points: [],
  action: "",
  links: [{ title: "論文", url: "https://example.org/paper" }],
  ...extra,
});

async function build(): Promise<void> {
  const { code, output } = await runCli(site, ["build"], { BASE_PATH });
  expect({ code, output }).toMatchObject({ code: 0 });
}

function cardOf(html: string, id: string): string {
  const start = html.indexOf(`<li id="b-${id}"`);
  if (start === -1) return "";
  const next = html.indexOf('<li id="b-', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

const VOID_ELEMENTS = new Set(["img", "br", "hr", "input", "meta", "link", "source", "wbr"]);

function topLevelElements(html: string): string[] {
  const elements: string[] = [];
  let depth = 0;
  for (const [tag = "", closing, name = ""] of html.matchAll(/<(\/?)([a-z][\w-]*)\b[^>]*>/gi)) {
    if (closing === "/") {
      depth -= 1;
      continue;
    }
    if (depth === 0) elements.push(tag);
    if (!VOID_ELEMENTS.has(name.toLowerCase()) && !tag.endsWith("/>")) depth += 1;
  }
  return elements;
}

function itemsOf(page: string, blockType: string): string[] {
  const block = new RegExp(`<section[^>]*data-block="${blockType}"[\\s\\S]*?</section>`).exec(page)?.[0] ?? "";
  return [...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(([, inner = ""]) => inner);
}

beforeEach(async () => {
  site = await linkedSite();
});

afterEach(async () => {
  await rm(site, { recursive: true, force: true });
});

describe("a site with scans", () => {
  it(
    "builds the same bookmarks page with an empty scans.json, or one without strong picks, as with none",
    async () => {
      await build();
      const without = await read("dist/index.html");
      await writeFile(path.join(site, "data/scans.json"), JSON.stringify([scan(UNPICKED, {})]));
      await build();
      expect(await read("dist/index.html")).toBe(without);
    },
    2 * BUILD_TIMEOUT_MS,
  );

  it(
    "shows a strong pick as a card with a Scan badge that can be marked done, swiped and removed, and in its topic feed",
    async () => {
      await writeFile(
        path.join(site, "data/scans.json"),
        JSON.stringify([scan(PICK, { pick: true }), scan(UNPICKED, { tldr: "Not picked" })]),
      );
      await build();
      const html = await read("dist/index.html");
      const card = cardOf(html, PICK);
      expect(card).toContain('data-source="scan"');
      expect(card).toContain('lang="ja"');
      expect(card).toContain("data-scan-badge");
      expect(card).toContain("Found ");
      for (const part of [
        "data-done-toggle",
        'data-swipe-action="done"',
        `data-url="https://x.com/nhk_news/status/${PICK}"`,
      ])
        expect(card).toContain(part);
      expect(html).not.toContain(UNPICKED);
      expect(cardOf(html, agents ?? "")).not.toContain("data-scan-badge");
      const feed = await read("dist/rss/science.xml");
      expect(feed).toContain(`#b-${PICK}`);
      expect(feed).toContain("<category>Scan</category>");
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "draws corners, grouped contents, item fields and a closer, and links a scan without a card to X",
    async () => {
      await writeFile(
        path.join(site, "data/scans.json"),
        JSON.stringify([scan(PICK, { pick: true }), scan(UNPICKED, { tldr: "A harbor map from 1890" })]),
      );
      await mkdir(path.join(site, "data/magazine"));
      await writeFile(
        path.join(site, "data/magazine/2026-10-20.json"),
        JSON.stringify({
          date: "2026-10-20",
          title: "緑の星",
          theme: { palette: "forest", fonts: "serif" },
          sections: [
            { type: "corner", corner: "lead" },
            { type: "feature", bookmark: agents, why: "It saves you a review round." },
            { type: "corner", corner: "open-window", deck: "Worth knowing." },
            {
              type: "brief-grid",
              headline: "Beyond the screen",
              items: [
                { scan: PICK, tags: ["new-to-you"], source_label: "NHK" },
                { bookmark: tokyo, tags: ["unverified"] },
              ],
            },
            { type: "corner", corner: "kicker", label: "おしまい" },
            { type: "closer", scan: UNPICKED, note: "One last look." },
          ],
        }),
      );
      await build();
      const page = await read("dist/magazine/2026-10-20/index.html");
      expect(page.match(/data-corner="/g)).toHaveLength(3);
      expect(page).toContain('data-corner="open-window"');
      expect(page).toMatch(/<span[^>]*lang="ja"[^>]*>おしまい<\/span>/);
      expect(page).toContain('lang="ja"');
      expect(page.match(/data-contents-group/g)).toHaveLength(3);
      expect(page).toMatch(/Why it matters:<\/span> It saves you a review round\./);
      expect(page).toContain('data-tag="new-to-you"');
      expect(page).toContain('data-tag="unverified"');
      expect(page).toMatch(/data-source-label[^>]*>NHK</);
      expect(page).toContain(`href="${BASE_PATH}/#b-${PICK}"`);
      expect(page).toMatch(
        new RegExp(`href="https://x.com/nhk_news/status/${UNPICKED}" target="_blank" rel="noopener noreferrer"`),
      );
      expect(page).toContain('data-block="closer"');
      expect(page).toContain("One last look.");
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "keeps every item's note, why, tags and source label in one wrapper, so a block's grid never splits them",
    async () => {
      const fields = {
        note: "A note.",
        why: "Why it matters here.",
        tags: ["unverified", "new-voice"],
        source_label: "NHK",
      };
      const items = [
        { scan: PICK, ...fields },
        { bookmark: tokyo, ...fields },
      ];
      await writeFile(path.join(site, "data/scans.json"), JSON.stringify([scan(PICK, { pick: true })]));
      await mkdir(path.join(site, "data/magazine"));
      await writeFile(
        path.join(site, "data/magazine/2026-10-20.json"),
        JSON.stringify({
          date: "2026-10-20",
          title: "Every block",
          theme: { palette: "forest", fonts: "serif" },
          sections: [
            { type: "numbered-list", headline: "Large", items },
            { type: "brief-grid", headline: "Grid", columns: 3, items },
            {
              type: "timeline",
              headline: "Timeline",
              items: items.map(({ note: _note, ...item }) => ({ ...item, note: "Then." })),
            },
            { type: "compare", headline: "Compare", items },
          ],
        }),
      );
      await build();
      const page = await read("dist/magazine/2026-10-20/index.html");
      for (const inner of itemsOf(page, "numbered-list")) {
        expect(topLevelElements(inner).map((tag) => /^<(\w+)/.exec(tag)?.[1])).toEqual(["span", "h4", "div"]);
        expect(topLevelElements(inner)[2]).toContain("data-item-note");
      }
      for (const blockType of ["brief-grid", "timeline"]) {
        for (const inner of itemsOf(page, blockType)) {
          expect(topLevelElements(inner).filter((tag) => tag.includes("data-item-note"))).toHaveLength(1);
          expect(topLevelElements(inner).some((tag) => /^<p\b/.test(tag) && !tag.includes("data-"))).toBe(false);
        }
      }
      for (const blockType of ["numbered-list", "brief-grid", "timeline", "compare"]) {
        const block = new RegExp(`data-block="${blockType}"[\\s\\S]*?</section>`).exec(page)?.[0] ?? "";
        expect(block.match(/data-item-note/g)).toHaveLength(2);
        expect(block.match(/data-item-meta/g)).toHaveLength(2);
        expect(block.match(/data-tag="unverified"/g)).toHaveLength(2);
      }
    },
    BUILD_TIMEOUT_MS,
  );
});
