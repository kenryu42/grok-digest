import { clockLabel } from "./episode.ts";
import { browserClock, fadeIn, SONG_FADE_SECONDS } from "./fade.ts";

const MUSICKIT_SCRIPT = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
const MUSICKIT_LOADED = "musickitloaded";
const MUSICKIT_APP = { name: "Grok Digest", build: "1" };
export const SKIP_SECONDS = 15;
const PREVIEW_TOLERANCE_SECONDS = 5;
const MS_PER_SECOND = 1000;

type MusicKitPlayer = {
  readonly isAuthorized: boolean;
  readonly currentPlaybackTime: number;
  readonly currentPlaybackDuration: number;
  readonly playbackState: number;
  readonly nowPlayingItem: { readonly playbackDuration: number } | undefined;
  volume: number;
  authorize: () => Promise<unknown>;
  hasMusicSubscription: () => Promise<boolean>;
  setQueue: (options: { song: string; startPlaying: boolean }) => Promise<unknown>;
  play: () => Promise<unknown>;
  pause: () => void;
  seekToTime: (seconds: number) => Promise<unknown>;
  addEventListener: (name: string, listener: () => void) => void;
};

type MusicKitGlobal = {
  configure: (options: {
    developerToken: string;
    app: typeof MUSICKIT_APP;
    suppressErrorDialog: boolean;
  }) => Promise<MusicKitPlayer>;
  Events: {
    playbackStateDidChange: string;
    playbackTimeDidChange: string;
    playbackDurationDidChange: string;
  };
  PlaybackStates: { playing: number; ended: number; completed: number };
};

type MusicKitWindow = Window & { MusicKit?: MusicKitGlobal };

type MusicStage = "script" | "token" | "configure" | "queue";

class MusicKitProblem extends Error {
  constructor(readonly stage: MusicStage) {
    super(`Apple Music stopped at ${stage}`);
  }
}

export type PreviewReason = "sign-in" | "subscription";

export const PREVIEW_BADGES: Record<PreviewReason, string> = {
  "sign-in": "Preview · sign in for the full song",
  subscription: "Preview · Apple Music subscription needed",
};

export function previewReason({
  authorized,
  subscribed,
  playbackSeconds,
  catalogMilliseconds,
}: {
  authorized: boolean;
  subscribed: boolean;
  playbackSeconds: number;
  catalogMilliseconds: number | undefined;
}): PreviewReason | undefined {
  if (!authorized) return "sign-in";
  if (!subscribed) return "subscription";
  const catalogSeconds = (catalogMilliseconds ?? 0) / MS_PER_SECOND;
  const cutShort = playbackSeconds > 0 && catalogSeconds - playbackSeconds > PREVIEW_TOLERANCE_SECONDS;
  return cutShort ? "subscription" : undefined;
}

export const PREVIEW_ENDED: Record<PreviewReason, string> = {
  "sign-in": "The 30-second preview ended. Sign in to Apple Music for the full song.",
  subscription: "The 30-second preview ended. An Apple Music subscription plays the full song.",
};

const isPreviewReason = (value: string | undefined): value is PreviewReason =>
  value === "sign-in" || value === "subscription";

export const skipTarget = (current: number, step: number, duration: number): number =>
  Math.min(Math.max(current + step, 0), Math.max(duration, 0));

export const positionText = (current: number, duration: number): string =>
  `${clockLabel(current)} of ${clockLabel(duration)}`;

function loadMusicKit(): Promise<MusicKitGlobal> {
  const ready = (window as MusicKitWindow).MusicKit;
  if (ready !== undefined) return Promise.resolve(ready);
  return new Promise((resolve, reject) => {
    document.addEventListener(
      MUSICKIT_LOADED,
      () => {
        const loaded = (window as MusicKitWindow).MusicKit;
        if (loaded === undefined) reject(new MusicKitProblem("script"));
        else resolve(loaded);
      },
      { once: true },
    );
    const script = document.createElement("script");
    script.src = MUSICKIT_SCRIPT;
    script.async = true;
    script.addEventListener("error", () => reject(new MusicKitProblem("script")), { once: true });
    document.head.append(script);
  });
}

async function developerToken(endpoint: string): Promise<string> {
  const response = await fetch(endpoint, { mode: "cors", credentials: "omit" }).catch(() => undefined);
  if (response?.ok !== true) throw new MusicKitProblem("token");
  const body: unknown = await response.json().catch(() => undefined);
  const token = typeof body === "object" && body !== null && "token" in body ? body.token : undefined;
  if (typeof token !== "string" || token === "") throw new MusicKitProblem("token");
  return token;
}

