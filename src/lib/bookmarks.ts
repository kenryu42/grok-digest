import { z } from "zod";
import { TOPICS } from "./topics.ts";

export const SCHEMA_VERSION = 1;

const X_HOSTNAME = /^(www\.|mobile\.)?(x|twitter)\.com$/;
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const X_MEDIA_HOSTNAME = /^pbs\.twimg\.com$/;

const nonEmpty = z.string().trim().min(1);
const instant = z.iso.datetime({ offset: true });

const SHELF_LIVES = ["news", "evergreen"] as const;

const postShape = {
  id: nonEmpty,
  url: z.url({ protocol: /^https$/, hostname: X_HOSTNAME }),
  author: z.strictObject({
    name: nonEmpty,
    handle: z
      .string()
      .trim()
      .transform((handle) => handle.replace(/^@/, ""))
      .pipe(z.string().regex(X_HANDLE, "must be an X handle such as @jack")),
  }),
  posted_at: z.union([z.iso.date(), instant]),
  saved_at: instant,
  topic: z.enum(TOPICS),
  shelf_life: z.enum(SHELF_LIVES),
  tldr: nonEmpty,
  summary: nonEmpty,
  text: z.string().trim(),
  key_points: z.array(nonEmpty),
  action: z.string().trim(),
  links: z.array(
    z.strictObject({
      title: nonEmpty,
      url: z.url({ protocol: /^https$/ }),
      image: z.url({ protocol: /^https$/, hostname: X_MEDIA_HOSTNAME }).optional(),
      short: nonEmpty.optional(),
    }),
  ),
  media: z
    .array(
      z.strictObject({
        url: z.url({ protocol: /^https$/, hostname: X_MEDIA_HOSTNAME }),
        alt: nonEmpty.optional(),
        link: nonEmpty.optional(),
      }),
    )
    .default([]),
};

type RawPost = z.output<z.ZodObject<typeof postShape>>;

function linksInText({ text, media, links }: RawPost, ctx: z.RefinementCtx): void {
  media.forEach(({ link }, index) => {
    if (link !== undefined && !text.includes(link)) {
      ctx.addIssue({ code: "custom", path: ["media", index, "link"], message: `"${link}" is not in text` });
    }
  });
  links.forEach(({ short }, index) => {
    if (short !== undefined && !text.includes(short)) {
      ctx.addIssue({ code: "custom", path: ["links", index, "short"], message: `"${short}" is not in text` });
    }
  });
}

const toPost = <Entry extends RawPost>({ posted_at, saved_at, shelf_life, key_points, ...rest }: Entry) => ({
  ...rest,
  shelfLife: shelf_life,
  postedAt: new Date(posted_at),
  savedAt: new Date(saved_at),
  keyPoints: key_points,
});

export const bookmarkSchema = z.strictObject(postShape).superRefine(linksInText).transform(toPost);

export const scanSchema = z
  .strictObject({ ...postShape, pick: z.boolean().default(false) })
  .superRefine(linksInText)
  .transform(toPost);

const withUniqueIds = <Entry extends z.ZodType<{ id: string }>>(entry: Entry) =>
  z.array(entry).superRefine((entries, ctx) => {
    const seen = new Set<string>();
    entries.forEach(({ id }, index) => {
      if (seen.has(id)) {
        ctx.addIssue({ code: "custom", path: [index, "id"], message: `duplicate id "${id}"` });
      }
      seen.add(id);
    });
  });

export const bookmarksFileSchema = withUniqueIds(bookmarkSchema);
export const scansFileSchema = withUniqueIds(scanSchema);

export const stateFileSchema = z.array(nonEmpty);

export type BookmarkFileEntry = z.input<typeof bookmarkSchema>;
export type Bookmark = z.output<typeof bookmarkSchema>;
export type Scan = z.output<typeof scanSchema>;
export type PostLink = Bookmark["links"][number];

export function parseDataFile<Schema extends z.ZodType>({
  schema,
  raw,
  source,
}: {
  schema: Schema;
  raw: unknown;
  source: string;
}): z.output<Schema> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`${source} is invalid:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

const newestSavedFirst = <Entry extends Bookmark>(entries: Entry[]): Entry[] =>
  entries.toSorted((a, b) => b.savedAt.getTime() - a.savedAt.getTime());

export function parseBookmarks({ raw, source }: { raw: unknown; source: string }): Bookmark[] {
  return newestSavedFirst(parseDataFile({ schema: bookmarksFileSchema, raw, source }));
}

export function parseScans({ raw, source }: { raw: unknown; source: string }): Scan[] {
  return newestSavedFirst(parseDataFile({ schema: scansFileSchema, raw, source }));
}
