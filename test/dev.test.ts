import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPOSITORY = path.resolve(".");
const CLI = path.join(REPOSITORY, "src/cli.ts");
const LOCAL_ADDRESS = /Local\s+(http:\/\/\S+?)\/?\s/;

let site = "";
let server: ChildProcess | undefined;
let origin = "";
let serverOutput = "";

const localUrlsIn = (text: string): string[] =>
  [...text.matchAll(/(?:href|src|component-url|renderer-url)="(\/[^"]*)"|url\(\s*["']?(\/[^"')]+)/g)].map(
    ([, attribute, cssUrl]) => attribute ?? cssUrl ?? "",
  );

async function siteWithLinkedPackages(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "grok-digest-dev-"));
  await cp(path.resolve("template/data"), path.join(root, "data"), { recursive: true });
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
});
