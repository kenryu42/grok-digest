import { chapterIndexAt, EPISODE_LANGUAGES, preferredLanguage, type EpisodeLanguage } from "./episode.ts";
import { startSongPlayer } from "./musickit.ts";
import { readStored, STORAGE_PREFIX, writeStored } from "./storage.ts";

const LANGUAGE_KEY = `${STORAGE_PREFIX}podcast-language`;
const TAB_KEYS: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

const isLanguage = (value: string | undefined): value is EpisodeLanguage =>
  EPISODE_LANGUAGES.some((language) => language === value);

function startPodcast(section: HTMLElement): void {
  const audio = section.querySelector<HTMLAudioElement>("[data-podcast-audio]");
  const panel = section.querySelector<HTMLElement>("[role=tabpanel]");
  const tabs = [...section.querySelectorAll<HTMLButtonElement>("[data-podcast-tab]")];
  if (audio === null || panel === null || tabs.length === 0) return;
  const next = section.querySelector<HTMLElement>("[data-podcast-next]");
  const nextSong = startSongPlayer(next, section.dataset["tokenEndpoint"]);
  let language = tabs[0]?.dataset["podcastTab"];

  const chaptersByLanguage = new Map(
    [...section.querySelectorAll<HTMLElement>("[data-podcast-chapters]")].map((list) => {
      const buttons = [...list.querySelectorAll<HTMLButtonElement>("button[data-start]")];
      const chapters = buttons.map((button) => ({ start: Number(button.dataset["start"]) }));
      return [list.dataset["podcastChapters"], { buttons, chapters }];
    }),
  );
  const current = () => chaptersByLanguage.get(language) ?? { buttons: [], chapters: [] };

  const highlight = (): void => {
    const { buttons, chapters } = current();
    const playing = chapterIndexAt(chapters, audio.currentTime);
    buttons.forEach((button, index) => button.setAttribute("aria-current", String(index === playing)));
  };

  let pendingSeek: (() => void) | undefined;
  const cancelSeek = (): void => {
    if (pendingSeek !== undefined) audio.removeEventListener("loadedmetadata", pendingSeek);
    pendingSeek = undefined;
  };
  const seek = (time: number): void => {
    cancelSeek();
    const go = (): void => {
      pendingSeek = undefined;
      audio.currentTime = time;
      void audio.play().catch(() => undefined);
    };
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      go();
      return;
    }
    pendingSeek = go;
    audio.addEventListener("loadedmetadata", go, { once: true });
    audio.load();
  };

  const select = (tab: HTMLButtonElement, { remember }: { remember: boolean }): void => {
    const chosen = tab.dataset["podcastTab"];
    if (!isLanguage(chosen)) return;
    if (remember) writeStored(LANGUAGE_KEY, chosen);
    if (chosen === language) return;
    language = chosen;
    for (const each of tabs) {
      const selected = each === tab;
      each.setAttribute("aria-selected", String(selected));
      each.tabIndex = selected ? 0 : -1;
    }
    panel.setAttribute("aria-labelledby", tab.id);
    for (const list of section.querySelectorAll<HTMLElement>("[data-podcast-chapters]")) {
      list.hidden = list.dataset["podcastChapters"] !== chosen;
    }
    if (next !== null) next.hidden = true;
    cancelSeek();
    audio.pause();
    audio.src = tab.dataset["src"] ?? "";
    audio.load();
    highlight();
  };

  const available = tabs.map((tab) => tab.dataset["podcastTab"]).filter(isLanguage);
  const preferred = preferredLanguage(available, readStored(LANGUAGE_KEY), navigator.languages);
  const preferredTab = tabs.find((tab) => tab.dataset["podcastTab"] === preferred);
  if (preferredTab !== undefined) select(preferredTab, { remember: false });

  for (const tab of tabs) {
    tab.addEventListener("click", () => select(tab, { remember: true }));
    tab.addEventListener("keydown", (event) => {
      const move = TAB_KEYS[event.key];
      if (move === undefined) return;
      event.preventDefault();
      const target = tabs[move(tabs.indexOf(tab), tabs.length)];
      if (target === undefined) return;
      target.focus();
      select(target, { remember: true });
    });
  }

  section.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-start]") : null;
    if (button === null) return;
    seek(Number(button.dataset["start"]));
  });

  const jumpChapter = (step: number): void => {
    const { chapters } = current();
    const target = chapters[chapterIndexAt(chapters, audio.currentTime) + step];
    if (target !== undefined) seek(target.start);
  };

  audio.addEventListener("timeupdate", highlight);
  audio.addEventListener("seeked", highlight);
  audio.addEventListener("ended", nextSong.show);
  audio.addEventListener("play", () => {
    nextSong.pause();
    if (next !== null) next.hidden = true;
    if (!("mediaSession" in navigator)) return;
    const { title, artist, album, artwork } = section.dataset;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title ?? "",
      artist: artist ?? "",
      album: album ?? "",
      artwork: artwork === undefined ? [] : [{ src: new URL(artwork, window.location.href).href }],
    });
    const handlers: [MediaSessionAction, () => void][] = [
      ["previoustrack", () => jumpChapter(-1)],
      ["nexttrack", () => jumpChapter(1)],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    }
  });
}

export function startPodcasts(): void {
  for (const section of document.querySelectorAll<HTMLElement>("section[data-podcast]")) startPodcast(section);
}
