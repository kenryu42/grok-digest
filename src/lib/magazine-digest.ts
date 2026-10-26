import type { ImageMetadata } from "astro";
import {
  cornerLabel,
  refOf,
  type BlockOf,
  type CoveredIssue,
  type FindEntry,
  type MagazineBlock,
  type MagazineCorner,
  type MagazineTag,
} from "./magazine.ts";
import type { Post } from "./posts.ts";

export type DigestLineKind = "why" | "note" | "quote" | "try";

type DigestLine = { kind: DigestLineKind; text: string };

export type DigestPost = {
  kind: "post";
  post: Post;
  title: string;
  label: string | undefined;
  line: DigestLine | undefined;
  tags: MagazineTag[];
  sourceLabel: string | undefined;
};

type DigestPicture = {
  kind: "picture";
  picture: ImageMetadata;
  alt: string | undefined;
  headline: string | undefined;
  caption: string;
};

type DigestEntry = DigestPost | DigestPicture;

type DigestCorner = { corner: MagazineCorner; label: string; deck: string | undefined };

export type DigestGroup = { corner: DigestCorner | undefined; entries: DigestEntry[] };

type ItemText = {
  why?: string | undefined;
  tags?: MagazineTag[] | undefined;
  source_label?: string | undefined;
  headline?: string | undefined;
  deck?: string | undefined;
  note?: string | undefined;
  caption?: string | undefined;
  label?: string | undefined;
};

const SUMMARY_LINE_MAX = 200;
const FIRST_SENTENCE = /^.+?(?:[.!?](?=\s|$)|[。！？])/su;

function shortSummary(summary: string): string {
  const sentence = FIRST_SENTENCE.exec(summary.trim())?.[0] ?? summary.trim();
  return sentence.length <= SUMMARY_LINE_MAX ? sentence : `${sentence.slice(0, SUMMARY_LINE_MAX - 1).trimEnd()}…`;
}

function firstLine(post: Post, title: string, texts: (DigestLine | undefined)[]): DigestLine | undefined {
  const given = texts.find((line) => line !== undefined);
  if (given !== undefined) return given;
  const summary = title === post.tldr ? shortSummary(post.summary) : post.tldr;
  return summary === "" ? undefined : { kind: "note", text: summary };
}

const lineOf = (kind: DigestLineKind, text: string | undefined): DigestLine | undefined =>
  text === undefined ? undefined : { kind, text };

function digestPost(post: Post, text: ItemText, extra?: DigestLine): DigestPost {
  const title = text.headline ?? post.tldr;
  return {
    kind: "post",
    post,
    title,
    label: text.label,
    line: firstLine(post, title, [
      lineOf("why", text.why),
      lineOf("note", text.deck ?? text.note ?? text.caption),
      extra,
    ]),
    tags: text.tags ?? [],
    sourceLabel: text.source_label,
  };
}

function postsIn(block: MagazineBlock, find: FindEntry): DigestPost[] {
  if ("items" in block) return block.items.map((item) => digestPost(find(refOf(item)), item));
  if (block.type === "pull-quote") return [digestPost(find(refOf(block)), {}, { kind: "quote", text: block.quote })];
  if (block.type === "sidebar-box") {
    const post = find(refOf(block));
    return [digestPost(post, {}, lineOf("try", post.action))];
  }
  if (block.type === "cover-story" || block.type === "feature" || block.type === "closer") {
    return [digestPost(find(refOf(block)), block)];
  }
  return [];
}

const pictureOf = (block: BlockOf<"image-of-the-day">, art: CoveredIssue["art"]): DigestPicture[] => {
  const picture = art.get(block.art);
  if (picture === undefined) return [];
  return [{ kind: "picture", picture, alt: block.art_alt, headline: block.headline, caption: block.caption }];
};

const postKey = ({ source, id }: Post): string => `${source}:${id}`;

export function issueDigest(issue: Pick<CoveredIssue, "sections" | "art">, find: FindEntry): DigestGroup[] {
  const groups: DigestGroup[] = [{ corner: undefined, entries: [] }];
  const shown = new Set<string>();
  for (const block of issue.sections) {
    if (block.type === "corner") {
      groups.push({ corner: { corner: block.corner, label: cornerLabel(block), deck: block.deck }, entries: [] });
      continue;
    }
    const entries: DigestEntry[] =
      block.type === "image-of-the-day"
        ? pictureOf(block, issue.art)
        : postsIn(block, find).filter((entry) => !shown.has(postKey(entry.post)));
    for (const entry of entries) {
      if (entry.kind === "post") shown.add(postKey(entry.post));
    }
    groups.at(-1)?.entries.push(...entries);
  }
  return groups.filter(({ entries }) => entries.length > 0);
}
