import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  componentFile,
  COMPONENTS_DIR,
  CUSTOM_DIR,
  EJECTED_DIR,
  OVERRIDABLE_COMPONENTS,
  type OverridableComponent,
} from "./custom.ts";

export const MODULE_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const INTERNAL_PREFIX = "grok-digest/internal/";

const RELATIVE_IMPORT = /(\b(?:from|import)\s*)(["'])(\.{1,2}\/[^"']+)\2/g;
const FRONTMATTER_END = "\n---";
const SCRIPT_EXTENSION = /\.tsx?$/;
const GIT_MERGE_FILE_ERROR = 128;
const CONFLICT_MARKER = /^<{7}(?: |$)/m;

const sourceComponentFile = (name: OverridableComponent): string =>
  path.join(MODULE_ROOT, COMPONENTS_DIR, componentFile(name));

export function defaultComponentFile(name: OverridableComponent): string {
  const compiled = path.join(MODULE_ROOT, COMPONENTS_DIR, `${name}.js`);
  return existsSync(compiled) ? compiled : sourceComponentFile(name);
}

export const overrideFile = (root: string, name: OverridableComponent): string =>
  path.join(root, CUSTOM_DIR, COMPONENTS_DIR, componentFile(name));

const ejectedBaseFile = (root: string, name: OverridableComponent): string =>
  path.join(root, CUSTOM_DIR, COMPONENTS_DIR, EJECTED_DIR, componentFile(name));

export const displayPath = (root: string, file: string): string => path.relative(root, file).split(path.sep).join("/");

const withPackageImports = (code: string): string =>
  code.replaceAll(
    RELATIVE_IMPORT,
    (_match, keyword: string, quote: string, specifier: string) =>
      `${keyword}${quote}${INTERNAL_PREFIX}${path.posix.join(COMPONENTS_DIR, specifier).replace(SCRIPT_EXTENSION, "")}${quote}`,
  );

function importsEjected(file: string, source: string): string {
  if (!file.endsWith(".astro")) return withPackageImports(source);
  const end = source.indexOf(FRONTMATTER_END, 3);
  return `${withPackageImports(source.slice(0, end))}${source.slice(end)}`;
}

async function ejectedDefault(name: OverridableComponent): Promise<string> {
  const file = sourceComponentFile(name);
  return importsEjected(file, await readFile(file, "utf8"));
}

export async function ejectComponent({ root, name }: { root: string; name: OverridableComponent }): Promise<string> {
  const target = overrideFile(root, name);
  if (existsSync(target)) throw new Error(`${displayPath(root, target)} already exists.`);
  const source = await ejectedDefault(name);
  const base = ejectedBaseFile(root, name);
  await mkdir(path.dirname(base), { recursive: true });
  await writeFile(base, source);
  await writeFile(target, source);
  return target;
}

function ejectedOverrides(root: string): OverridableComponent[] {
  return OVERRIDABLE_COMPONENTS.filter(
    (name) => existsSync(overrideFile(root, name)) && existsSync(ejectedBaseFile(root, name)),
  );
}

export async function staleOverrides(root: string): Promise<OverridableComponent[]> {
  const ejected = ejectedOverrides(root);
  const stale = await Promise.all(
    ejected.map(async (name) => (await readFile(ejectedBaseFile(root, name), "utf8")) !== (await ejectedDefault(name))),
  );
  return ejected.filter((_, index) => stale[index]);
}

export async function conflictedOverrides(root: string): Promise<string[]> {
  const present = OVERRIDABLE_COMPONENTS.map((name) => overrideFile(root, name)).filter((file) => existsSync(file));
  const conflicted = await Promise.all(present.map(async (file) => CONFLICT_MARKER.test(await readFile(file, "utf8"))));
  return present.filter((_, index) => conflicted[index]).map((file) => displayPath(root, file));
}

export type MergeReport =
  | { name: OverridableComponent; file: string; outcome: "up to date" | "merged" }
  | { name: OverridableComponent; file: string; outcome: "conflicts"; conflicts: number };

function mergeFile({ file, base, latest }: { file: string; base: string; latest: string }): number {
  const result = spawnSync(
    "git",
    ["merge-file", "-L", "your change", "-L", "the default you ejected", "-L", "the new default", file, base, latest],
    { encoding: "utf8" },
  );
  if (result.error !== undefined) throw new Error(`Could not run git merge-file: ${result.error.message}`);
  if (result.status === null || result.status >= GIT_MERGE_FILE_ERROR) {
    throw new Error(`git merge-file failed on ${file}: ${result.stderr.trim()}`);
  }
  return result.status;
}

async function mergeOverride(root: string, name: OverridableComponent, scratch: string): Promise<MergeReport> {
  const file = overrideFile(root, name);
  const base = ejectedBaseFile(root, name);
  const shown = displayPath(root, file);
  const latest = await ejectedDefault(name);
  if ((await readFile(base, "utf8")) === latest) return { name, file: shown, outcome: "up to date" };
  const latestFile = path.join(scratch, componentFile(name));
  await writeFile(latestFile, latest);
  const conflicts = mergeFile({ file, base, latest: latestFile });
  await writeFile(base, latest);
  return conflicts === 0
    ? { name, file: shown, outcome: "merged" }
    : { name, file: shown, outcome: "conflicts", conflicts };
}

export async function mergeOverrides(root: string): Promise<MergeReport[]> {
  const scratch = await mkdtemp(path.join(tmpdir(), "grok-digest-merge-"));
  try {
    return await Promise.all(ejectedOverrides(root).map((name) => mergeOverride(root, name, scratch)));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
