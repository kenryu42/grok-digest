import { access } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { bookmarksFileSchema, parseBookmarks, parseDataFile, stateFileSchema, type Bookmark } from "./bookmarks.ts";
import { CONFIG_FILE, CUSTOM_DIR, siteConfigSchema } from "./custom.ts";
import { BOOKMARKS_FILE, jsonFilesIn, readJsonFile, STATE_FILES } from "./data-files.ts";
import { isIssueFileName, MAGAZINE_DIR, parseMagazineIssue } from "./magazine.ts";
import { issueWarnings, type IssueWarning } from "./magazine-check.ts";

type FileReport =
  | { source: string; ok: true; summary: string; warnings?: string[] }
  | { source: string; ok: false; error: string };

const EARLIEST_TIME_ZONE_OFFSET_MS = 14 * 60 * 60 * 1000;

const isStateFile = (file: string): boolean => STATE_FILES.some((name) => path.basename(file) === name);
const isConfigFile = (file: string): boolean => path.basename(file) === CONFIG_FILE;
const isMagazineFile = (file: string): boolean =>
  path.basename(path.dirname(file)) === MAGAZINE_DIR && path.basename(file) !== BOOKMARKS_FILE && !isStateFile(file);
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

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function defaultDataFiles({ cwd, dataDir }: { cwd: string; dataDir: string }): Promise<string[]> {
  const stateFiles = STATE_FILES.map((name) => path.join(dataDir, name));
  const optional = [...stateFiles, CONFIG_PATH];
  const present = await Promise.all(optional.map((file) => exists(path.resolve(cwd, file))));
  const magazineDir = path.join(dataDir, MAGAZINE_DIR);
  const magazineFiles = (await jsonFilesIn(path.resolve(cwd, magazineDir))).map((file) =>
    path.join(magazineDir, path.basename(file)),
  );
  return [path.join(dataDir, BOOKMARKS_FILE), ...optional.filter((_, index) => present[index]), ...magazineFiles];
}

type BookmarksLoader = (file: string) => Promise<Bookmark[]>;

function bookmarksLoader(cwd: string): BookmarksLoader {
  const loaded = new Map<string, Promise<Bookmark[]>>();
  return (file) => {
    const source = toSource(file);
    const bookmarks =
      loaded.get(file) ??
      readJsonFile({ file: path.resolve(cwd, file), source }).then((raw) => parseBookmarks({ raw, source }));
    loaded.set(file, bookmarks);
    return bookmarks;
  };
}

type Context = { cwd: string; loadBookmarks: BookmarksLoader; latestToday: string };

async function validateIssue({ file, source, context }: { file: string; source: string; context: Context }) {
  const issue = parseMagazineIssue({
    raw: await readJsonFile({ file: path.resolve(context.cwd, file), source }),
    source,
  });
  const bookmarksFile = path.join(path.dirname(path.dirname(file)), BOOKMARKS_FILE);
  const bookmarks = await context.loadBookmarks(bookmarksFile).catch((error: unknown) => {
    const [reason = ""] = (error instanceof Error ? error.message : String(error)).split("\n");
    throw new Error(
      `${source} cannot be checked until ${toSource(bookmarksFile)} is valid: ${reason.replace(/:$/, "")}`,
      { cause: error },
    );
  });
  const warnings = issueWarnings({ issue, bookmarks, latestToday: context.latestToday }).map(warningLine);
  return { sections: issue.sections.length, warnings };
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
  const context = { cwd, loadBookmarks: bookmarksLoader(cwd), latestToday: latestDateOnEarth(now) };
  return Promise.all(files.map((file) => validateFile({ file, context })));
}
