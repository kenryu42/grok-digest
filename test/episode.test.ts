import { describe, expect, it } from "vitest";
import { siteConfigSchema } from "../src/lib/custom.ts";
import {
  chapterIndexAt,
  clockLabel,
  episodeAgeDays,
  episodeSchema,
  parseEpisode,
  playableEpisode,
  preferredLanguage,
} from "../src/lib/episode.ts";

const SONG = {
  title: "Here Comes the Sun",
  artist: "The Beatles",
  appleMusicId: "1441164589",
  url: "https://music.apple.com/jp/album/1441164426?i=1441164589",
};

const track = (
  language: string,
  chapters = [
    { start: 0, title: "Jingle" },
    { start: 5.4, title: "Weather" },
  ],
) => ({
  file: `episode-${language}.mp3`,
  duration: 235.57,
  chapters,
});

const parse = (raw: unknown) => episodeSchema.safeParse(raw);
const messagesOf = (raw: unknown): string => {
  const result = parse(raw);
  return result.success ? "" : JSON.stringify(result.error.issues);
};

describe("episode.json", () => {
  it("keeps the fields the page uses and drops everything else", () => {
    const episode = parseEpisode({
      source: "episode.json",
      raw: {
        date: "2026-11-02",
        music: { intro: "jingle.mp3" },
        rendering: { model: "eleven_v3" },
        song: { ...SONG, why: "Rain today", lookup: "https://itunes.apple.com/lookup" },
        languages: {
          en: {
            ...track("en"),
            bytes: 1884829,
            voice: { id: "x" },
            chapters: [{ start: 0, id: "jingle", end: 5.4, match: "x", title: "Jingle" }],
          },
        },
      },
    });
    expect(episode).toEqual({
      song: SONG,
      languages: { en: { file: "episode-en.mp3", duration: 235.57, chapters: [{ start: 0, title: "Jingle" }] } },
    });
  });

  it("names each file after its language", () => {
    expect(messagesOf({ languages: { en: { ...track("en"), file: "episode-ja.mp3" } } })).toContain(
      "must be episode-en.mp3",
    );
    expect(messagesOf({ languages: { en: { ...track("en"), file: "../episode-en.mp3" } } })).toContain(
      "must be episode-en.mp3",
    );
  });

  it("allows only en, zh and ja, and needs at least one", () => {
    expect(parse({ languages: { fr: track("fr") } }).success).toBe(false);
    expect(messagesOf({ languages: {} })).toContain("needs at least one of en, zh, ja");
    expect(parse({ languages: { en: track("en"), zh: track("zh"), ja: track("ja") } }).success).toBe(true);
  });

  it("needs chapters that start later each time and before the end", () => {
    const backwards = [
      { start: 0, title: "A" },
      { start: 10, title: "B" },
      { start: 10, title: "C" },
    ];
    expect(messagesOf({ languages: { en: track("en", backwards) } })).toContain(
      "must be later than the chapter before it",
    );
    const late = [{ start: 300, title: "After the end" }];
    expect(messagesOf({ languages: { en: track("en", late) } })).toContain("must be before the end of the episode");
    expect(parse({ languages: { en: track("en", []) } }).success).toBe(false);
  });

  it("needs a song with a numeric Apple Music id and an https link", () => {
    expect(parse({ languages: { en: track("en") }, song: { ...SONG, appleMusicId: "abc" } }).success).toBe(false);
    expect(parse({ languages: { en: track("en") }, song: { ...SONG, url: "javascript:alert(1)" } }).success).toBe(
      false,
    );
    expect(parse({ languages: { en: track("en") } }).success).toBe(true);
  });

  it("plays only the languages whose audio was published", () => {
    const episode = parseEpisode({ source: "e", raw: { languages: { en: track("en"), ja: track("ja") }, song: SONG } });
    expect(playableEpisode(episode, { ja: "/_astro/episode-ja.abc.mp3" })).toEqual({
      tracks: [
        {
          language: "ja",
          src: "/_astro/episode-ja.abc.mp3",
          chapters: track("ja").chapters,
        },
      ],
      song: SONG,
    });
  });
});

describe("the musicKit setting", () => {
  it("takes a token endpoint address and nothing else", () => {
    const tokenEndpoint = "https://relay.example/musickit-token";
    expect(siteConfigSchema.parse({ musicKit: { tokenEndpoint } }).musicKit).toEqual({ tokenEndpoint });
    expect(siteConfigSchema.parse({}).musicKit).toBeUndefined();
    expect(siteConfigSchema.safeParse({ musicKit: { tokenEndpoint: "relay.example" } }).success).toBe(false);
    expect(siteConfigSchema.safeParse({ musicKit: { tokenEndpoint, token: "x" } }).success).toBe(false);
  });
});

describe("the player's choices", () => {
  it("plays the remembered language, else the browser's, else the first", () => {
    expect(preferredLanguage(["en", "zh", "ja"], "zh", ["ja-JP"])).toBe("zh");
    expect(preferredLanguage(["en", "zh", "ja"], "fr", ["ja-JP", "en"])).toBe("ja");
    expect(preferredLanguage(["en", "zh"], null, ["zh-Hant-TW"])).toBe("zh");
    expect(preferredLanguage(["en", "zh"], "ja", ["ja"])).toBe("en");
    expect(preferredLanguage([], null, ["en"])).toBeUndefined();
  });

  it("finds the chapter playing at a time", () => {
    const chapters = [
      { start: 0, title: "A" },
      { start: 5.4, title: "B" },
      { start: 41.55, title: "C" },
    ];
    expect(chapterIndexAt(chapters, 0)).toBe(0);
    expect(chapterIndexAt(chapters, 41.54)).toBe(1);
    expect(chapterIndexAt(chapters, 41.55)).toBe(2);
    expect(chapterIndexAt(chapters.slice(1), 1)).toBe(-1);
  });

  it("labels times as minutes and seconds", () => {
    expect(clockLabel(0)).toBe("0:00");
    expect(clockLabel(41.55)).toBe("0:41");
    expect(clockLabel(235.57)).toBe("3:55");
  });

  it("counts an episode's age in whole days", () => {
    expect(episodeAgeDays("2026-11-02", new Date("2026-11-02T23:00:00Z"))).toBe(0);
    expect(episodeAgeDays("2026-09-02", new Date("2026-11-02T01:00:00Z"))).toBe(61);
  });
});
