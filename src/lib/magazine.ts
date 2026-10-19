import { z } from "zod";
import { parseDataFile, type Bookmark } from "./bookmarks.ts";
import { TOPIC_LABELS, TOPICS } from "./topics.ts";

export const MAGAZINE_DIR = "magazine";
export const MAGAZINE_PALETTES = ["classic", "newsprint", "ocean", "forest", "sunset", "plum"] as const;
export const MAGAZINE_FONTS = ["serif", "sans", "serif-sans", "sans-serif", "mono-serif"] as const;
export const MAGAZINE_EMPHASES = ["quiet", "normal", "loud"] as const;
export const MAGAZINE_SPANS = ["full", "half"] as const;

const ISSUE_FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.json$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const isIssueFileName = (name: string): boolean => ISSUE_FILE_NAME.test(name);

const shortText = (max: number) => z.string().trim().min(1).max(max);
const headline = shortText(120);
const deck = shortText(280);
const label = shortText(40);
const note = shortText(200);
const bookmarkId = z.string().trim().min(1);

const blockStyle = <const Variants extends readonly [string, ...string[]]>(variants: Variants) => ({
  variant: z.enum(variants).default(variants[0]),
  emphasis: z.enum(MAGAZINE_EMPHASES).default("normal"),
  span: z.enum(MAGAZINE_SPANS).default("full"),
});

export const ITEM_LIMITS = {
  "photo-spread": { min: 1, max: 6 },
  "brief-grid": { min: 2, max: 12 },
  "numbered-list": { min: 2, max: 10 },
  compare: { min: 2, max: 2 },
  timeline: { min: 2, max: 12 },
} as const;

const items = <Shape extends z.ZodRawShape>(shape: Shape, { min, max }: { min: number; max: number }) =>
  z
    .array(z.strictObject({ bookmark: bookmarkId, ...shape }))
    .min(min)
    .max(max);

const blockSchemas = [
  z.strictObject({
    type: z.literal("cover-story"),
    bookmark: bookmarkId,
    kicker: label.optional(),
    headline,
    deck: deck.optional(),
    ...blockStyle(["stacked", "overlay", "split"]),
  }),
  z.strictObject({
    type: z.literal("feature"),
    bookmark: bookmarkId,
    headline: headline.optional(),
    deck: deck.optional(),
    ...blockStyle(["standard", "aside", "drop-cap"]),
  }),
  z.strictObject({
    type: z.literal("pull-quote"),
    bookmark: bookmarkId,
    quote: shortText(300),
    ...blockStyle(["centered", "bar"]),
  }),
  z.strictObject({
    type: z.literal("photo-spread"),
    headline: headline.optional(),
    items: items({ caption: note.optional() }, ITEM_LIMITS["photo-spread"]),
    ...blockStyle(["grid", "mosaic", "filmstrip"]),
  }),
  z.strictObject({
    type: z.literal("brief-grid"),
    headline: headline.optional(),
    columns: z.literal([2, 3, 4]).default(2),
    items: items({ headline: headline.optional(), note: note.optional() }, ITEM_LIMITS["brief-grid"]),
    ...blockStyle(["cards", "plain"]),
  }),
  z.strictObject({
    type: z.literal("numbered-list"),
    headline: headline.optional(),
    items: items({ headline: headline.optional(), note: note.optional() }, ITEM_LIMITS["numbered-list"]),
    ...blockStyle(["large", "compact"]),
  }),
  z.strictObject({
    type: z.literal("compare"),
    headline: headline.optional(),
    items: items({ label: label.optional(), note: note.optional() }, ITEM_LIMITS.compare),
    verdict: deck.optional(),
    ...blockStyle(["cards", "versus"]),
  }),
  z.strictObject({
    type: z.literal("timeline"),
    headline: headline.optional(),
    items: items({ label: label.optional(), note: note.optional() }, ITEM_LIMITS.timeline),
    ...blockStyle(["vertical", "compact"]),
  }),
  z.strictObject({
    type: z.literal("topic-divider"),
    topic: z.enum(TOPICS),
    label: label.optional(),
    ...blockStyle(["rule", "band"]),
  }),
  z.strictObject({
    type: z.literal("sidebar-box"),
    bookmark: bookmarkId,
    headline: label.optional(),
    ...blockStyle(["note", "callout"]),
  }),
] as const;

