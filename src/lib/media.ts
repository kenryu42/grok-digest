import type { Bookmark } from "./bookmarks.ts";

export function imagesWithAlt({ author, media }: Bookmark): { url: string; alt: string }[] {
  const position = (index: number) => (media.length === 1 ? "" : ` ${index + 1} of ${media.length}`);
  return media.map(({ url, alt }, index) => ({
    url,
    alt: alt ?? `Image${position(index)} from the post by @${author.handle}`,
  }));
}
