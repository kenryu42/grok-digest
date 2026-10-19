import type { Bookmark } from "./bookmarks.ts";
import { ITEM_LIMITS, type FindBookmark, type ItemsBlock, type MagazineBlock, type MagazineIssue } from "./magazine.ts";

export type IssueWarning = { path: (string | number)[]; message: string };

type BookmarkIndex = ReadonlyMap<string, Bookmark>;

const MAX_BLOCKS_PER_BOOKMARK = 2;
const MAX_LOUD_BLOCKS = 1;

export const indexBookmarks = (bookmarks: readonly Bookmark[]): BookmarkIndex =>
  new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));

const collapseSpaces = (text: string): string => text.replaceAll(/\s+/g, " ").trim();

const hasItems = (block: MagazineBlock): block is ItemsBlock => Object.hasOwn(ITEM_LIMITS, block.type);

function referenceProblem(block: MagazineBlock, id: string, bookmark: Bookmark | undefined): string | undefined {
  if (bookmark === undefined) return `"${id}" is not a bookmark id in bookmarks.json`;
  if (block.type === "pull-quote" && !collapseSpaces(bookmark.text).includes(collapseSpaces(block.quote))) {
    return `the quote is not in the text of bookmark "${id}"`;
  }
  if (block.type === "photo-spread" && bookmark.media.length === 0) return `bookmark "${id}" has no media`;
  if (block.type === "sidebar-box" && bookmark.action === "") return `bookmark "${id}" has no action`;
  return undefined;
}

type Reference = { path: (string | number)[]; id: string };

function referencesIn(block: MagazineBlock): Reference[] {
  if (hasItems(block))
    return block.items.map(({ bookmark }, index) => ({ path: ["items", index, "bookmark"], id: bookmark }));
  if ("bookmark" in block) return [{ path: ["bookmark"], id: block.bookmark }];
  return [];
}

export function readableIssue<Issue extends MagazineIssue>(issue: Issue, byId: BookmarkIndex): Issue {
  const usable = (block: MagazineBlock, id: string): boolean => referenceProblem(block, id, byId.get(id)) === undefined;
  const sections = issue.sections.flatMap((block): MagazineBlock[] => {
    if (hasItems(block)) {
      const kept = block.items.filter(({ bookmark }) => usable(block, bookmark));
      return kept.length < ITEM_LIMITS[block.type].min ? [] : [{ ...block, items: kept }];
    }
    return "bookmark" in block && !usable(block, block.bookmark) ? [] : [block];
  });
  return { ...issue, sections };
}

function leftOut(block: MagazineBlock, missing: number): string {
  if (!hasItems(block)) return "the page leaves the block out";
  const left = block.items.length - missing;
  return left < ITEM_LIMITS[block.type].min ? "the page leaves the block out" : "the page leaves the item out";
}

export function issueWarnings({
  issue,
  bookmarks,
  latestToday,
}: {
  issue: MagazineIssue;
  bookmarks: readonly Bookmark[];
  latestToday: string;
}): IssueWarning[] {
  const byId = indexBookmarks(bookmarks);
  const warnings: IssueWarning[] = [];
  if (issue.date > latestToday) {
    warnings.push({ path: ["date"], message: `"${issue.date}" is in the future` });
  }
  const blocksPerBookmark = new Map<string, number[]>();
  let loudBlocks = 0;
  issue.sections.forEach((block, index) => {
    const references = referencesIn(block);
    const problems = references.flatMap(({ path, id }) => {
      const problem = referenceProblem(block, id, byId.get(id));
      return problem === undefined ? [] : [{ path, problem }];
    });
    for (const { path, problem } of problems) {
      warnings.push({ path: ["sections", index, ...path], message: `${problem}; ${leftOut(block, problems.length)}` });
    }
    for (const id of new Set(references.map((reference) => reference.id))) {
      blocksPerBookmark.set(id, [...(blocksPerBookmark.get(id) ?? []), index]);
    }
    if (block.emphasis === "loud" && ++loudBlocks > MAX_LOUD_BLOCKS) {
      warnings.push({
        path: ["sections", index, "emphasis"],
        message: `use "loud" on at most ${MAX_LOUD_BLOCKS} block`,
      });
    }
  });
  for (const [id, blocks] of blocksPerBookmark) {
    if (blocks.length > MAX_BLOCKS_PER_BOOKMARK) {
      warnings.push({
        path: ["sections", blocks[MAX_BLOCKS_PER_BOOKMARK] ?? 0],
        message: `bookmark "${id}" is in ${blocks.length} blocks; show it in at most ${MAX_BLOCKS_PER_BOOKMARK}`,
      });
    }
  }
  return warnings;
}

export const referencedIds = (issue: MagazineIssue): string[] => [
  ...new Set(issue.sections.flatMap((block) => referencesIn(block).map(({ id }) => id))),
];

export function bookmarkFinder(bookmarks: readonly Bookmark[]): FindBookmark {
  const byId = indexBookmarks(bookmarks);
  return (id) => {
    const bookmark = byId.get(id);
    if (bookmark === undefined) throw new Error(`No bookmark with id "${id}"`);
    return bookmark;
  };
}
