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

function status({ searching, shown, shownDone, showDone, counts, hasScans }: Controls): string {
  const noun = hasScans ? "post" : "bookmark";
  if (searching) return shown === 0 ? `No ${noun}s match your search.` : `${plural(shown, "result")} in all ${noun}s`;
  if (shown === 0)
    return counts.toRead === 0 && !showDone ? "Inbox zero. Everything is done." : `No ${noun}s match these filters.`;
  if (!showDone) return `${plural(shown, noun)} to read`;
  return shownDone === 0 ? plural(shown, noun) : `${plural(shown, noun)}, ${shownDone} done`;
}
