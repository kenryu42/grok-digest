import type { Bookmark, PostLink } from "./bookmarks.ts";

type Image = { url: string; alt: string };

export type PostPart =
  | { kind: "text"; text: string }
  | { kind: "images"; images: Image[] }
  | { kind: "link"; link: PostLink };

export type TextPiece = { kind: "text"; text: string; at: number } | { kind: "url"; url: string; at: number };

const URL_IN_TEXT = /https?:\/\/[^\s<>"]+/g;
const TRAILING_PUNCTUATION = /[.,!?;:'")\]]+$/;

export function textPieces(text: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  let from = 0;
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const url = match[0].replace(TRAILING_PUNCTUATION, "");
    if (match.index > from) pieces.push({ kind: "text", text: text.slice(from, match.index), at: from });
    pieces.push({ kind: "url", url, at: match.index });
    from = match.index + url.length;
  }
  if (from < text.length) pieces.push({ kind: "text", text: text.slice(from), at: from });
  return pieces;
}

export const withoutUrls = (text: string): string =>
  textPieces(text)
    .flatMap((piece) => (piece.kind === "text" ? [piece.text] : []))
    .join(" ")
    .replaceAll(/[^\S\n]+/g, " ")
    .trim();

export function postParts({ author, text, media, links }: Bookmark): PostPart[] {
  const position = (index: number) => (media.length === 1 ? "" : ` ${index + 1} of ${media.length}`);
  const images = media.map(({ url, alt, link }, index) => ({
    url,
    alt: alt ?? `Image${position(index)} from the post by @${author.handle}`,
    link,
  }));
  const imagesFor = (link: string | undefined): PostPart => ({
    kind: "images",
    images: images.filter((image) => image.link === link).map(({ url, alt }) => ({ url, alt })),
  });
  const imageMarkers = [...new Set(images.flatMap(({ link }) => (link === undefined ? [] : [link])))].map((marker) => ({
    marker,
    part: imagesFor(marker),
  }));
  const linkMarkers = links.flatMap((link) =>
    link.short === undefined ? [] : [{ marker: link.short, part: { kind: "link", link } satisfies PostPart }],
  );
  const markers = [...imageMarkers, ...linkMarkers].toSorted((a, b) => text.indexOf(a.marker) - text.indexOf(b.marker));
  const parts: PostPart[] = [];
  let rest = text;
  for (const { marker, part } of markers) {
    const at = rest.indexOf(marker);
    if (at >= 0) {
      parts.push({ kind: "text", text: rest.slice(0, at).trim() });
      rest = rest.slice(at + marker.length);
    }
    parts.push(part);
  }
  parts.push({ kind: "text", text: rest.trim() }, imagesFor(undefined));
  return parts.filter((part) =>
    part.kind === "text" ? part.text !== "" : part.kind === "images" ? part.images.length > 0 : true,
  );
}

export const listedLinks = (links: readonly PostLink[]): PostLink[] => links.filter((link) => link.short === undefined);
