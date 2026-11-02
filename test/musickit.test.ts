import { describe, expect, it } from "vitest";
import {
  PREVIEW_BADGES,
  PREVIEW_ENDED,
  positionText,
  previewReason,
  SKIP_SECONDS,
  skipTarget,
} from "../src/lib/musickit.ts";

const SONG_MS = 185_733;

describe("previewReason", () => {
  it("calls it a preview that needs sign-in while the reader is signed out", () => {
    expect(
      previewReason({ authorized: false, subscribed: false, playbackSeconds: 30, catalogMilliseconds: SONG_MS }),
    ).toBe("sign-in");
    expect(PREVIEW_BADGES["sign-in"]).toBe("Preview · sign in for the full song");
    expect(PREVIEW_ENDED["sign-in"]).toContain("Sign in to Apple Music for the full song");
  });

  it("calls it a preview that needs a subscription when signed in without one", () => {
    expect(
      previewReason({ authorized: true, subscribed: false, playbackSeconds: 0, catalogMilliseconds: SONG_MS }),
    ).toBe("subscription");
    expect(PREVIEW_BADGES.subscription).toBe("Preview · Apple Music subscription needed");
  });

  it("trusts the playback length over the subscription check: 30 seconds of a 3-minute song is a preview", () => {
    expect(
      previewReason({ authorized: true, subscribed: true, playbackSeconds: 30, catalogMilliseconds: SONG_MS }),
    ).toBe("subscription");
    expect(
      previewReason({ authorized: true, subscribed: true, playbackSeconds: 185.7, catalogMilliseconds: SONG_MS }),
    ).toBeUndefined();
    expect(
      previewReason({ authorized: true, subscribed: true, playbackSeconds: 0, catalogMilliseconds: undefined }),
    ).toBeUndefined();
  });
});

describe("the mini player's controls", () => {
  it("skips 15 seconds back or forward, staying within the song", () => {
    expect(SKIP_SECONDS).toBe(15);
    expect(skipTarget(40, SKIP_SECONDS, 185)).toBe(55);
    expect(skipTarget(40, -SKIP_SECONDS, 185)).toBe(25);
    expect(skipTarget(5, -SKIP_SECONDS, 185)).toBe(0);
    expect(skipTarget(180, SKIP_SECONDS, 185)).toBe(185);
    expect(skipTarget(0, SKIP_SECONDS, 0)).toBe(0);
  });

  it("speaks the position as time of length", () => {
    expect(positionText(75, 185.7)).toBe("1:15 of 3:05");
  });
});
