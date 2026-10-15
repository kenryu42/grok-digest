import { access } from "node:fs/promises";
import path from "node:path";
import { bookmarksFileSchema, parseDataFile, stateFileSchema } from "./bookmarks.ts";
import { BOOKMARKS_FILE, readJsonFile, STATE_FILES } from "./data-files.ts";

type FileReport = { source: string; ok: true; summary: string } | { source: string; ok: false; error: string };

const isStateFile = (file: string): boolean => STATE_FILES.some((name) => path.basename(file) === name);

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
  const present = await Promise.all(stateFiles.map((file) => exists(path.resolve(cwd, file))));
  return [path.join(dataDir, BOOKMARKS_FILE), ...stateFiles.filter((_, index) => present[index])];
}

async function validateFile({ cwd, file }: { cwd: string; file: string }): Promise<FileReport> {
  const source = file.split(path.sep).join("/");
  try {
    const raw = await readJsonFile({ file: path.resolve(cwd, file), source });
    const schema = isStateFile(file) ? stateFileSchema : bookmarksFileSchema;
    const entries = parseDataFile({ schema, raw, source });
    const noun = isStateFile(file) ? "id" : "bookmark";
    return { source, ok: true, summary: `${entries.length} ${noun}${entries.length === 1 ? "" : "s"}` };
  } catch (error) {
    return { source, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function validateFiles({ cwd, files }: { cwd: string; files: readonly string[] }): Promise<FileReport[]> {
  return Promise.all(files.map((file) => validateFile({ cwd, file })));
}
