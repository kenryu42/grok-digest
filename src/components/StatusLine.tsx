import type { Controls } from "../lib/bookmark-controls.ts";

function plural(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function StatusLine({ controls }: { controls: Controls }) {
  return (
    <p aria-live="polite" className="text-sm text-muted-foreground">
      {status(controls)}
    </p>
  );
}

function status({ searching, shown, shownDone, showDone, counts }: Controls): string {
  if (searching) return shown === 0 ? "No bookmarks match your search." : `${plural(shown, "result")} in all bookmarks`;
  if (shown === 0)
    return counts.toRead === 0 && !showDone ? "Inbox zero. Everything is done." : "No bookmarks match these filters.";
  if (!showDone) return `${plural(shown, "bookmark")} to read`;
  return shownDone === 0 ? plural(shown, "bookmark") : `${plural(shown, "bookmark")}, ${shownDone} done`;
}
