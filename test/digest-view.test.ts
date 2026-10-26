import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import samples from "../template/data/bookmarks.json";
import { linkedSite, runCli } from "./linked-site.ts";

const BUILD_TIMEOUT_MS = 60_000;
const BASE_PATH = "/digest-check";
const ISSUE_URL = `https://example.github.io${BASE_PATH}/magazine/2026-10-19/`;
const [agents, tokyo, design] = samples.map(({ id }) => id);
const SCAN_ID = "2000000000000000001";
const SCAN_URL = `https://x.com/example_scan/status/${SCAN_ID}`;

let site = "";
let page = "";

beforeAll(async () => {
  site = await linkedSite();
  const [sample] = samples;
  await writeFile(
    path.join(site, "data/scans.json"),
    JSON.stringify([{ ...sample, id: SCAN_ID, url: SCAN_URL, tldr: "A scan with no card", pick: false }]),
  );
  await mkdir(path.join(site, "data/magazine"));
  await writeFile(
    path.join(site, "data/magazine/2026-10-19.json"),
    JSON.stringify({
      date: "2026-10-19",
      title: "Plans first",
      subtitle: "Agents that plan, and a meetup",
      theme: { palette: "forest", fonts: "serif" },
      sections: [
        { type: "cover-story", bookmark: agents, headline: "Plan, then wait", why: "It saves a rewrite" },
        { type: "topic-divider", topic: "design", label: "Decorative divider" },
        { type: "corner", corner: "open-window" },
        {
          type: "brief-grid",
          items: [
            { bookmark: tokyo, tags: ["new-to-you"], source_label: "Tokyo Dev Notes" },
            { scan: SCAN_ID, tags: ["unverified"] },
          ],
        },
        { type: "closer", bookmark: design, note: "A quiet end" },
      ],
    }),
  );
  const { code, output } = await runCli(site, ["build"], { BASE_PATH });
  if (code !== 0) throw new Error(`build failed:\n${output}`);
  page = await readFile(path.join(site, "dist/magazine/2026-10-19/index.html"), "utf8");
}, BUILD_TIMEOUT_MS);

afterAll(async () => {
  await rm(site, { recursive: true, force: true });
});

const digestPanel = (): string => page.split('data-view-panel="digest"')[1]?.split("</article>")[0] ?? "";

const textOf = (html: string): string =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();

class FakeElement {
  constructor(readonly dataset: Record<string, string>) {}
  attributes = new Map<string, string>();
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  closest(): FakeElement {
    return this;
  }
}

type Browser = {
  view: () => string | undefined;
  address: () => string;
  current: (view: string) => string | undefined;
  tap: (view: string, modifiers?: { metaKey?: boolean }) => boolean;
};

function openIssue(address: string, storage: Map<string, string>): Browser {
  const script = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(([, code]) => code ?? "")
    .find((code) => code.includes("data-view-link"));
  if (script === undefined) throw new Error("the issue page has no view script");
  const root = { dataset: {} as Record<string, string> };
  const links = ["magazine", "digest"].map((view) => new FakeElement({ viewLink: view }));
  let location = new URL(address);
  let onClick: ((event: object) => void) | undefined;
  const window = {
    get location() {
      return location;
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: URL) => (location = new URL(url)),
    },
  };
  const document = {
    documentElement: root,
    querySelectorAll: () => links,
    addEventListener: (_type: string, listener: (event: object) => void) => (onClick = listener),
  };
  runInNewContext(script, { window, document, Element: FakeElement, URL, URLSearchParams, JSON, String });
  return {
    view: () => root.dataset.issueView,
    address: () => location.href,
    current: (view) => links.find((link) => link.dataset.viewLink === view)?.attributes.get("aria-current"),
    tap: (view, modifiers = {}) => {
      let prevented = false;
      const target = links.find((link) => link.dataset.viewLink === view);
      onClick?.({ target, button: 0, ...modifiers, preventDefault: () => (prevented = true) });
      return prevented;
    },
  };
}

describe("an issue page's digest view", () => {
  it("offers Magazine and Digest links that work as plain anchors", () => {
    const toggle = /<nav aria-label="Issue view"[\s\S]*?<\/nav>/.exec(page)?.[0] ?? "";
    expect(textOf(toggle)).toBe("Magazine Digest");
    expect(toggle).toContain('href="#magazine"');
    expect(toggle).toContain('href="#digest"');
    expect(page).toMatch(/id="digest"/);
  });

  it("lists every post once under its corner, with its why line or a fallback, tags, source and links", () => {
    const digest = digestPanel();
    const text = textOf(digest);
    expect(text).toContain("Agents that plan, and a meetup");
    expect(text).not.toContain("Decorative divider");
    expect(text.indexOf("Plan, then wait")).toBeLessThan(text.indexOf("Open Window"));
    expect(text.indexOf("Open Window")).toBeLessThan(text.indexOf("サンプル: a Tokyo meetup"));
    expect(text).toContain("Why it matters: It saves a rewrite");
    expect(text).toContain("A quiet end");
    expect(text).toContain("A scan with no card");
    expect(text).toContain("Tokyo Dev Notes");
    expect(digest).toContain('data-tag="new-to-you"');
    expect(digest).toContain('data-tag="unverified"');
    expect(digest.match(/data-digest-item/g)).toHaveLength(4);
    expect(digest).toContain(`href="${BASE_PATH}/#b-${agents}"`);
    expect(digest.match(new RegExp(`href="${SCAN_URL}"`, "g"))).toHaveLength(2);
    expect(digest).not.toContain(`#b-${SCAN_ID}`);
  });

  it("opens the magazine by default, and the digest from ?view=digest or #digest", () => {
    expect(openIssue(ISSUE_URL, new Map()).view()).toBe("magazine");
    expect(openIssue(`${ISSUE_URL}?view=digest`, new Map()).view()).toBe("digest");
    const hashed = openIssue(`${ISSUE_URL}#digest`, new Map());
    expect(hashed.view()).toBe("digest");
    expect(hashed.current("digest")).toBe("true");
    expect(hashed.current("magazine")).toBe("false");
  });

  it("remembers the chosen view for the next issue, while a link still opens the view it names", () => {
    const storage = new Map<string, string>();
    const first = openIssue(ISSUE_URL, storage);
    expect(first.tap("digest")).toBe(true);
    expect(first.view()).toBe("digest");
    expect(first.address()).toBe(`${ISSUE_URL}?view=digest`);

    expect(openIssue(ISSUE_URL, storage).view()).toBe("digest");
    expect(openIssue(`${ISSUE_URL}?view=magazine`, storage).view()).toBe("magazine");

    const back = openIssue(`${ISSUE_URL}#digest`, storage);
    back.tap("magazine");
    expect(back.view()).toBe("magazine");
    expect(back.address()).toBe(ISSUE_URL);
    expect(openIssue(ISSUE_URL, storage).view()).toBe("magazine");
  });

  it("leaves a modified click, such as opening in a new tab, to the browser", () => {
    const storage = new Map<string, string>();
    const browser = openIssue(ISSUE_URL, storage);
    expect(browser.tap("digest", { metaKey: true })).toBe(false);
    expect(browser.view()).toBe("magazine");
    expect(openIssue(ISSUE_URL, storage).view()).toBe("magazine");
  });

  it("opens without stored choices when storage is unavailable", () => {
    const broken = new Map<string, string>();
    broken.get = () => {
      throw new Error("storage is blocked");
    };
    expect(openIssue(ISSUE_URL, broken).view()).toBe("magazine");
  });
});
