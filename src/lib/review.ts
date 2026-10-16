export const REVIEW_SIZE = 5;

const REVIEW_AGES = new Map([
  [1, "Saved yesterday"],
  [7, "Saved a week ago"],
  [30, "Saved a month ago"],
  [90, "Saved 3 months ago"],
]);

const NEWS_AGES = new Set([1, 7]);

const BACKLOG_REASON = "From your backlog";
const DAY_MS = 86_400_000;

export type ReviewPick = { id: string; reason: string };

type Saved = { id: string; savedAt: Date; shelfLife: "news" | "evergreen" };

export function localDay(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

function anniversaryReason(saved: string, today: string): string | undefined {
  const years = Number(today.slice(0, 4)) - Number(saved.slice(0, 4));
  if (years < 1 || saved.slice(5) !== today.slice(5)) return undefined;
  return years === 1 ? "Saved a year ago today" : `Saved ${years} years ago today`;
}

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (const char of text) {
    value ^= char.codePointAt(0) ?? 0;
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

export function dailyReview({
  bookmarks,
  done,
  today,
  timeZone,
  size = REVIEW_SIZE,
}: {
  bookmarks: readonly Saved[];
  done: ReadonlySet<string>;
  today: string;
  timeZone?: string;
  size?: number;
}): ReviewPick[] {
  const candidates = bookmarks
    .filter(({ id }) => !done.has(id))
    .map(({ id, savedAt, shelfLife }) => {
      const saved = localDay(savedAt, timeZone);
      const age = daysBetween(saved, today);
      const news = shelfLife === "news";
      const reason = news
        ? NEWS_AGES.has(age)
          ? REVIEW_AGES.get(age)
          : undefined
        : (REVIEW_AGES.get(age) ?? anniversaryReason(saved, today));
      return { id, age, news, reason };
    })
    .filter(({ age }) => age >= 1);

  const due = candidates
    .flatMap(({ id, age, reason }) => (reason === undefined ? [] : [{ id, age, reason }]))
    .toSorted((a, b) => b.age - a.age)
    .slice(0, size)
    .map(({ id, reason }) => ({ id, reason }));

  const backlog = candidates
    .filter(({ news, reason }) => !news && reason === undefined)
    .toSorted((a, b) => hash(`${today}:${a.id}`) - hash(`${today}:${b.id}`))
    .slice(0, size - due.length)
    .map(({ id }) => ({ id, reason: BACKLOG_REASON }));

  return [...due, ...backlog];
}
