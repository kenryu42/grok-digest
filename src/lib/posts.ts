import type { Bookmark, Scan } from "./bookmarks.ts";

export type PostSource = "bookmark" | "scan";

export type Post = Bookmark & { source: PostSource; onPage: boolean };

export type PostRef = { source: PostSource; id: string };

export type FindPost = (ref: PostRef) => Post | undefined;

const bookmarkPost = (bookmark: Bookmark): Post => ({ ...bookmark, source: "bookmark", onPage: true });

const scanPost = ({ pick: _pick, ...scan }: Scan, onPage: boolean): Post => ({ ...scan, source: "scan", onPage });

function scansOnPage(bookmarks: readonly Bookmark[], scans: readonly Scan[]): Set<Scan> {
  const saved = new Set(bookmarks.map(({ id }) => id));
  return new Set(scans.filter((scan) => scan.pick && !saved.has(scan.id)));
}

export function pagePosts(bookmarks: readonly Bookmark[], scans: readonly Scan[]): Post[] {
  const picked = scansOnPage(bookmarks, scans);
  return [...bookmarks.map(bookmarkPost), ...[...picked].map((scan) => scanPost(scan, true))].toSorted(
    (a, b) => b.savedAt.getTime() - a.savedAt.getTime(),
  );
}

const refKey = ({ source, id }: PostRef): string => `${source}:${id}`;

export function postFinder(bookmarks: readonly Bookmark[], scans: readonly Scan[]): FindPost {
  const picked = scansOnPage(bookmarks, scans);
  const posts = [...bookmarks.map(bookmarkPost), ...scans.map((scan) => scanPost(scan, picked.has(scan)))];
  const byRef = new Map(posts.map((post) => [refKey(post), post]));
  return (ref) => byRef.get(refKey(ref));
}
