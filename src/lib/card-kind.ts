import type { Bookmark } from "./bookmarks.ts";
import { postImages } from "./media.ts";

export type CardKind =
  | { kind: "photo"; image: { url: string; alt: string }; count: number }
  | { kind: "link"; host: string; image: string | undefined }
  | { kind: "note" };

export const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

export function cardKind(bookmark: Bookmark): CardKind {
  const images = postImages(bookmark);
  const [image] = images;
  if (image !== undefined) return { kind: "photo", image, count: images.length };
  const [link] = bookmark.links;
  if (link !== undefined) return { kind: "link", host: hostOf(link.url), image: link.image };
  return { kind: "note" };
}
