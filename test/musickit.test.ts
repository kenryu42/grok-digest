import { describe, expect, it } from "vitest";
import { type MusicKitPlayer, playQueuedSong } from "../src/lib/musickit.ts";

function fakeMusicKit({
  signedIn,
  signIn,
  playing = true,
}: {
  signedIn: boolean;
  signIn: "accept" | "decline";
  playing?: boolean;
}) {
  const calls: string[] = [];
  let authorized = signedIn;
  const player: MusicKitPlayer = {
    get isAuthorized() {
      return authorized;
    },
    authorize: () => {
      calls.push("authorize");
      if (signIn === "decline") return Promise.reject(new Error("AUTHORIZATION_ERROR: Unauthorized"));
      authorized = true;
      return Promise.resolve("music-user-token");
    },
    setQueue: () => Promise.resolve(),
    play: () => {
      calls.push("play");
      return playing ? Promise.resolve() : Promise.reject(new Error("MEDIA_KEY"));
    },
    pause: () => calls.push("pause"),
  };
  return { player, calls };
}

const firstTap = { askToSignIn: true };
const laterTap = { askToSignIn: false };

describe("playQueuedSong", () => {
  it("asks a reader who is not signed in to sign in within the tap, before anything waits, then plays", async () => {
    const { player, calls } = fakeMusicKit({ signedIn: false, signIn: "accept" });
    const playback = playQueuedSong(player, firstTap);
    expect(calls).toEqual(["authorize"]);
    expect(await playback).toBe("signed-in");
    expect(calls).toEqual(["authorize", "play"]);
  });

  it("plays a preview when the reader declines, and does not ask again on a later tap", async () => {
    const { player, calls } = fakeMusicKit({ signedIn: false, signIn: "decline" });
    expect(await playQueuedSong(player, firstTap)).toBe("preview");
    expect(await playQueuedSong(player, laterTap)).toBe("preview");
    expect(calls).toEqual(["authorize", "play", "play"]);
  });

  it("plays at once for a reader already signed in", async () => {
    const { player, calls } = fakeMusicKit({ signedIn: true, signIn: "decline" });
    expect(await playQueuedSong(player, firstTap)).toBe("signed-in");
    expect(calls).toEqual(["play"]);
  });

  it("rejects when MusicKit cannot play, so the page can offer another tap and the Apple Music link", async () => {
    const { player } = fakeMusicKit({ signedIn: false, signIn: "decline", playing: false });
    await expect(playQueuedSong(player, firstTap)).rejects.toThrow("MEDIA_KEY");
  });
});
