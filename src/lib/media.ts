import type { Bookmark } from "./bookmarks.ts";

type Image = { url: string; alt: string };

type PostPart = { kind: "text"; text: string } | { kind: "images"; images: Image[] };

export function postParts({ author, text, media }: Bookmark): PostPart[] {
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
  const links = [...new Set(images.flatMap(({ link }) => (link === undefined ? [] : [link])))].toSorted(
    (a, b) => text.indexOf(a) - text.indexOf(b),
  );
  const parts: PostPart[] = [];
  let rest = text;
  for (const link of links) {
    const at = rest.indexOf(link);
    parts.push({ kind: "text", text: rest.slice(0, at).trim() }, imagesFor(link));
    rest = rest.slice(at + link.length);
  }
  parts.push({ kind: "text", text: rest.trim() }, imagesFor(undefined));
  return parts.filter((part) => (part.kind === "text" ? part.text !== "" : part.images.length > 0));
}
