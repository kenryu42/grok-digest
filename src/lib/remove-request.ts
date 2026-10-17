export const REMOVE_REQUEST = "Remove these bookmarks from my Grok Digest:";

export function removeRequest(urls: readonly string[]): string {
  return [REMOVE_REQUEST, ...urls].join("\n");
}
