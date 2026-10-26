import type { ImageMetadata } from "astro";
import { z } from "zod";
import { parseDataFile } from "./bookmarks.ts";
import type { Post, PostRef } from "./posts.ts";
import { TOPIC_LABELS, TOPICS } from "./topics.ts";

export const MAGAZINE_DIR = "magazine";
export const MAGAZINE_PALETTES = ["classic", "newsprint", "ocean", "forest", "sunset", "plum"] as const;
export const MAGAZINE_FONTS = ["serif", "sans", "serif-sans", "sans-serif", "mono-serif"] as const;
export const MAGAZINE_EMPHASES = ["quiet", "normal", "loud"] as const;
export const MAGAZINE_SPANS = ["full", "half"] as const;
export const MAGAZINE_CORNERS = [
  "brief",
  "lead",
  "your-saves",
  "field-notes",
  "japan-desk",
  "adjacent",
  "open-window",
  "kicker",
] as const;
export const MAGAZINE_TAGS = ["new-to-you", "unverified", "from-your-saves", "new-voice"] as const;

export type MagazineCorner = (typeof MAGAZINE_CORNERS)[number];
export type MagazineTag = (typeof MAGAZINE_TAGS)[number];

export const CORNER_LABELS: Record<MagazineCorner, string> = {
  brief: "The Brief",
  lead: "Lead",
  "your-saves": "Your saves",
  "field-notes": "Field notes",
  "japan-desk": "Japan desk",
  adjacent: "Adjacent",
  "open-window": "Open Window",
  kicker: "Kicker",
};

export const INTEREST_CORNERS: readonly MagazineCorner[] = ["brief", "lead", "field-notes", "japan-desk"];

export const TAG_LABELS: Record<MagazineTag, string> = {
  "new-to-you": "New to you",
  unverified: "Unverified",
  "from-your-saves": "From your saves",
  "new-voice": "New voice",
};

const ISSUE_FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.json$/;
export const PICTURE_EXTENSIONS = [".jpg", ".png", ".webp"] as const;
const COVER_FILE_NAME = /^\d{4}-\d{2}-\d{2}\.(?:jpg|png|webp)$/;
const PATH_INSIDE_FOLDER = /^[\w-][\w.-]*(?:\/[\w-][\w.-]*)*$/;
const PICTURE_FILE = /\.(?:jpg|png|webp)$/;
const ISSUE_FOLDER = /^\d{4}-\d{2}-\d{2}\//;
export const ART_MIN_SIZE = { width: 1200, height: 800 } as const;
const MAX_BLOCK_ARTS = 3;
const MAX_IMAGES_OF_THE_DAY = 1;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const isIssueFileName = (name: string): boolean => ISSUE_FILE_NAME.test(name);
export const isCoverFileName = (name: string): boolean => COVER_FILE_NAME.test(name);
const isArtPath = (art: string): boolean => PATH_INSIDE_FOLDER.test(art) && PICTURE_FILE.test(art);
export const isArtFileName = (name: string): boolean =>
  ISSUE_FOLDER.test(name) && isArtPath(name.replace(ISSUE_FOLDER, ""));
export const coverFileNames = (date: string): string[] => PICTURE_EXTENSIONS.map((extension) => `${date}${extension}`);
export const artFileName = (date: string, art: string): string => `${date}/${art}`;

type PictureSize = { width: number; height: number };

const PICTURE_WIDTHS = [240, 360, 480, 720, 960, 1200];

export const pictureWidths = (width: number): number[] => [...PICTURE_WIDTHS.filter((each) => each < width), width];

export const isLargeEnoughArt = ({ width, height }: PictureSize): boolean =>
  width >= ART_MIN_SIZE.width && height >= ART_MIN_SIZE.height;

const shortText = (max: number) => z.string().trim().min(1).max(max);
const headline = shortText(120);
const deck = shortText(280);
const label = shortText(40);
const note = shortText(200);
const postId = z.string().trim().min(1);
const reference = { bookmark: postId.optional(), scan: postId.optional() };
const itemMeta = {
  why: note.optional(),
  tags: z.array(z.enum(MAGAZINE_TAGS)).max(MAGAZINE_TAGS.length).default([]),
  source_label: label.optional(),
};

const artPath = z
  .string()
  .regex(
    PATH_INSIDE_FOLDER,
    "must be a file in the issue's own folder, such as harbor.jpg, with no URL, absolute path, or ..",
  )
  .regex(PICTURE_FILE, `must end in ${PICTURE_EXTENSIONS.join(", ")}`);
const artFields = { art: artPath.optional(), art_alt: note.optional() };

type Reference = { bookmark?: string | undefined; scan?: string | undefined };

