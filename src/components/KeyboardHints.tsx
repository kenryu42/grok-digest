import type { Controls } from "../lib/bookmark-controls.ts";

export function KeyboardHints({ controls }: { controls: Controls }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <p className="hidden text-xs text-muted-foreground sm:pointer-fine:block">
          <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>e</kbd> done · <kbd>u</kbd> undo · <kbd>c</kbd> copy · <kbd>o</kbd> open
          · <kbd>1</kbd>–<kbd>4</kbd> detail ·{" "}
          {controls.settings.swipeMode && (
            <>
              <kbd>s</kbd> swipe ·{" "}
            </>
          )}
          <kbd>/</kbd> search
        </p>
      </div>
      <p className="hidden w-full text-xs text-muted-foreground pointer-coarse:block">
        Tap a card to open it. Swipe it left to mark it done.
      </p>
    </>
  );
}
