import { z } from "zod";
import { parseDataFile, type Bookmark } from "./bookmarks.ts";
import { TOPICS } from "./topics.ts";

export const MAGAZINE_DIR = "magazine";
export const MAGAZINE_PALETTES = ["classic", "newsprint", "ocean", "forest", "sunset", "plum"] as const;
export const MAGAZINE_FONTS = ["serif", "sans", "serif-sans", "sans-serif", "mono-serif"] as const;
export const MAGAZINE_EMPHASES = ["quiet", "normal", "loud"] as const;

const ISSUE_FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.json$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const shortText = (max: number) => z.string().trim().min(1).max(max);
const headline = shortText(120);
const deck = shortText(280);
const label = shortText(40);
const note = shortText(200);
const bookmarkId = z.string().trim().min(1);

const blockStyle = <const Variants extends readonly [string, ...string[]]>(variants: Variants) => ({
  variant: z.enum(variants).default(variants[0]),
  emphasis: z.enum(MAGAZINE_EMPHASES).default("normal"),
});

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
    items: items({ caption: note.optional() }, { min: 1, max: 6 }),
    ...blockStyle(["grid", "mosaic", "filmstrip"]),
  }),
  z.strictObject({
    type: z.literal("brief-grid"),
    headline: headline.optional(),
    columns: z.literal([2, 3, 4]).default(2),
    items: items({ headline: headline.optional() }, { min: 2, max: 12 }),
    ...blockStyle(["cards", "plain"]),
  }),
  z.strictObject({
    type: z.literal("numbered-list"),
    headline: headline.optional(),
    items: items({ headline: headline.optional(), note: note.optional() }, { min: 2, max: 10 }),
    ...blockStyle(["large", "compact"]),
  }),
  z.strictObject({
    type: z.literal("compare"),
    headline: headline.optional(),
    items: items({ label: label.optional() }, { min: 2, max: 2 }),
    verdict: deck.optional(),
    ...blockStyle(["cards", "versus"]),
  }),
  z.strictObject({
    type: z.literal("timeline"),
    headline: headline.optional(),
    items: items({ label: label.optional() }, { min: 2, max: 12 }),
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
export type FindBookmark = (id: string) => Bookmark;

type Reference = { path: (string | number)[]; id: string };

const referencesIn = (block: MagazineBlock): Reference[] => {
  if ("bookmark" in block) return [{ path: ["bookmark"], id: block.bookmark }];
  if ("items" in block)
    return block.items.map(({ bookmark }, index) => ({ path: ["items", index, "bookmark"], id: bookmark }));
  return [];
};

export const referencedIds = (issue: MagazineIssue): string[] => [
  ...new Set(issue.sections.flatMap((block) => referencesIn(block).map(({ id }) => id))),
];

const collapseSpaces = (text: string): string => text.replaceAll(/\s+/g, " ").trim();

function blockProblems(block: MagazineBlock, bookmark: Bookmark): { field: string; message: string } | undefined {
  if (block.type === "pull-quote" && !collapseSpaces(bookmark.text).includes(collapseSpaces(block.quote))) {
    return { field: "quote", message: `must be copied word for word from the text of bookmark "${bookmark.id}"` };
  }
  if (block.type === "photo-spread" && bookmark.media.length === 0) {
    return { field: "bookmark", message: `bookmark "${bookmark.id}" has no media to show` };
  }
  if (block.type === "sidebar-box" && bookmark.action === "") {
    return { field: "bookmark", message: `bookmark "${bookmark.id}" has no action to show` };
  }
  return undefined;
}

const issueFileName = (source: string): string => source.split(/[/\\]/).at(-1) ?? source;

type BookmarkIndex = ReadonlyMap<string, Bookmark>;

const indexBookmarks = (bookmarks: readonly Bookmark[]): BookmarkIndex =>
  new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));

function issueFileSchema({ source, byId }: { source: string; byId: BookmarkIndex }) {
  const fileName = issueFileName(source);
  const fileDate = ISSUE_FILE_NAME.exec(fileName)?.[1];
  return magazineIssueSchema.superRefine((issue, ctx) => {
    if (fileDate === undefined) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: `the file name must be the issue's date, such as ${issue.date}.json`,
      });
    } else if (issue.date !== fileDate) {
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: `"${issue.date}" does not match the file name ${fileName}`,
      });
    }
    issue.sections.forEach((block, index) => {
      for (const { path, id } of referencesIn(block)) {
        const bookmark = byId.get(id);
        if (bookmark === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", index, ...path],
            message: `"${id}" is not a bookmark id in bookmarks.json`,
          });
          continue;
        }
        const problem = blockProblems(block, bookmark);
        if (problem !== undefined) {
          const field = problem.field === "bookmark" ? path : [problem.field];
          ctx.addIssue({ code: "custom", path: ["sections", index, ...field], message: problem.message });
        }
      }
    });
  });
}

export function parseMagazineIssue({
  raw,
  source,
  bookmarks,
}: {
  raw: unknown;
  source: string;
  bookmarks: readonly Bookmark[];
}): MagazineIssue {
  return parseDataFile({ schema: issueFileSchema({ source, byId: indexBookmarks(bookmarks) }), raw, source });
}

export type IssueFile = { source: string; raw: unknown };

export function parseMagazine({
  files,
  bookmarks,
}: {
  files: readonly IssueFile[];
  bookmarks: readonly Bookmark[];
}): MagazineIssue[] {
  const byId = indexBookmarks(bookmarks);
  return files
    .map(({ raw, source }) => parseDataFile({ schema: issueFileSchema({ source, byId }), raw, source }))
    .toSorted((a, b) => b.date.localeCompare(a.date));
}

export function bookmarkFinder(bookmarks: readonly Bookmark[]): FindBookmark {
  const byId = indexBookmarks(bookmarks);
  return (id) => {
    const bookmark = byId.get(id);
    if (bookmark === undefined) throw new Error(`No bookmark with id "${id}"`);
    return bookmark;
  };
}

const issueDateFormat = new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: "UTC" });
const shortDateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export const issueDateLabel = (date: string): string => issueDateFormat.format(new Date(date));
export const shortDateLabel = (date: Date): string => shortDateFormat.format(date);