type IssueSink = { addIssue: (issue: { code: "custom"; message: string }) => void };

function oneReference({ bookmark, scan }: Reference, ctx: IssueSink): void {
  if ((bookmark === undefined) === (scan === undefined)) {
    ctx.addIssue({ code: "custom", message: 'give either "bookmark" or "scan", not both' });
  }
}

export const refOf = ({ bookmark, scan }: Reference): PostRef =>
  scan === undefined ? { source: "bookmark", id: bookmark ?? "" } : { source: "scan", id: scan };

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

const items = <Item extends z.ZodType<Reference>>(item: Item, { min, max }: { min: number; max: number }) =>
  z.array(item.superRefine(oneReference)).min(min).max(max);

const item = <Shape extends z.ZodRawShape>(shape: Shape) => z.strictObject({ ...reference, ...shape, ...itemMeta });

const fixedStyle = {
  variant: z.enum(["standard"]).default("standard"),
  emphasis: z.enum(["normal"]).default("normal"),
  span: z.enum(["full"]).default("full"),
};

const blockSchemas = [
  z
    .strictObject({
      type: z.literal("cover-story"),
      ...reference,
      kicker: label.optional(),
      headline,
      deck: deck.optional(),
      ...artFields,
      ...itemMeta,
      ...blockStyle(["stacked", "overlay", "split"]),
    })
    .superRefine(oneReference),
  z
    .strictObject({
      type: z.literal("feature"),
      ...reference,
      headline: headline.optional(),
      deck: deck.optional(),
      ...artFields,
      ...itemMeta,
      ...blockStyle(["standard", "aside", "drop-cap"]),
    })
    .superRefine(oneReference),
  z
    .strictObject({
      type: z.literal("pull-quote"),
      ...reference,
      quote: shortText(300),
      ...blockStyle(["centered", "bar"]),
    })
    .superRefine(oneReference),
  z.strictObject({
    type: z.literal("photo-spread"),
    headline: headline.optional(),
    items: items(item({ caption: note.optional() }), ITEM_LIMITS["photo-spread"]),
    ...blockStyle(["grid", "mosaic", "filmstrip"]),
  }),
  z.strictObject({
    type: z.literal("brief-grid"),
    headline: headline.optional(),
    columns: z.literal([2, 3, 4]).default(2),
    items: items(item({ headline: headline.optional(), note: note.optional() }), ITEM_LIMITS["brief-grid"]),
    ...blockStyle(["cards", "plain"]),
  }),
  z.strictObject({
    type: z.literal("numbered-list"),
    headline: headline.optional(),
    items: items(item({ headline: headline.optional(), note: note.optional() }), ITEM_LIMITS["numbered-list"]),
    ...blockStyle(["large", "compact"]),
  }),
  z.strictObject({
    type: z.literal("compare"),
    headline: headline.optional(),
    items: items(item({ label: label.optional(), note: note.optional() }), ITEM_LIMITS.compare),
    verdict: deck.optional(),
    ...blockStyle(["cards", "versus"]),
  }),
  z.strictObject({
    type: z.literal("timeline"),
    headline: headline.optional(),
    items: items(item({ label: label.optional(), note: note.optional() }), ITEM_LIMITS.timeline),
    ...blockStyle(["vertical", "compact"]),
  }),
  z.strictObject({
    type: z.literal("topic-divider"),
    topic: z.enum(TOPICS),
    label: label.optional(),
    ...blockStyle(["rule", "band"]),
  }),
  z
    .strictObject({
      type: z.literal("sidebar-box"),
      ...reference,
      headline: label.optional(),
      ...blockStyle(["note", "callout"]),
    })
    .superRefine(oneReference),
  z.strictObject({
    type: z.literal("corner"),
    corner: z.enum(MAGAZINE_CORNERS),
    label: label.optional(),
    deck: deck.optional(),
    ...fixedStyle,
  }),
  z.strictObject({
    type: z.literal("image-of-the-day"),
    art: artPath,
    art_alt: note.optional(),
    headline: headline.optional(),
    caption: note,
    ...fixedStyle,
  }),
  z
    .strictObject({
      type: z.literal("closer"),
      ...reference,
      headline: headline.optional(),
      note: note.optional(),
      ...itemMeta,
      ...blockStyle(["text", "photo"]),
    })
    .superRefine(oneReference),
] as const;

export const MAGAZINE_BLOCK_TYPES = blockSchemas.map((schema) => schema.shape.type.value);

export const magazineBlockSchema = z.discriminatedUnion("type", blockSchemas);

type ParsedBlock = z.output<typeof magazineBlockSchema>;

type ArtLimit = { counts: (block: ParsedBlock) => boolean; max: number; what: string };

