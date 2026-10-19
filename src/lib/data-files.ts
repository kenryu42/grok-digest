import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const BOOKMARKS_FILE = "bookmarks.json";
export const STATE_FILES = ["processed.json", "removed.json"] as const;

export async function readJsonFile({ file, source }: { file: string; source: string }): Promise<unknown> {
  const text = await readFile(file, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${source} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

export async function jsonFilesIn(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir);
    return names
      .filter((name) => name.endsWith(".json"))
      .toSorted()
      .map((name) => path.join(dir, name));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
