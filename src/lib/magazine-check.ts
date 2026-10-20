import type { Bookmark, Scan } from "./bookmarks.ts";
import {
  CORNER_LABELS,
  INTEREST_CORNERS,
  ITEM_LIMITS,
  refOf,
  type FindEntry,
  type ItemsBlock,
  type MagazineBlock,
  type MagazineCorner,
  type MagazineIssue,
  type MagazineTag,
} from "./magazine.ts";
import { postFinder, type FindPost, type Post, type PostRef } from "./posts.ts";

export type IssueWarning = { path: (string | number)[]; message: string };

const MAX_BLOCKS_PER_POST = 2;
const MAX_LOUD_BLOCKS = 1;
const MAX_INTEREST_SHARE = 0.6;
const LINEUP_CORNER: MagazineCorner = "open-window";

const SOURCE_FILES = {
  bookmark: "bookmarks.json",
  scan: "scans.json",
} satisfies Record<PostRef["source"], string>;

const collapseSpaces = (text: string): string => text.replaceAll(/\s+/g, " ").trim();

const hasItems = (block: MagazineBlock): block is ItemsBlock => Object.hasOwn(ITEM_LIMITS, block.type);

type Problem = { message: string; field?: "quote" };

function referenceProblem(block: MagazineBlock, { source, id }: PostRef, post: Post | undefined): Problem | undefined {
  if (post === undefined) return { message: `"${id}" is not a ${source} id in ${SOURCE_FILES[source]}` };
  if (block.type === "pull-quote" && !collapseSpaces(post.text).includes(collapseSpaces(block.quote))) {
    return { message: `the quote is not in the text of ${source} "${id}"`, field: "quote" };
  }
  if (block.type === "photo-spread" && post.media.length === 0) return { message: `${source} "${id}" has no media` };
  if (block.type === "sidebar-box" && post.action === "") return { message: `${source} "${id}" has no action` };
  return undefined;
}

type Reference = { path: (string | number)[]; ref: PostRef; tags: readonly MagazineTag[] | undefined };

const referenceField = (ref: PostRef): string => (ref.source === "scan" ? "scan" : "bookmark");

function referencesIn(block: MagazineBlock): Reference[] {
  if (hasItems(block))
    return block.items.map((item, index) => {
      const ref = refOf(item);
      return { path: ["items", index], ref, tags: item.tags };
    });
  if (block.type === "topic-divider" || block.type === "corner") return [];
  return [{ path: [], ref: refOf(block), tags: "tags" in block ? block.tags : undefined }];
}

function pairHalves(sections: readonly MagazineBlock[]): MagazineBlock[] {
  const paired: MagazineBlock[] = [];
  let index = 0;
  while (index < sections.length) {
    const block = sections[index];
    const next = sections[index + 1];
    if (block === undefined) break;
    if (block.span === "half" && next?.span === "half") {
      paired.push(block, next);
      index += 2;
    } else {
      paired.push(block.span === "half" ? { ...block, span: "full" } : block);
      index += 1;
    }
  }
  return paired;
}

export function readableIssue<Issue extends MagazineIssue>(issue: Issue, find: FindPost): Issue {
  const usable = (block: MagazineBlock, ref: PostRef): boolean => referenceProblem(block, ref, find(ref)) === undefined;
  const sections = issue.sections.flatMap((block): MagazineBlock[] => {
    if (hasItems(block)) {
      const kept = block.items.filter((item) => usable(block, refOf(item)));
      return kept.length < ITEM_LIMITS[block.type].min ? [] : [{ ...block, items: kept }];
    }
    return referencesIn(block).every(({ ref }) => usable(block, ref)) ? [block] : [];
  });
  return { ...issue, sections: pairHalves(sections) };
}

function leftOut(block: MagazineBlock, missing: number): string {
  if (!hasItems(block)) return "the page leaves the block out";
  const left = block.items.length - missing;
  return left < ITEM_LIMITS[block.type].min ? "the page leaves the block out" : "the page leaves the item out";
}

const refKey = ({ source, id }: PostRef): string => `${source}:${id}`;