const ART_LIMITS: readonly ArtLimit[] = [
  {
    counts: (block) => block.type !== "image-of-the-day" && "art" in block && block.art !== undefined,
    max: MAX_BLOCK_ARTS,
    what: 'blocks with "art"',
  },
  {
    counts: (block) => block.type === "image-of-the-day",
    max: MAX_IMAGES_OF_THE_DAY,
    what: '"image-of-the-day" block',
  },
];

function limitArt(sections: ParsedBlock[], ctx: z.RefinementCtx): void {
  for (const { counts, max, what } of ART_LIMITS) {
    const over = sections.flatMap((block, index) => (counts(block) ? [index] : [])).slice(max);
    for (const index of over) {
      ctx.addIssue({ code: "custom", path: [index], message: `an issue takes at most ${max} ${what}` });
    }
  }
}

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
  sections: z.array(magazineBlockSchema).min(1).max(30).superRefine(limitArt),
});

export type MagazineIssue = z.output<typeof magazineIssueSchema>;
export type MagazineBlock = MagazineIssue["sections"][number];
type MagazineBlockType = MagazineBlock["type"];
export type BlockOf<Type extends MagazineBlockType> = Extract<MagazineBlock, { type: Type }>;
export type ItemsBlock = BlockOf<keyof typeof ITEM_LIMITS>;
export type CoveredIssue = MagazineIssue & {
  cover: ImageMetadata | undefined;
  art: ReadonlyMap<string, ImageMetadata>;
};
export type PublishedIssue = CoveredIssue & { number: number };
export type FindEntry = (ref: PostRef) => Post;
export type ItemMeta = { why?: string | undefined; tags: MagazineTag[]; source_label?: string | undefined };

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

export type IssueFile = {
  source: string;
  raw: unknown;
  cover?: ImageMetadata | undefined;
  art?: Record<string, ImageMetadata> | undefined;
};

const artReference = z.object({ art: artPath });

export function artPathsIn(raw: unknown): string[] {
  const issue = z.object({ sections: z.array(z.unknown()) }).safeParse(raw);
  if (!issue.success) return [];
  return issue.data.sections.flatMap((block) => {
    const named = artReference.safeParse(block);
    return named.success ? [named.data.art] : [];
  });
}

function withUsableArt(file: IssueFile): CoveredIssue {
  const issue = parseMagazineIssue(file);
  const art = new Map(Object.entries(file.art ?? {}).filter(([, picture]) => isLargeEnoughArt(picture)));
  const sections = issue.sections.flatMap((block): MagazineBlock[] => {
    if (!("art" in block) || block.art === undefined || art.has(block.art)) return [block];
    return block.type === "image-of-the-day" ? [] : [{ ...block, art: undefined }];
  });
  return { ...issue, sections, cover: file.cover, art };
}

export const parseMagazine = (files: readonly IssueFile[]): CoveredIssue[] =>
  files.map(withUsableArt).toSorted((a, b) => b.date.localeCompare(a.date));

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

export function issueMonthLabel(date: string): string {
  const { year, month } = dateParts(date);
  return `${MONTHS[month - 1]} ${year}`;
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

export function sectionHeading(block: MagazineBlock, find: FindEntry): string | undefined {
  if (block.type === "pull-quote" || block.type === "sidebar-box" || block.type === "corner") return undefined;
  if (block.type === "feature" || block.type === "closer") return block.headline ?? find(refOf(block)).tldr;
  if (block.type === "topic-divider") return block.label ?? TOPIC_LABELS[block.topic];
  return block.headline;
}

export const cornerLabel = (block: BlockOf<"corner">): string => block.label ?? CORNER_LABELS[block.corner];

export const cornerNumber = (corner: MagazineCorner): string =>
  String(MAGAZINE_CORNERS.indexOf(corner) + 1).padStart(2, "0");

type ContentsEntry = { heading: string; anchor: string };
type ContentsGroup = { corner: ContentsEntry | undefined; entries: ContentsEntry[] };

export function issueContents(
  sections: readonly MagazineBlock[],
  find: FindEntry,
  anchorOf: (index: number) => string,
): ContentsGroup[] {
  const groups: ContentsGroup[] = [{ corner: undefined, entries: [] }];
  sections.forEach((block, index) => {
    if (block.type === "corner") {
      groups.push({ corner: { heading: cornerLabel(block), anchor: anchorOf(index) }, entries: [] });
      return;
    }
    const heading = sectionHeading(block, find);
    if (heading !== undefined) groups.at(-1)?.entries.push({ heading, anchor: anchorOf(index) });
  });
  return groups.filter(({ corner, entries }) => corner !== undefined || entries.length > 0);
}

const postedDateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export const postedDateLabel = (date: Date): string => postedDateFormat.format(date);
