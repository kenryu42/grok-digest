import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import samples from "../template/data/bookmarks.json";

const REPOSITORY = path.resolve(".");
const CLI = path.join(REPOSITORY, "src/cli.ts");
const LOCAL_ADDRESS = /Local\s+(http:\/\/\S+?)\/?\s/;
const THREAD_ID = "3000000000000000001";
const THREAD_TEXT = [
  "Post one: we rebuilt the dashboard.",
  "",
  "It took a month. https://t.co/Aaaaaaaaa1",
  "",
  "Post two has no photo.",
  "",
  "Post three shows the new chart. https://t.co/Bbbbbbbbb2",
  "",
  "Post four is text only.",
  "",
  "Post five: before and after.",
  "https://t.co/Ccccccccc3",
].join("\n");
const PHOTOS = [
  { url: "https://pbs.twimg.com/media/GaBcDeFgHi1.jpg", alt: "The old dashboard", link: "https://t.co/Aaaaaaaaa1" },
  { url: "https://pbs.twimg.com/media/GaBcDeFgHi2.jpg", link: "https://t.co/Aaaaaaaaa1" },
  { url: "https://pbs.twimg.com/media/GaBcDeFgHi3.jpg", alt: "The new chart", link: "https://t.co/Bbbbbbbbb2" },
  { url: "https://pbs.twimg.com/media/GaBcDeFgHi4.jpg", alt: "Before and after", link: "https://t.co/Ccccccccc3" },
];

let site = "";
let server: ChildProcess | undefined;
let origin = "";
let serverOutput = "";

const localUrlsIn = (text: string): string[] =>
  [...text.matchAll(/(?:href|src|component-url|renderer-url)="(\/[^"]*)"|url\(\s*["']?(\/[^"')]+)/g)].map(
    ([, attribute, cssUrl]) => attribute ?? cssUrl ?? "",
  );

const quotedPostIn = (card: string) =>
  [
    ...(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/.exec(card)?.[1] ?? "").matchAll(
      /<p[^>]*>([\s\S]*?)<\/p>|<img\b[^>]*>/g,
    ),
  ].map(([tag, text]) => text ?? /\ssrc="([^"]*)"/.exec(tag)?.[1]);

const imagesOn = (card: string) =>
  [...card.matchAll(/<img\b[^>]*>/g)].map(([tag]) => ({
    src: /\ssrc="([^"]*)"/.exec(tag)?.[1],
    alt: /\salt="([^"]*)"/.exec(tag)?.[1],
    lazy: /\sloading="lazy"/.test(tag),
  }));

async function siteWithLinkedPackages(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "grok-digest-dev-"));
  await cp(path.resolve("template/data"), path.join(root, "data"), { recursive: true });
  const thread = {
    ...samples[0],
    id: THREAD_ID,
    url: `https://x.com/example/status/${THREAD_ID}`,
    text: THREAD_TEXT,
    media: PHOTOS,
  };
  await writeFile(path.join(root, "data/bookmarks.json"), JSON.stringify([...samples, thread]));
  await cp(path.resolve("template/package.json"), path.join(root, "package.json"));
  await mkdir(path.join(root, "node_modules"));
  await symlink(REPOSITORY, path.join(root, "node_modules/grok-digest"));
  await symlink(path.join(REPOSITORY, "node_modules/astro"), path.join(root, "node_modules/astro"));
  return root;
}

async function startDevServer(cwd: string): Promise<{ child: ChildProcess; address: string }> {
  const { VITEST: _vitest, ...env } = process.env;
  const child = spawn(process.execPath, [CLI, "dev"], { cwd, env: { ...env, NO_COLOR: "1" } });
  const address = new Promise<string>((resolve, reject) => {
    const collect = (chunk: Buffer): void => {
      serverOutput += chunk.toString();
      const match = LOCAL_ADDRESS.exec(serverOutput);
      if (match?.[1] !== undefined) resolve(match[1]);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("exit", (code) => reject(new Error(`dev exited with ${code}:\n${serverOutput}`)));
  });
  return { child, address: await address };
}

beforeAll(async () => {
  site = await siteWithLinkedPackages();
  const started = await startDevServer(site);
  server = started.child;
  origin = started.address;
}, 60_000);

afterAll(async () => {
  if (server !== undefined && server.exitCode === null) {
    server.kill();
    await once(server, "exit");
  }
  await rm(site, { recursive: true, force: true });
});

describe("dev", () => {
  it("serves every script, style and font the page needs when the package is linked from outside the site", async () => {
    const seen = new Set<string>();
    const failures: string[] = [];
    const crawl = async (urls: string[]): Promise<void> => {
      const unseen = [...new Set(urls)].filter((url) => !seen.has(url));
      for (const url of unseen) seen.add(url);
      const linked = await Promise.all(
        unseen.map(async (url) => {
          const response = await fetch(new URL(url, origin));
          if (!response.ok) failures.push(`${response.status} ${url}`);
          const text = await response.text();
          return /html|css/.test(response.headers.get("content-type") ?? "") ? localUrlsIn(text) : [];
        }),
      );
      if (linked.flat().length > 0) await crawl(linked.flat());
    };
    await crawl(["/"]);
    expect(seen.size).toBeGreaterThan(1);
    expect(failures).toEqual([]);
    expect(serverOutput).not.toContain("outside of Vite serving allow list");
  }, 60_000);

  it("shows each image under the post it came from, in place of its short link", async () => {
    const page = await (await fetch(origin)).text();
    const cards = page.split('<li id="b-').slice(1);
    const threadCard = cards.find((card) => card.startsWith(THREAD_ID)) ?? "";
    expect(quotedPostIn(threadCard)).toEqual([
      "Post one: we rebuilt the dashboard.\n\nIt took a month.",
      PHOTOS[0]?.url,
      PHOTOS[1]?.url,
      "Post two has no photo.\n\nPost three shows the new chart.",
      PHOTOS[2]?.url,
      "Post four is text only.\n\nPost five: before and after.",
      PHOTOS[3]?.url,
    ]);
    expect(/<figure[\s\S]*?<\/figure>/.exec(threadCard)?.[0]).not.toContain("t.co/");
    expect(imagesOn(threadCard).slice(0, 2)).toEqual([
      { src: PHOTOS[0]?.url, alt: "The old dashboard", lazy: true },
      { src: PHOTOS[1]?.url, alt: "Image 2 of 4 from the post by @example_agents", lazy: true },
    ]);
  });

  it("shows no images on cards without any", async () => {
    const page = await (await fetch(origin)).text();
    const otherCards = page
      .split('<li id="b-')
      .slice(1)
      .filter((card) => !card.startsWith(THREAD_ID));
    expect(otherCards.length).toBeGreaterThan(0);
    expect(otherCards.flatMap(imagesOn)).toEqual([]);
  });
});
