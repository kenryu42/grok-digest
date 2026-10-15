import type { Bookmark } from "./bookmarks.ts";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
    .join("\n");
}

function list(heading: string, items: readonly string[]): string {
  return items.length === 0 ? "" : [`${heading}:`, ...items.map((item) => `- ${item}`)].join("\n");
}

export function copyText({
  url,
  author,
  postedAt,
  tldr,
  summary,
  text,
  media,
  keyPoints,
  action,
  links,
}: Bookmark): string {
  return [
    "A post I saved from X:",
    `**${tldr}**\n${author.name} (@${author.handle}) · posted ${dateFormat.format(postedAt)} · ${url}`,
    text === "" ? "" : quote(text),
    list(
      "Images",
      media.map((image) => (image.alt === undefined ? image.url : `${image.alt}: ${image.url}`)),
    ),
    `Summary: ${summary}`,
    list("Key points", keyPoints),
    action === "" ? "" : `Try: ${action}`,
    list(
      "Links",
      links.map((link) => `${link.title}: ${link.url}`),
    ),
  ]
    .filter((section) => section !== "")
    .join("\n\n");
}
