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
const PHOTO_POST_ID = "3000000000000000001";
const PHOTOS = [
  { url: "https://pbs.twimg.com/media/GaBcDeFgHiJ.jpg", alt: "A terminal running the CLI" },
  { url: "https://pbs.twimg.com/media/KlMnOpQrStU.jpg" },
];

let site = "";
let server: ChildProcess | undefined;
let origin = "";
let serverOutput = "";

const localUrlsIn = (text: string): string[] =>
  [...text.matchAll(/(?:href|src|component-url|renderer-url)="(\/[^"]*)"|url\(\s*["']?(\/[^"')]+)/g)].map(
    ([, attribute, cssUrl]) => attribute ?? cssUrl ?? "",
  );

const imagesOn = (card: string) =>
  [...card.matchAll(/<img\b[^>]*>/g)].map(([tag]) => ({
    src: /\ssrc="([^"]*)"/.exec(tag)?.[1],
    alt: /\salt="([^"]*)"/.exec(tag)?.[1],
    lazy: /\sloading="lazy"/.test(tag),
  }));

async function siteWithLinkedPackages(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "grok-digest-dev-"));
  await cp(path.resolve("template/data"), path.join(root, "data"), { recursive: true });
  const photoPost = {
    ...samples[0],
    id: PHOTO_POST_ID,
    url: `https://x.com/example/status/${PHOTO_POST_ID}`,
    media: PHOTOS,
  };
  await writeFile(path.join(root, "data/bookmarks.json"), JSON.stringify([...samples, photoPost]));
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

  it("shows a post's images on its card, lazily, and no images on cards without any", async () => {
    const page = await (await fetch(origin)).text();
    const cards = page.split('<li id="b-').slice(1);
    const photoCard = cards.find((card) => card.startsWith(PHOTO_POST_ID));
    const otherCards = cards.filter((card) => !card.startsWith(PHOTO_POST_ID));
    expect(imagesOn(photoCard ?? "")).toEqual([
      { src: PHOTOS[0]?.url, alt: "A terminal running the CLI", lazy: true },
      { src: PHOTOS[1]?.url, alt: "Image 2 of 2 from the post by @example_agents", lazy: true },
    ]);
    expect(otherCards.length).toBeGreaterThan(0);
    expect(otherCards.flatMap(imagesOn)).toEqual([]);
  });
});
