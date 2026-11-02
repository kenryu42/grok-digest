export const EPISODE_FADE_SECONDS = 5;
export const SONG_FADE_SECONDS = 4;
export const PREPARE_SONG_SECONDS = 20;

const FULL = 1;
const MS_PER_SECOND = 1000;
const STEP_MS = 50;

export const fadeLevel = (seconds: number, length: number): number => {
  if (!(seconds < length)) return FULL;
  if (seconds <= 0) return 0;
  return Math.sin(((seconds / length) * Math.PI) / 2);
};

export type FrameClock = {
  now: () => number;
  nextFrame: (step: () => void) => number;
  cancelFrame: (frame: number) => void;
};

export const browserClock = (): FrameClock => ({
  now: () => performance.now(),
  nextFrame: (step) => window.setTimeout(step, STEP_MS),
  cancelFrame: (frame) => window.clearTimeout(frame),
});

export function fadeIn({
  seconds,
  apply,
  clock,
}: {
  seconds: number;
  apply: (level: number) => void;
  clock: FrameClock;
}): () => void {
  const started = clock.now();
  let frame: number | undefined;
  const step = (): void => {
    const level = fadeLevel((clock.now() - started) / MS_PER_SECOND, seconds);
    apply(level);
    frame = level < FULL ? clock.nextFrame(step) : undefined;
  };
  apply(0);
  frame = clock.nextFrame(step);
  return () => {
    if (frame !== undefined) clock.cancelFrame(frame);
    frame = undefined;
    apply(FULL);
  };
}

export function fadeOut({
  seconds,
  remaining,
  apply,
  done,
  clock,
}: {
  seconds: number;
  remaining: () => number;
  apply: (level: number) => boolean;
  done: () => void;
  clock: FrameClock;
}): () => void {
  let frame: number | undefined;
  const stop = (): void => {
    if (frame !== undefined) clock.cancelFrame(frame);
    frame = undefined;
  };
  const step = (): void => {
    frame = undefined;
    const left = remaining();
    if (!(left <= seconds) || !apply(fadeLevel(left, seconds))) {
      done();
      return;
    }
    frame = clock.nextFrame(step);
  };
  frame = clock.nextFrame(step);
  return stop;
}

export function volumeIsSettable(media: { volume: number }): boolean {
  const before = media.volume;
  const probe = before === FULL ? FULL / 2 : FULL;
  media.volume = probe;
  const settable = media.volume === probe;
  media.volume = before;
  return settable;
}
