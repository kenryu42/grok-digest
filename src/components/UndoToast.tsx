import { Button } from "./ui/button.tsx";
import type { Controls } from "../lib/bookmark-controls.ts";

export function UndoToast({ controls }: { controls: Controls }) {
  return (
    <output className="pointer-events-none fixed inset-x-0 bottom-[max(--spacing(4),env(safe-area-inset-bottom))] z-20 flex justify-center px-4 max-sm:bottom-[calc(env(safe-area-inset-bottom)+--spacing(20))]">
      {controls.undoPending && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-foreground py-1.5 pr-1.5 pl-4 text-sm text-background shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
          Marked done
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-undo
            onClick={controls.undo}
            className="h-9 rounded-full px-3 font-semibold text-background underline underline-offset-4 hover:bg-background/15 hover:text-background dark:hover:bg-background/15"
          >
            Undo
          </Button>
        </div>
      )}
    </output>
  );
}
