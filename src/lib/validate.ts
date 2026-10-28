import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  bookmarksFileSchema,
  parseBookmarks,
  parseDataFile,
  parseScans,
  scansFileSchema,
  stateFileSchema,
  type Bookmark,
  type Scan,
} from "./bookmarks.ts";
import { CONFIG_FILE, CUSTOM_DIR, siteConfigSchema } from "./custom.ts";
import {
  BOOKMARKS_FILE,
  fileExists,
  firstFileIn,
  jsonFilesIn,
  readJsonFile,
  SCANS_FILE,
  STATE_FILES,
} from "./data-files.ts";
import { readFile } from "node:fs/promises";
import { imageMetadata } from "astro/assets/utils";
import {
  artFileName,
  artRule,
  coverFileNames,
  isIssueFileName,
  MAGAZINE_DIR,
  parseMagazineIssue,
  PICTURE_EXTENSIONS,
  showsOnlyArt,
  type MagazineBlock,
  type MagazineIssue,
} from "./magazine.ts";
import { issueWarnings, type IssueWarning } from "./magazine-check.ts";

type FileReport =
  | { source: string; ok: true; summary: string; warnings?: string[] }
  | { source: string; ok: false; error: string };

const EARLIEST_TIME_ZONE_OFFSET_MS = 14 * 60 * 60 * 1000;

const isStateFile = (file: string): boolean => STATE_FILES.some((name) => path.basename(file) === name);
const isConfigFile = (file: string): boolean => path.basename(file) === CONFIG_FILE;
const isScansFile = (file: string): boolean => path.basename(file) === SCANS_FILE;
const isMagazineFile = (file: string): boolean =>
  path.basename(path.dirname(file)) === MAGAZINE_DIR &&
  path.basename(file) !== BOOKMARKS_FILE &&
  !isScansFile(file) &&
  !isStateFile(file);
const toSource = (file: string): string => file.split(path.sep).join("/");
const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;
const CONFIG_PATH = path.join(CUSTOM_DIR, CONFIG_FILE);
const DEFAULT_SETTINGS = new Map(Object.entries(siteConfigSchema.parse({})));

const changedSettings = (config: object): number =>
  Object.entries(config).filter(([key, value]) => !isDeepStrictEqual(value, DEFAULT_SETTINGS.get(key))).length;

const fieldPath = (keys: readonly (string | number)[]): string =>
  keys.map((key, index) => (typeof key === "number" ? `[${key}]` : index === 0 ? key : `.${key}`)).join("");

const warningLine = ({ path: keys, message }: IssueWarning): string =>
  keys.length === 0 ? message : `${message}\n  → at ${fieldPath(keys)}`;

const latestDateOnEarth = (now: Date): string =>
  new Date(now.getTime() + EARLIEST_TIME_ZONE_OFFSET_MS).toISOString().slice(0, 10);

export async function defaultDataFiles({ cwd, dataDir }: { cwd: string; dataDir: string }): Promise<string[]> {
  const optional = [...[SCANS_FILE, ...STATE_FILES].map((name) => path.join(dataDir, name)), CONFIG_PATH];
  const present = await Promise.all(optional.map((file) => fileExists(path.resolve(cwd, file))));
  const magazineDir = path.join(dataDir, MAGAZINE_DIR);
  const magazineFiles = (await jsonFilesIn(path.resolve(cwd, magazineDir))).map((file) =>
    path.join(magazineDir, path.basename(file)),
  );
  return [path.join(dataDir, BOOKMARKS_FILE), ...optional.filter((_, index) => present[index]), ...magazineFiles];
}

type Loader<Entry> = (file: string) => Promise<Entry[]>;

function loader<Entry>(
  cwd: string,
  parse: (file: { raw: unknown; source: string }) => Entry[],
  { optional }: { optional: boolean },
): Loader<Entry> {
  const loaded = new Map<string, Promise<Entry[]>>();
  return (file) => {
    const source = toSource(file);
    const absolute = path.resolve(cwd, file);
    const entries =
      loaded.get(file) ??
      fileExists(absolute).then(async (present) =>
        optional && !present ? [] : parse({ raw: await readJsonFile({ file: absolute, source }), source }),
      );
    loaded.set(file, entries);
    return entries;
  };
}

type Context = { cwd: string; loadBookmarks: Loader<Bookmark>; loadScans: Loader<Scan>; latestToday: string };

async function loadForIssue<Entry>(load: Loader<Entry>, file: string, source: string): Promise<Entry[]> {
  return load(file).catch((error: unknown) => {
    const [reason = ""] = (error instanceof Error ? error.message : String(error)).split("\n");
    throw new Error(`${source} cannot be checked until ${toSource(file)} is valid: ${reason.replace(/:$/, "")}`, {
      cause: error,
    });
  });
}

