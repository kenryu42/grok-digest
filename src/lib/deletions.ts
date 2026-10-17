export const REMOVE_REQUEST = "Remove these bookmarks from my Grok Digest:";

export function removeRequest(urls: readonly string[]): string {
  return [REMOVE_REQUEST, ...urls].join("\n");
}

export function pendingDeletes(stored: unknown, bookmarkIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter((id): id is string => typeof id === "string" && bookmarkIds.has(id));
}