export const MAGAZINE_BLOCK_TYPES = blockSchemas.map((schema) => schema.shape.type.value);

export const magazineBlockSchema = z.discriminatedUnion("type", blockSchemas);

export const magazineIssueSchema = z.strictObject({
  date: z.iso.date(),
  title: shortText(80),
  subtitle: shortText(160).optional(),
  editor_note: shortText(1000).optional(),
  theme: z.strictObject({
    palette: z.enum(MAGAZINE_PALETTES),
    fonts: z.enum(MAGAZINE_FONTS),
    accent: z.string().regex(HEX_COLOR, "must be a color such as #1d4ed8").optional(),
  }),
  sections: z.array(magazineBlockSchema).min(1).max(30),
});

export type MagazineIssue = z.output<typeof magazineIssueSchema>;
export type MagazineBlock = MagazineIssue["sections"][number];
type MagazineBlockType = MagazineBlock["type"];
export type BlockOf<Type extends MagazineBlockType> = Extract<MagazineBlock, { type: Type }>;
export type ItemsBlock = BlockOf<keyof typeof ITEM_LIMITS>;
export type PublishedIssue = MagazineIssue & { number: number };
export type FindBookmark = (id: string) => Bookmark;

const issueFileName = (source: string): string => source.split(/[/\\]/).at(-1) ?? source;

export function parseMagazineIssue({ raw, source }: { raw: unknown; source: string }): MagazineIssue {
  const fileName = issueFileName(source);
  const fileDate = ISSUE_FILE_NAME.exec(fileName)?.[1];
  if (fileDate === undefined) {
    throw new Error(`${source} is not an issue: name an issue after its date, such as 2026-10-19.json`);
  }
  const schema = magazineIssueSchema.refine((issue) => issue.date === fileDate, {
    path: ["date"],
    message: `must match the file name ${fileName}`,
  });
  return parseDataFile({ schema, raw, source });
}

export type IssueFile = { source: string; raw: unknown };

export const parseMagazine = (files: readonly IssueFile[]): MagazineIssue[] =>
  files.map(parseMagazineIssue).toSorted((a, b) => b.date.localeCompare(a.date));

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const SAKAMOTO_MONTH_OFFSETS = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;

function dateParts(date: string): { year: number; month: number; day: number } {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return { year, month, day };
}

function weekdayOf({ year, month, day }: { year: number; month: number; day: number }): number {
  const shifted = month < 3 ? year - 1 : year;
  const leapDays = Math.floor(shifted / 4) - Math.floor(shifted / 100) + Math.floor(shifted / 400);
  return (shifted + leapDays + (SAKAMOTO_MONTH_OFFSETS[month - 1] ?? 0) + day) % 7;
}

export function issueDateLabel(date: string): string {
  const parts = dateParts(date);
  return `${WEEKDAYS[weekdayOf(parts)]}, ${MONTHS[parts.month - 1]} ${parts.day}, ${parts.year}`;
}

export function issueShortDateLabel(date: string): string {
  const { year, month, day } = dateParts(date);
  return `${MONTHS[month - 1]?.slice(0, 3)} ${day}, ${year}`;
}

export function issueDay(date: string): Date {
  const { year, month, day } = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

export const themeAttributes = ({ palette, fonts, accent }: MagazineIssue["theme"]) => ({
  "data-palette": palette,
  "data-fonts": fonts,
  style: accent === undefined ? undefined : { "--issue-accent": accent },
});

export function sectionHeading(block: MagazineBlock, find: FindBookmark): string | undefined {
  if (block.type === "pull-quote" || block.type === "sidebar-box") return undefined;
  if (block.type === "feature") return block.headline ?? find(block.bookmark).tldr;
  if (block.type === "topic-divider") return block.label ?? TOPIC_LABELS[block.topic];
  return block.headline;
}

const postedDateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export const postedDateLabel = (date: Date): string => postedDateFormat.format(date);