async function queueSong(endpoint: string, songId: string) {
  const [musicKit, token] = await Promise.all([loadMusicKit(), developerToken(endpoint)]);
  const player = await musicKit
    .configure({ developerToken: token, app: MUSICKIT_APP, suppressErrorDialog: true })
    .catch(() => {
      throw new MusicKitProblem("configure");
    });
  await player.setQueue({ song: songId, startPlaying: false }).catch(() => {
    throw new MusicKitProblem("queue");
  });
  return { musicKit, player };
}

const stageOf = (error: unknown): MusicStage => (error instanceof MusicKitProblem ? error.stage : "configure");

const subscribed = (player: MusicKitPlayer): Promise<boolean> =>
  player.isAuthorized ? player.hasMusicSubscription().catch(() => false) : Promise.resolve(false);

type SongPlayer = { prepare: () => void; show: (options: { fade: boolean }) => void; pause: () => void };

export function startSongPlayer(next: HTMLElement | null, endpoint: string | undefined): SongPlayer {
  const root = next?.querySelector<HTMLElement>("[data-music-player]") ?? null;
  const find = (selector: string): HTMLElement | null => next?.querySelector<HTMLElement>(selector) ?? null;
  const button = (selector: string): HTMLButtonElement | null =>
    next?.querySelector<HTMLButtonElement>(selector) ?? null;
  const toggle = button("[data-music-play]");
  const back = button("[data-music-back]");
  const forward = button("[data-music-forward]");
  const scrub = next?.querySelector<HTMLInputElement>("[data-music-scrub]") ?? null;
  const time = find("[data-music-time]");
  const total = find("[data-music-duration]");
  const badge = find("[data-music-preview]");
  const signIn = button("[data-music-signin]");
  const status = find("[data-music-status]");
  const songId = next?.dataset["appleMusicId"];
  const title = toggle?.dataset["title"] ?? "the song";
  let loading = false;
  let ready: Awaited<ReturnType<typeof queueSong>> | undefined;
  let isSubscribed = false;
  let dragging = false;
  let wanted = false;
  let fadePending = false;
  let failed = false;
  let stopFade: (() => void) | undefined;

  const fullVolume = (): void => {
    fadePending = false;
    stopFade?.();
    stopFade = undefined;
    if (ready !== undefined) ready.player.volume = 1;
  };
  const startFade = (): void => {
    if (ready === undefined || !fadePending) return;
    fadePending = false;
    const { player } = ready;
    stopFade = fadeIn({
      seconds: SONG_FADE_SECONDS,
      apply: (level) => {
        player.volume = level;
      },
      clock: browserClock(),
    });
  };

  const say = (text: string): void => {
    if (status !== null) status.textContent = text;
  };
  const setState = (state: string): void => {
    if (root !== null) root.dataset["musicState"] = state;
  };
  const enable = (on: boolean): void => {
    for (const control of [toggle, back, forward, scrub]) if (control !== null) control.disabled = !on;
  };

  const showPreview = (): void => {
    if (ready === undefined) return;
    const { player } = ready;
    const reason = previewReason({
      authorized: player.isAuthorized,
      subscribed: isSubscribed,
      playbackSeconds: player.currentPlaybackDuration,
      catalogMilliseconds: player.nowPlayingItem?.playbackDuration,
    });
    if (badge !== null) {
      badge.hidden = reason === undefined;
      badge.textContent = reason === undefined ? "" : PREVIEW_BADGES[reason];
    }
    if (root !== null) root.dataset["musicPlayback"] = reason ?? "full";
    if (signIn !== null) signIn.hidden = player.isAuthorized;
  };

  const showTime = (): void => {
    if (ready === undefined) return;
    const { player } = ready;
    const duration = player.currentPlaybackDuration;
    const current = Math.min(player.currentPlaybackTime, duration);
    if (scrub !== null) {
      scrub.max = String(Math.max(duration, 0));
      if (!dragging) scrub.value = String(current);
      scrub.setAttribute("aria-valuetext", positionText(Number(scrub.value), duration));
    }
    if (time !== null && !dragging) time.textContent = clockLabel(current);
    if (total !== null) total.textContent = clockLabel(duration);
  };

  const showPlaying = (): void => {
    if (ready === undefined || toggle === null) return;
    const { playing: playingState, ended, completed } = ready.musicKit.PlaybackStates;
    const state = ready.player.playbackState;
    const playing = state === playingState;
    if (playing) startFade();
    const shown = root?.dataset["musicPlayback"];
    if ((state === ended || state === completed) && isPreviewReason(shown)) say(PREVIEW_ENDED[shown]);
    toggle.dataset["playing"] = String(playing);
    toggle.setAttribute("aria-label", playing ? `Pause ${title}` : `Play ${title}`);
    setState(playing ? "playing" : "ready");
    showPreview();
  };

  const play = (): void => {
    if (ready === undefined || songId === undefined) return;
    const { player } = ready;
    if (fadePending) player.volume = 0;
    const started =
      player.nowPlayingItem === undefined ? player.setQueue({ song: songId, startPlaying: true }) : player.play();
    started.catch(() => say("The song did not start. Tap Play again, or open it in Apple Music."));
  };

  toggle?.addEventListener("click", () => {
    if (ready === undefined) return;
    say("");
    if (toggle.dataset["playing"] === "true") {
      fullVolume();
      ready.player.pause();
    } else {
      play();
    }
  });

  const seek = (seconds: number): void => {
    ready?.player.seekToTime(seconds).catch(() => say("Could not move in the song. Try again."));
  };
  const skip = (step: number): void => {
    if (ready === undefined) return;
    fullVolume();
    const { player } = ready;
    seek(skipTarget(player.currentPlaybackTime, step, player.currentPlaybackDuration));
  };
  back?.addEventListener("click", () => skip(-SKIP_SECONDS));
  forward?.addEventListener("click", () => skip(SKIP_SECONDS));

  scrub?.addEventListener("input", () => {
    dragging = true;
    if (time !== null) time.textContent = clockLabel(Number(scrub.value));
    scrub.setAttribute("aria-valuetext", positionText(Number(scrub.value), Number(scrub.max)));
  });
  scrub?.addEventListener("change", () => {
    dragging = false;
    fullVolume();
    seek(Number(scrub.value));
  });
  const stopDragging = (): void => {
    dragging = false;
    showTime();
  };
  scrub?.addEventListener("pointercancel", stopDragging);
  scrub?.addEventListener("blur", stopDragging);

  signIn?.addEventListener("click", () => {
    if (ready === undefined) return;
    const { player } = ready;
    player
      .authorize()
      .then(() => subscribed(player))
      .then(
        (hasSubscription) => {
          isSubscribed = hasSubscription;
          showPreview();
          if (songId === undefined || !hasSubscription) return;
          player.setQueue({ song: songId, startPlaying: false }).then(
            () => say("Signed in. Tap Play for the full song."),
            () => say("The song did not load. Tap Play again, or open it in Apple Music."),
          );
        },
        () => showPreview(),
      );
  });

  const attach = (loaded: Awaited<ReturnType<typeof queueSong>>): void => {
    const { musicKit, player } = loaded;
    player.addEventListener(musicKit.Events.playbackStateDidChange, showPlaying);
    player.addEventListener(musicKit.Events.playbackTimeDidChange, showTime);
    player.addEventListener(musicKit.Events.playbackDurationDidChange, () => {
      showTime();
      showPreview();
    });
  };

  const tryAutoplay = (): void => {
    if (ready === undefined || !wanted) return;
    if (fadePending) ready.player.volume = 0;
    ready.player.play().catch(() => undefined);
  };

  const load = (): void => {
    if (ready !== undefined || root === null || endpoint === undefined || songId === undefined || loading) return;
    loading = true;
    setState("loading");
    say("Getting Apple Music ready…");
    queueSong(endpoint, songId)
      .then(async (loaded) => {
        isSubscribed = await subscribed(loaded.player);
        attach(loaded);
        ready = loaded;
        failed = false;
        enable(true);
        setState("ready");
        say("");
        showPreview();
        showTime();
        tryAutoplay();
      })
      .catch((error: unknown) => {
        loading = false;
        failed = true;
        setState("failed");
        root.dataset["musicStage"] = stageOf(error);
        enable(false);
        say("Apple Music could not start here. Open the song in Apple Music instead.");
      });
  };

  const show = ({ fade }: { fade: boolean }): void => {
    if (next === null) return;
    next.hidden = false;
    wanted = true;
    fadePending = fade;
    if (ready === undefined) load();
    else tryAutoplay();
  };

  const pause = (): void => {
    wanted = false;
    fullVolume();
    if (ready === undefined || toggle?.dataset["playing"] !== "true") return;
    ready.player.pause();
  };

  const prepare = (): void => {
    if (!failed) load();
  };

  return { prepare, show, pause };
}
