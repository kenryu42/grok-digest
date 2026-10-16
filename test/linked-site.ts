import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const REPOSITORY = path.resolve(".");

export const CLI = path.join(REPOSITORY, "src/cli.ts");
const LOCAL_ADDRESS = /Local\s+(http:\/\/\S+?)\/?\s/;

export async function linkedSite(bookmarks?: readonly unknown[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "grok-digest-site-"));
  await cp(path.resolve("template/data"), path.join(root, "data"), { recursive: true });
  if (bookmarks !== undefined) await writeFile(path.join(root, "data/bookmarks.json"), JSON.stringify(bookmarks));
  await cp(path.resolve("template/package.json"), path.join(root, "package.json"));
  await mkdir(path.join(root, "node_modules"));
  await symlink(REPOSITORY, path.join(root, "node_modules/grok-digest"));
  await symlink(path.join(REPOSITORY, "node_modules/astro"), path.join(root, "node_modules/astro"));
  return root;
}

export async function startDevServer(
  cwd: string,
  args: string[] = [],
): Promise<{ child: ChildProcess; address: string; output: () => string }> {
  const { VITEST: _vitest, ...env } = process.env;
  const child = spawn(process.execPath, [CLI, "dev", ...args], { cwd, env: { ...env, NO_COLOR: "1" } });
  let output = "";
  const address = new Promise<string>((resolve, reject) => {
    const collect = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = LOCAL_ADDRESS.exec(output);
      if (match?.[1] !== undefined) resolve(match[1]);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("exit", (code) => reject(new Error(`dev exited with ${code}:\n${output}`)));
  });
  return { child, address: await address, output: () => output };
}

export async function stop(child: ChildProcess | undefined): Promise<void> {
  if (child === undefined || child.exitCode !== null) return;
  child.kill();
  await once(child, "exit");
}
