import { rm } from "node:fs/promises";
import path from "node:path";
import { fileExists, foldersIn } from "./data-files.ts";
import { isIssueFolderName } from "./magazine.ts";
import { EPISODE_FILES, episodeAgeDays } from "./episode.ts";

export async function pruneEpisodes({
  magazineDir,
  days,
  now = new Date(),
  dryRun = false,
}: {
  magazineDir: string;
  days: number;
  now?: Date;
  dryRun?: boolean;
}): Promise<string[]> {
  const stale = (await foldersIn(magazineDir)).filter(
    (date) => isIssueFolderName(date) && episodeAgeDays(date, now) > days,
  );
  const candidates = stale.flatMap((date) => EPISODE_FILES.map((name) => path.join(magazineDir, date, name)));
  const present = await Promise.all(candidates.map(fileExists));
  const files = candidates.filter((_, index) => present[index]);
  if (!dryRun) await Promise.all(files.map((file) => rm(file)));
  return files;
}