function lineupWarnings(sections: readonly MagazineBlock[]): IssueWarning[] {
  if (!sections.some((block) => block.type === "corner")) return [];
  let corner: MagazineCorner | undefined;
  const cornerOf = new Map<string, MagazineCorner | undefined>();
  for (const block of sections) {
    if (block.type === "corner") corner = block.corner;
    for (const { ref } of referencesIn(block)) {
      if (!cornerOf.has(refKey(ref))) cornerOf.set(refKey(ref), corner);
    }
  }
  const counted = [...cornerOf.values()].filter(
    (item): item is MagazineCorner => item !== undefined && item !== "your-saves",
  );
  const interest = counted.filter((item) => INTEREST_CORNERS.includes(item)).length;
  const warnings: IssueWarning[] = [];
  if (!counted.includes(LINEUP_CORNER)) {
    warnings.push({
      path: ["sections"],
      message: `the issue has no ${CORNER_LABELS[LINEUP_CORNER]} item; put one under a "corner" block with "corner": "${LINEUP_CORNER}"`,
    });
  }
  if (counted.length > 0 && interest / counted.length > MAX_INTEREST_SHARE) {
    const interestLabels = INTEREST_CORNERS.map((name) => CORNER_LABELS[name]).join(", ");
    warnings.push({
      path: ["sections"],
      message: `${interest} of ${counted.length} items (${Math.round((100 * interest) / counted.length)}%) are interest items, under ${interestLabels}; keep them to at most ${100 * MAX_INTEREST_SHARE}%`,
    });
  }
  return warnings;
}

export function issueWarnings({
  issue,
  bookmarks,
  scans = [],
  latestToday,
}: {
  issue: MagazineIssue;
  bookmarks: readonly Bookmark[];
  scans?: readonly Scan[];
  latestToday: string;
}): IssueWarning[] {
  const find = postFinder(bookmarks, scans);
  const warnings: IssueWarning[] = [];
  if (issue.date > latestToday) {
    warnings.push({ path: ["date"], message: `"${issue.date}" is in the future` });
  }
  const blocksPerPost = new Map<string, { ref: PostRef; blocks: number[] }>();
  let loudBlocks = 0;
  issue.sections.forEach((block, index) => {
    const references = referencesIn(block);
    const problems = references.flatMap(({ path, ref }) => {
      const problem = referenceProblem(block, ref, find(ref));
      return problem === undefined ? [] : [{ path, ref, problem }];
    });
    for (const { path, ref, problem } of problems) {
      warnings.push({
        path: ["sections", index, ...path, problem.field ?? referenceField(ref)],
        message: `${problem.message}; ${leftOut(block, problems.length)}`,
      });
    }
    for (const { path, ref, tags } of references) {
      const post = find(ref);
      if (ref.source !== "scan" || post === undefined || post.links.length > 0) continue;
      if (tags === undefined || tags.includes("unverified")) continue;
      warnings.push({
        path: ["sections", index, ...path, "tags"],
        message: `scan "${ref.id}" has no source link; add the primary source to its links in scans.json, or tag the item "unverified"`,
      });
    }
    for (const shown of new Map(references.map(({ ref }) => [refKey(ref), ref])).values()) {
      const seen = blocksPerPost.get(refKey(shown)) ?? { ref: shown, blocks: [] };
      blocksPerPost.set(refKey(shown), { ref: shown, blocks: [...seen.blocks, index] });
    }
    if (block.emphasis === "loud" && ++loudBlocks > MAX_LOUD_BLOCKS) {
      warnings.push({
        path: ["sections", index, "emphasis"],
        message: `use "loud" on at most ${MAX_LOUD_BLOCKS} block`,
      });
    }
  });
  for (const { ref, blocks } of blocksPerPost.values()) {
    if (blocks.length > MAX_BLOCKS_PER_POST) {
      warnings.push({
        path: ["sections", blocks[MAX_BLOCKS_PER_POST] ?? 0],
        message: `${ref.source} "${ref.id}" is in ${blocks.length} blocks; show it in at most ${MAX_BLOCKS_PER_POST}`,
      });
    }
  }
  return [...warnings, ...lineupWarnings(issue.sections)];
}

export const referencedPosts = (issue: MagazineIssue): PostRef[] => [
  ...new Map(
    issue.sections.flatMap((block) => referencesIn(block).map(({ ref }) => [refKey(ref), ref] as const)),
  ).values(),
];

export function entryFinder(find: FindPost): FindEntry {
  return (ref) => {
    const post = find(ref);
    if (post === undefined) throw new Error(`No ${ref.source} with id "${ref.id}"`);
    return post;
  };
}
