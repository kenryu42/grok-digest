export type MusicKitPlayer = {
  readonly isAuthorized: boolean;
  authorize: () => Promise<unknown>;
  setQueue: (options: { song: string; startPlaying: boolean }) => Promise<unknown>;
  play: () => Promise<unknown>;
  pause: () => void;
};

export type SongPlayback = "signed-in" | "preview";

export const PREVIEW_NOTE = "Playing a preview. Sign in to Apple Music for the full song.";
export const RETRY_NOTE = "The song did not start. Tap Play again, or open it in Apple Music.";

export async function playQueuedSong(
  player: MusicKitPlayer,
  { askToSignIn }: { askToSignIn: boolean },
): Promise<SongPlayback> {
  const signedIn =
    player.isAuthorized ||
    (askToSignIn &&
      (await player.authorize().then(
        () => player.isAuthorized,
        () => false,
      )));
  await player.play();
  return signedIn ? "signed-in" : "preview";
}
