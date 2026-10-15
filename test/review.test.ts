import { describe, expect, it } from "vitest";
import { dailyReview, REVIEW_SIZE } from "../src/lib/review.ts";

const TOKYO = "Asia/Tokyo";
const TODAY = "2026-10-15";

const savedOn = (id: string, savedAt: string) => ({ id, savedAt: new Date(savedAt) });

const review = (bookmarks: { id: string; savedAt: Date }[], done: string[] = [], today = TODAY) =>
  dailyReview({ bookmarks, done: new Set(done), today, timeZone: TOKYO });

describe("dailyReview", () => {
  it("brings back bookmarks saved a day, a week, a month and three months ago, oldest first", () => {
    const picks = review([
      savedOn("yesterday", "2026-10-14T22:00:00+09:00"),
      savedOn("week", "2026-10-08T09:00:00+09:00"),
      savedOn("month", "2026-09-15T09:00:00+09:00"),
      savedOn("quarter", "2026-07-17T09:00:00+09:00"),
    ]);
    expect(picks).toEqual([
      { id: "quarter", reason: "Saved 3 months ago" },
      { id: "month", reason: "Saved a month ago" },
      { id: "week", reason: "Saved a week ago" },
      { id: "yesterday", reason: "Saved yesterday" },
    ]);
  });

  it("brings back bookmarks saved on this date in earlier years", () => {
    expect(review([savedOn("one", "2025-10-15T12:00:00+09:00"), savedOn("two", "2024-10-15T12:00:00+09:00")])).toEqual([
      { id: "two", reason: "Saved 2 years ago today" },
      { id: "one", reason: "Saved a year ago today" },
    ]);
  });

  it("counts days in the reader's time zone", () => {
    const justAfterMidnightInTokyo = savedOn("late", "2026-10-14T15:30:00Z");
    expect(review([justAfterMidnightInTokyo])).toEqual([]);
    expect(
      dailyReview({ bookmarks: [justAfterMidnightInTokyo], done: new Set(), today: TODAY, timeZone: "UTC" }),
    ).toEqual([{ id: "late", reason: "Saved yesterday" }]);
  });

  it("skips what is done and what was saved today", () => {
    expect(
      review([savedOn("done", "2026-10-14T09:00:00+09:00"), savedOn("fresh", "2026-10-15T08:00:00+09:00")], ["done"]),
    ).toEqual([]);
  });

  it("fills the rest from the backlog, the same picks all day and different ones the next", () => {
    const backlog = Array.from({ length: 40 }, (_, day) =>
      savedOn(`old-${day}`, new Date(Date.UTC(2026, 3, 1 + day, 3)).toISOString()),
    );
    const bookmarks = [savedOn("week", "2026-10-08T09:00:00+09:00"), ...backlog];
    const picks = review(bookmarks);

    expect(picks).toHaveLength(REVIEW_SIZE);
    expect(picks[0]).toEqual({ id: "week", reason: "Saved a week ago" });
    expect(picks.slice(1).every(({ id, reason }) => id.startsWith("old-") && reason === "From your backlog")).toBe(
      true,
    );
    expect(review(bookmarks)).toEqual(picks);
    expect(review(backlog, [], "2026-10-16")).not.toEqual(review(backlog));
  });

  it("shows at most five due bookmarks", () => {
    const due = Array.from({ length: 8 }, (_, year) => savedOn(`y${year}`, `${2018 + year}-10-15T12:00:00+09:00`));
    expect(review(due)).toHaveLength(REVIEW_SIZE);
  });
});
