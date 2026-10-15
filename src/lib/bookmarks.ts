import { z } from "zod";
import { TOPICS } from "./topics.ts";

export const SCHEMA_VERSION = 1;

const X_HOSTNAME = /^(www\.|mobile\.)?(x|twitter)\.com$/;
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

const nonEmpty = z.string().trim().min(1);

export const bookmarkSchema = z
  .strictObject({
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
    posted_at: z.union([z.iso.date(), z.iso.datetime({ offset: true })]),
    topic: z.enum(TOPICS),
    summary: nonEmpty,
    text: z.string().trim(),
    key_points: z.array(nonEmpty),
  })
  .transform(({ posted_at, key_points, ...rest }) => ({
    ...rest,
    postedAt: new Date(posted_at),
    keyPoints: key_points,
  }));

export const bookmarksFileSchema = z.array(bookmarkSchema).superRefine((bookmarks, ctx) => {
  const seen = new Set<string>();
  bookmarks.forEach(({ id }, index) => {
    if (seen.has(id)) {
      ctx.addIssue({ code: "custom", path: [index, "id"], message: `duplicate id "${id}"` });
    }
    seen.add(id);
  });
});

export const stateFileSchema = z.array(nonEmpty);

export type BookmarkFileEntry = z.input<typeof bookmarkSchema>;
export type Bookmark = z.output<typeof bookmarkSchema>;

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

export function parseBookmarks({ raw, source }: { raw: unknown; source: string }): Bookmark[] {
  return parseDataFile({ schema: bookmarksFileSchema, raw, source }).toSorted(
    (a, b) => b.postedAt.getTime() - a.postedAt.getTime(),
  );
}
