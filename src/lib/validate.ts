import { access } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { bookmarksFileSchema, parseBookmarks, parseDataFile, stateFileSchema, type Bookmark } from "./bookmarks.ts";
import { CONFIG_FILE, CUSTOM_DIR, siteConfigSchema } from "./custom.ts";
import { BOOKMARKS_FILE, isIssueFileName, issueFilesIn, readJsonFile, STATE_FILES } from "./data-files.ts";
import { MAGAZINE_DIR, parseMagazineIssue } from "./magazine.ts";

type FileReport = { source: string; ok: true; summary: string } | { source: string; ok: false; error: string };

const isStateFile = (file: string): boolean => STATE_FILES.some((name) => path.basename(file) === name);
const isConfigFile = (file: string): boolean => path.basename(file) === CONFIG_FILE;
const isIssueFile = (file: string): boolean =>
  path.basename(path.dirname(file)) === MAGAZINE_DIR && isIssueFileName(path.basename(file));
const toSource = (file: string): string => file.split(path.sep).join("/");
const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;
const CONFIG_PATH = path.join(CUSTOM_DIR, CONFIG_FILE);
const DEFAULT_SETTINGS = new Map(Object.entries(siteConfigSchema.parse({})));

const changedSettings = (config: object): number =>
  Object.entries(config).filter(([key, value]) => !isDeepStrictEqual(value, DEFAULT_SETTINGS.get(key))).length;

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
  const issues = (await issueFilesIn(path.resolve(cwd, magazineDir))).map((file) =>
    path.join(magazineDir, path.basename(file)),
  );
  return [path.join(dataDir, BOOKMARKS_FILE), ...optional.filter((_, index) => present[index]), ...issues];
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

async function validateIssue({
  file,
  source,
  raw,
  loadBookmarks,
}: {
  file: string;
  source: string;
  raw: unknown;
  loadBookmarks: BookmarksLoader;
}) {
  const bookmarksFile = path.join(path.dirname(path.dirname(file)), BOOKMARKS_FILE);
  const bookmarks = await loadBookmarks(bookmarksFile).catch((error: unknown) => {
    const [reason = ""] = (error instanceof Error ? error.message : String(error)).split("\n");
    throw new Error(
      `${source} cannot be checked until ${toSource(bookmarksFile)} is valid: ${reason.replace(/:$/, "")}`,
      {
        cause: error,
      },
    );
  });
  return parseMagazineIssue({ raw, source, bookmarks });
}

async function validateFile({
  cwd,
  file,
  loadBookmarks,
}: {
  cwd: string;
  file: string;
  loadBookmarks: BookmarksLoader;
}): Promise<FileReport> {
  const source = toSource(file);
  try {
    const raw = await readJsonFile({ file: path.resolve(cwd, file), source });
    if (isConfigFile(file)) {
      const changed = changedSettings(parseDataFile({ schema: siteConfigSchema, raw, source }));
      return { source, ok: true, summary: `${plural(changed, "setting")} changed from the defaults` };
    }
    if (isIssueFile(file)) {
      const issue = await validateIssue({ file, source, raw, loadBookmarks });
      return { source, ok: true, summary: plural(issue.sections.length, "section") };
    }
    const schema = isStateFile(file) ? stateFileSchema : bookmarksFileSchema;
    const entries = parseDataFile({ schema, raw, source });
    const noun = isStateFile(file) ? "id" : "bookmark";
    return { source, ok: true, summary: plural(entries.length, noun) };
  } catch (error) {
    return { source, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function validateFiles({ cwd, files }: { cwd: string; files: readonly string[] }): Promise<FileReport[]> {
  const loadBookmarks = bookmarksLoader(cwd);
  return Promise.all(files.map((file) => validateFile({ cwd, file, loadBookmarks })));
}
