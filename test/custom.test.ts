import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { componentFile, OVERRIDABLE_COMPONENTS } from "../src/lib/custom.ts";
import { CLI, linkedSite, startDevServer, stop } from "./linked-site.ts";

const BUILD_TIMEOUT_MS = 60_000;
const DEPENDENCY_OPTIMIZING_MS = 20_000;
const ISLAND_URL = /(?:component-url|renderer-url)="([^"]+)"/g;
const LOCAL_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\/[^"']+)["']/g;

let site = "";

async function run(...args: string[]): Promise<{ code: number | null; output: string }> {
  const { VITEST: _vitest, ...env } = process.env;
  const child = spawn(process.execPath, [CLI, ...args], { cwd: site, env: { ...env, NO_COLOR: "1" } });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  await once(child, "exit");
  return { code: child.exitCode, output };
}

async function build(): Promise<string> {
  const { code, output } = await run("build");
  expect({ code, output }).toMatchObject({ code: 0 });
  return output;
}

const sitePath = (file: string): string => path.join(site, file);
const read = (file: string): Promise<string> => readFile(sitePath(file), "utf8");

async function write(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(sitePath(file)), { recursive: true });
  await writeFile(sitePath(file), text);
}

async function builtHeader(): Promise<string> {
  return /<header[\s\S]*?<\/header>/.exec(await read("dist/index.html"))?.[0] ?? "";
}

async function builtCss(): Promise<string> {
  const files = (await readdir(sitePath("dist/_astro"))).filter((name) => name.endsWith(".css"));
  const texts = await Promise.all(files.map((name) => read(`dist/_astro/${name}`)));
  return texts.join("\n");
}

