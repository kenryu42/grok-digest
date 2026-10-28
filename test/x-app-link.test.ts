import { describe, expect, it } from "vitest";
import {
  APP_WAIT_MS,
  appUrlOf,
  isPhone,
  openInXApp,
  shouldOpenWeb,
  statusIdOf,
  type AppAttempt,
} from "../src/lib/x-app-link.ts";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

describe("statusIdOf", () => {
  it("reads the status id from a post's link on x.com or twitter.com", () => {
    expect(statusIdOf("https://x.com/poteto/status/2110149626133438732")).toBe("2110149626133438732");
    expect(statusIdOf("https://twitter.com/a_b/status/42?s=20")).toBe("42");
    expect(statusIdOf("https://mobile.x.com/ann/status/7/photo/1")).toBe("7");
    expect(statusIdOf("https://www.twitter.com/ann/status/7#reply")).toBe("7");
  });

  it("ignores links that are not a post on X", () => {
    expect(statusIdOf("https://x.com/poteto")).toBeUndefined();
    expect(statusIdOf("https://x.com/poteto/status/abc")).toBeUndefined();
    expect(statusIdOf("https://notx.com/poteto/status/1")).toBeUndefined();
    expect(statusIdOf("https://example.com/?u=https://x.com/a/status/1")).toBeUndefined();
    expect(statusIdOf("/#b-1")).toBeUndefined();
    expect(statusIdOf("https://t.co/Xq7mPLe0Ab")).toBeUndefined();
  });
});

describe("isPhone", () => {
  it("is true on iOS and Android, including an iPad that reports a Mac", () => {
    expect(isPhone({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(isPhone({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(true);
    expect(isPhone({ userAgent: MAC_SAFARI, maxTouchPoints: 5 })).toBe(true);
  });

  it("is false on a desktop", () => {
    expect(isPhone({ userAgent: MAC_SAFARI, maxTouchPoints: 0 })).toBe(false);
    expect(isPhone({ userAgent: WINDOWS_CHROME, maxTouchPoints: 10 })).toBe(false);
  });
});

describe("shouldOpenWeb", () => {
  it("opens the web page only when the page stayed and the timer ran on time", () => {
    expect(shouldOpenWeb({ leftPage: false, elapsedMs: APP_WAIT_MS })).toBe(true);
    expect(shouldOpenWeb({ leftPage: true, elapsedMs: APP_WAIT_MS })).toBe(false);
    expect(shouldOpenWeb({ leftPage: false, elapsedMs: APP_WAIT_MS * 10 })).toBe(false);
  });
});

function attempt({ leaves, timerDelayMs = APP_WAIT_MS }: { leaves: boolean; timerDelayMs?: number }) {
  const visited: string[] = [];
  let clock = 0;
  let settled = false;
  const page: AppAttempt = {
    navigate: (url) => visited.push(url),
    now: () => clock,
    later: (run) => {
      clock += timerDelayMs;
      run();
    },
    leftPage: () => leaves,
    settled: () => (settled = true),
  };
  openInXApp("42", "https://x.com/ann/status/42", page);
  return { visited, settled };
}

describe("openInXApp", () => {
  it("tries the app, then opens the post on the web when the app did not take over", () => {
    expect(attempt({ leaves: false })).toEqual({
      visited: [appUrlOf("42"), "https://x.com/ann/status/42"],
      settled: true,
    });
  });

  it("stays in the app when the page was left or the timer ran late", () => {
    expect(attempt({ leaves: true }).visited).toEqual(["twitter://status?id=42"]);
    expect(attempt({ leaves: false, timerDelayMs: APP_WAIT_MS * 5 }).visited).toEqual(["twitter://status?id=42"]);
  });
});
