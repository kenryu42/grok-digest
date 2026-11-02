import { z } from "zod";
import { parseDataFile } from "./bookmarks.ts";

export const EPISODE_FILE = "episode.json";
export const EPISODE_LANGUAGES = ["en", "zh", "ja"] as const;
export type EpisodeLanguage = (typeof EPISODE_LANGUAGES)[number];
export const MAX_EPISODE_BYTES = 10 * 1024 * 1024;
export const EPISODE_STALE_DAYS = 60;

export const EPISODE_LANGUAGE_LABELS: Record<EpisodeLanguage, string> = {
  en: "EN",
  zh: "中文",
  ja: "日本語",
};

export const episodeAudioFile = (language: EpisodeLanguage): string => `episode-${language}.mp3`;

export const EPISODE_FILES: readonly string[] = [EPISODE_FILE, ...EPISODE_LANGUAGES.map(episodeAudioFile)];

const chapterSchema = z.object({
  start: z.number().nonnegative(),
  title: z.string().trim().min(1).max(120),
});

const languageSchema = (language: EpisodeLanguage) =>
  z
    .object({
      file: z.literal(episodeAudioFile(language), { error: `must be ${episodeAudioFile(language)}` }),
      duration: z.number().positive(),
      chapters: z.array(chapterSchema).min(1),
    })
    .superRefine(({ duration, chapters }, context) => {
      chapters.forEach(({ start }, index) => {
        const previous = chapters[index - 1];
        if (previous !== undefined && start <= previous.start) {
          context.addIssue({
            code: "custom",
            path: ["chapters", index, "start"],
            message: "must be later than the chapter before it",
          });
        }
        if (start >= duration) {
          context.addIssue({
            code: "custom",
            path: ["chapters", index, "start"],
            message: `must be before the end of the episode at ${duration} seconds`,
          });
        }
      });
    });

const songSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(200),
  appleMusicId: z.string().regex(/^\d+$/, "must be the song's numeric Apple Music id"),
  url: z.url({ protocol: /^https$/ }),
});

export const episodeSchema = z.object({
  languages: z
    .strictObject({
      en: languageSchema("en").optional(),
      zh: languageSchema("zh").optional(),
      ja: languageSchema("ja").optional(),
    })
    .refine((languages) => Object.values(languages).some((language) => language !== undefined), {
      message: `needs at least one of ${EPISODE_LANGUAGES.join(", ")}`,
    }),
  song: songSchema.optional(),
});

export type Episode = z.output<typeof episodeSchema>;
type EpisodeSong = NonNullable<Episode["song"]>;
type EpisodeChapter = z.output<typeof chapterSchema>;

export const parseEpisode = ({ raw, source }: { raw: unknown; source: string }): Episode =>
  parseDataFile({ schema: episodeSchema, raw, source });

export const episodeLanguages = (episode: Episode): EpisodeLanguage[] =>
  EPISODE_LANGUAGES.filter((language) => episode.languages[language] !== undefined);

type EpisodeTrack = {
  language: EpisodeLanguage;
  src: string;
  chapters: EpisodeChapter[];
};

export type PlayableEpisode = { tracks: EpisodeTrack[]; song: EpisodeSong | undefined };

export function playableEpisode(episode: Episode, audio: Partial<Record<EpisodeLanguage, string>>): PlayableEpisode {
  const tracks = episodeLanguages(episode).flatMap((language): EpisodeTrack[] => {
    const track = episode.languages[language];
    const src = audio[language];
    return track === undefined || src === undefined ? [] : [{ language, src, chapters: track.chapters }];
  });
  return { tracks, song: episode.song };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const episodeAgeDays = (date: string, now: Date): number =>
  Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS,
  );

export function preferredLanguage(
  available: readonly EpisodeLanguage[],
  stored: unknown,
  browserLanguages: readonly string[],
): EpisodeLanguage | undefined {
  const isAvailable = (value: unknown): value is EpisodeLanguage => available.some((language) => language === value);
  if (isAvailable(stored)) return stored;
  const spoken = browserLanguages.map((tag) => tag.toLowerCase().split("-")[0]).find(isAvailable);
  return spoken ?? available[0];
}

export function chapterIndexAt(chapters: readonly { start: number }[], time: number): number {
  return chapters.findLastIndex(({ start }) => start <= time);
}

export function clockLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