async function validateIssue({ file, source, context }: { file: string; source: string; context: Context }) {
  const issue = parseMagazineIssue({
    raw: await readJsonFile({ file: path.resolve(context.cwd, file), source }),
    source,
  });
  const dataDir = path.dirname(path.dirname(file));
  const bookmarks = await loadForIssue(context.loadBookmarks, path.join(dataDir, BOOKMARKS_FILE), source);
  const scans = await loadForIssue(context.loadScans, path.join(dataDir, SCANS_FILE), source);
  const warnings = issueWarnings({ issue, bookmarks, scans, latestToday: context.latestToday }).map(warningLine);
  const cover = await firstFileIn(path.resolve(context.cwd, path.dirname(file)), coverFileNames(issue.date));
  if (cover === undefined) {
    warnings.push(
      `no cover image; add ${toSource(path.join(path.dirname(file), issue.date))}${PICTURE_EXTENSIONS[0]} (or ${PICTURE_EXTENSIONS.slice(1).join(", ")}), a 3:4 portrait picture made for this issue`,
    );
  }
  warnings.push(...(await artWarnings({ issue, dir: path.dirname(file), cwd: context.cwd })).map(warningLine));
  return { sections: issue.sections.length, warnings };
}

async function artProblem(file: string, block: MagazineBlock): Promise<string | undefined> {
  if (!(await fileExists(file))) return "is missing";
  const size = await imageMetadata(await readFile(file)).catch(() => undefined);
  if (size === undefined) return "is not a picture";
  const rule = artRule(block);
  if (rule.fits(size)) return undefined;
  return `is ${size.width} × ${size.height} pixels; make it at least ${rule.label}`;
}

async function artWarnings({
  issue,
  dir,
  cwd,
}: {
  issue: MagazineIssue;
  dir: string;
  cwd: string;
}): Promise<IssueWarning[]> {
  const checked = await Promise.all(
    issue.sections.map(async (block, index) => {
      if (!("art" in block) || block.art === undefined) return [];
      const file = path.join(dir, artFileName(issue.date, block.art));
      const problem = await artProblem(path.resolve(cwd, file), block);
      if (problem === undefined) return [];
      const leftOut = showsOnlyArt(block) ? "the page leaves the block out" : "the page shows the block without it";
      return [{ path: ["sections", index, "art"], message: `${toSource(file)} ${problem}; ${leftOut}` }];
    }),
  );
  return checked.flat();
}

async function validateFile({ file, context }: { file: string; context: Context }): Promise<FileReport> {
  const source = toSource(file);
  try {
    if (isMagazineFile(file)) {
      if (!isIssueFileName(path.basename(file))) {
        return {
          source,
          ok: true,
          summary: "not an issue, so the page ignores it",
          warnings: ["name an issue after its date, such as 2026-10-19.json"],
        };
      }
      const { sections, warnings } = await validateIssue({ file, source, context });
      const summary = plural(sections, "section");
      return warnings.length === 0 ? { source, ok: true, summary } : { source, ok: true, summary, warnings };
    }
    const raw = await readJsonFile({ file: path.resolve(context.cwd, file), source });
    if (isConfigFile(file)) {
      const changed = changedSettings(parseDataFile({ schema: siteConfigSchema, raw, source }));
      return { source, ok: true, summary: `${plural(changed, "setting")} changed from the defaults` };
    }
    if (isScansFile(file)) {
      const scans = parseDataFile({ schema: scansFileSchema, raw, source });
      const picks = scans.filter(({ pick }) => pick).length;
      return { source, ok: true, summary: `${plural(scans.length, "scan")}, ${picks} on the bookmarks page` };
    }
    const schema = isStateFile(file) ? stateFileSchema : bookmarksFileSchema;
    const entries = parseDataFile({ schema, raw, source });
    const noun = isStateFile(file) ? "id" : "bookmark";
    return { source, ok: true, summary: plural(entries.length, noun) };
  } catch (error) {
    return { source, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function validateFiles({
  cwd,
  files,
  now = new Date(),
}: {
  cwd: string;
  files: readonly string[];
  now?: Date;
}): Promise<FileReport[]> {
  const context = {
    cwd,
    loadBookmarks: loader(cwd, parseBookmarks, { optional: false }),
    loadScans: loader(cwd, parseScans, { optional: true }),
    latestToday: latestDateOnEarth(now),
  };
  return Promise.all(files.map((file) => validateFile({ file, context })));
}