const withoutBuildHashes = (html: string): string =>
  html.replaceAll(/\/_astro\/[^"]+/g, "/_astro/*").replaceAll(/\suid="[^"]*"/g, "");

async function islandFilesMissing(): Promise<string[]> {
  const html = await read("dist/index.html");
  const urls = [...html.matchAll(/(?:component-url|renderer-url)="([^"]+)"/g)].map(([, url]) => url ?? "");
  const present = await Promise.all(urls.map((url) => readFile(sitePath(`dist${url}`)).then(Boolean, () => false)));
  return urls.filter((_, index) => !present[index]);
}

async function crawlScripts(origin: string, entries: string[]): Promise<{ served: Set<string>; failures: string[] }> {
  const served = new Set<string>();
  const failures: string[] = [];
  const visit = async (urls: string[]): Promise<void> => {
    const unseen = [...new Set(urls)].filter((url) => !served.has(url));
    for (const url of unseen) served.add(url);
    const imported = await Promise.all(
      unseen.map(async (url) => {
        const response = await fetch(new URL(url, origin));
        if (!response.ok) failures.push(`${response.status} ${url}`);
        return [...(await response.text()).matchAll(LOCAL_IMPORT)].map(([, specifier]) => specifier ?? "");
      }),
    );
    if (imported.flat().length > 0) await visit(imported.flat());
  };
  await visit(entries);
  return { served, failures };
}

beforeEach(async () => {
  site = await linkedSite();
});

afterEach(async () => {
  await rm(site, { recursive: true, force: true });
});

describe("custom/config.json", () => {
  it(
    "names the site in the page title, the header and the home screen app",
    async () => {
      await write("custom/config.json", JSON.stringify({ title: "Reading Room" }));
      await build();
      const html = await read("dist/index.html");
      expect(html).toContain("<title>Reading Room</title>");
      expect(html).toMatch(/<h1[^>]*>Reading Room<\/h1>/);
      expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Reading Room">');
      expect(JSON.parse(await read("dist/manifest.webmanifest"))).toMatchObject({
        name: "Reading Room",
        short_name: "Reading Room",
      });
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "puts the Swipe button in the header unless swipeMode is false",
    async () => {
      await build();
      expect(await builtHeader()).toContain('aria-label="Swipe through cards"');
      await write("custom/config.json", JSON.stringify({ swipeMode: false }));
      await build();
      expect(await builtHeader()).not.toContain("Swipe through cards");
    },
    2 * BUILD_TIMEOUT_MS,
  );

  it(
    "fails validate and the build on a setting the page does not know, naming it",
    async () => {
      await write("custom/config.json", JSON.stringify({ title: "Reading Room", defualtView: "all" }));
      const validate = await run("validate");
      expect(validate.code).toBe(1);
      expect(validate.output).toContain("custom/config.json is invalid");
      expect(validate.output).toContain("defualtView");
      const built = await run("build");
      expect(built.code).not.toBe(0);
      expect(built.output).toContain("defualtView");
    },
    BUILD_TIMEOUT_MS,
  );

  it("is reported by validate with the number of settings it changes", async () => {
    await write("custom/config.json", JSON.stringify({ title: "Reading Room", swipeMode: false }));
    const { code, output } = await run("validate");
    expect(code).toBe(0);
    expect(output).toContain("✓ custom/config.json: 2 settings changed from the defaults");
  });
});

describe("custom/theme.css", () => {
  it(
    "loads after the default theme, so its colors win",
    async () => {
      await write("custom/theme.css", ":root { --brand: rgb(1 2 3); }\n");
      await build();
      const css = await builtCss();
      const brands = [...css.matchAll(/--brand:([^;}]+)/g)].map(([, value]) => value);
      expect(brands.at(-1)).toBe("#010203");
      expect(brands.length).toBeGreaterThan(1);
    },
    BUILD_TIMEOUT_MS,
  );
});

describe("custom/components", () => {
  it(
    "replaces a component, with styles for the Tailwind classes it uses",
    async () => {
      await write("custom/components/Footer.astro", '<footer class="bg-lime-300">My own footer</footer>\n');
      await build();
      const html = await read("dist/index.html");
      expect(html).toContain('<footer class="bg-lime-300">My own footer</footer>');
      expect(html).not.toContain("Unofficial. Summaries created with Grok.");
      expect(await builtCss()).toContain(".bg-lime-300");
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "builds the same page after every component is ejected",
    async () => {
      await build();
      const before = await read("dist/index.html");
      const ejected = await Promise.all(OVERRIDABLE_COMPONENTS.map((name) => run("eject", name)));
      expect(ejected.map(({ output }) => output.trim())).toEqual(
        OVERRIDABLE_COMPONENTS.map(
          (name) => `✓ Copied ${name} to custom/components/${componentFile(name)}. Edit that file to change it.`,
        ),
      );
      const output = await build();
      expect(output).not.toContain("ejected from an older");
      expect(withoutBuildHashes(await read("dist/index.html"))).toBe(withoutBuildHashes(before));
      expect(await islandFilesMissing()).toEqual([]);
    },
    BUILD_TIMEOUT_MS * 2,
  );

  it(
    "serves ejected components in dev, importing what the package depends on",
    async () => {
      await Promise.all(OVERRIDABLE_COMPONENTS.map((name) => run("eject", name)));
      const dev = await startDevServer(site);
      try {
        const response = await fetch(dev.address);
        const page = await response.text();
        expect(response.status).toBe(200);
        expect(page).toContain('<li id="b-');
        expect(page).toContain("Unofficial. Summaries created with Grok.");
        const islands = [...page.matchAll(ISLAND_URL)].map(([, url]) => url ?? "");
        const scripts = await vi.waitFor(
          async () => {
            const crawled = await crawlScripts(dev.address, islands);
            expect(crawled.failures).toEqual([]);
            return crawled;
          },
          { timeout: DEPENDENCY_OPTIMIZING_MS, interval: 500 },
        );
        expect([...scripts.served].filter((url) => url.includes("/custom/components/"))).toHaveLength(
          OVERRIDABLE_COMPONENTS.filter((name) => componentFile(name).endsWith(".tsx")).length,
        );
        expect(dev.output()).not.toContain("[ERROR]");
      } finally {
        await stop(dev.child);
      }
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "puts an edited control part in the page's script in place of the default",
    async () => {
      await run("eject", "StatusLine");
      const part = await read("custom/components/StatusLine.tsx");
      expect(part).toContain("Inbox zero. Everything is done.");
      await write(
        "custom/components/StatusLine.tsx",
        part.replace("Inbox zero. Everything is done.", "Nothing left to read!"),
      );
      await build();
      const scripts = await Promise.all(
        (await readdir(sitePath("dist/_astro")))
          .filter((name) => name.endsWith(".js"))
          .map((name) => read(`dist/_astro/${name}`)),
      );
      expect(scripts.some((script) => script.includes("Nothing left to read!"))).toBe(true);
      expect(scripts.some((script) => script.includes("Inbox zero. Everything is done."))).toBe(false);
    },
    BUILD_TIMEOUT_MS,
  );

  it("refuses to eject over an existing override or a component it does not know", async () => {
    await write("custom/components/Header.astro", "<header>Mine</header>\n");
    const existing = await run("eject", "Header");
    expect(existing.code).toBe(1);
    expect(existing.output).toContain("custom/components/Header.astro already exists.");
    expect(await read("custom/components/Header.astro")).toBe("<header>Mine</header>\n");
    const unknown = await run("eject", "Sidebar");
    expect(unknown.code).toBe(1);
    expect(unknown.output).toContain(
      `"Sidebar" is not a component you can eject. Components: ${OVERRIDABLE_COMPONENTS.join(", ")}.`,
    );
  });
});

describe("merge", () => {
  const OLD_GAP = "justify-between gap-2";
  const NEW_GAP = "justify-between gap-4";
  const OWNER_CHANGE = '<h1 class="text-lime-700 ';

  async function ejectHeaderFromOlderRelease(): Promise<void> {
    await run("eject", "Header");
    await Promise.all(
      ["custom/components/.ejected/Header.astro", "custom/components/Header.astro"].map(async (file) => {
        const text = await read(file);
        expect(text).toContain(NEW_GAP);
        await write(file, text.replace(NEW_GAP, OLD_GAP));
      }),
    );
    const owned = await read("custom/components/Header.astro");
    await write("custom/components/Header.astro", owned.replace('<h1 class="', OWNER_CHANGE));
  }

  it(
    "brings a newer default into an ejected component and keeps the owner's change",
    async () => {
      await ejectHeaderFromOlderRelease();
      expect(await build()).toContain(
        'custom/components/Header.astro was ejected from an older Header. Run "grok-digest merge" to bring in the new default.',
      );

      const { code, output } = await run("merge");
      expect({ code, output }).toMatchObject({ code: 0 });
      expect(output).toContain("✓ custom/components/Header.astro: merged");
      const merged = await read("custom/components/Header.astro");
      expect(merged).toContain(NEW_GAP);
      expect(merged).toContain(OWNER_CHANGE);

      expect(await build()).not.toContain("ejected from an older");
      expect((await run("merge")).output).toContain("✓ custom/components/Header.astro: up to date");
    },
    BUILD_TIMEOUT_MS * 2,
  );

  it(
    "stops on a change that conflicts with the new default, and the build refuses the file until it is resolved",
    async () => {
      await ejectHeaderFromOlderRelease();
      const owned = await read("custom/components/Header.astro");
      await write("custom/components/Header.astro", owned.replace(OLD_GAP, "justify-between gap-8"));

      const { code, output } = await run("merge");
      expect(code).toBe(1);
      expect(output).toContain(
        "✖ custom/components/Header.astro: 1 conflicting change. Resolve each <<<<<<< block, then build.",
      );
      expect(await read("custom/components/Header.astro")).toMatch(/^<{7} your change$/m);

      const built = await run("build");
      expect(built.code).not.toBe(0);
      expect(built.output).toContain("custom/components/Header.astro still has merge conflicts.");
    },
    BUILD_TIMEOUT_MS,
  );
});
