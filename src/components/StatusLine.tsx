import type { Controls } from "../lib/bookmark-controls.ts";
import type { View } from "../lib/filter.ts";

function plural(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function StatusLine({ controls }: { controls: Controls }) {
  const { view, searching, shown, reviewed, reviewSize, counts } = controls;
  return (
    <p aria-live="polite" className="text-sm text-muted-foreground">
      <Status
        view={view}
        searching={searching}
        visible={shown}
        reviewed={reviewed}
        reviewSize={reviewSize}
        inbox={counts.inbox}
      />
    </p>
  );
}

function Status({
  view,
  searching,
  visible,
  reviewed,
  reviewSize,
  inbox,
}: {
  view: View;
  searching: boolean;
  visible: number;
  reviewed: number;
  reviewSize: number;
  inbox: number;
}) {
  if (searching)
    return visible === 0 ? "No bookmarks match your search." : `${plural(visible, "result")} in all bookmarks`;
  if (view === "today") {
    if (reviewSize === 0) return `Nothing to review today. ${plural(inbox, "bookmark")} in your inbox.`;
    if (reviewed === reviewSize) return "All caught up for today. Come back tomorrow.";
    return `${reviewed} of ${reviewSize} reviewed today`;
  }
  if (view === "inbox" && inbox === 0) return "Inbox zero. Everything is done.";
  if (view === "done" && visible === 0) return "Nothing marked done yet.";
  return plural(visible, "bookmark");
}
