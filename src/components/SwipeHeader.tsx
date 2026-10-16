import { XIcon, ZapIcon } from "lucide-react";
import { Button } from "./ui/button.tsx";
import type { SwipeControls } from "../lib/swipe-mode.ts";

export function SwipeHeader({ swipe }: { swipe: SwipeControls }) {
  const { close, current, pages, speedOn, toggleSpeed, plan, step } = swipe;
  return (
    <header className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-safe-3 pt-safe-2 pb-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label="Close swipe mode"
          className="size-11 rounded-full"
        >
          <XIcon className="size-5" aria-hidden="true" />
        </Button>
        <span data-swipe-counter className="flex-1 text-center text-sm text-muted-foreground tabular-nums">
          {Math.min(current + 1, pages.length)} / {pages.length}
        </span>
        <Button
          type="button"
          variant="outline"
          aria-pressed={speedOn}
          onClick={toggleSpeed}
          title="Speed read (r)"
          className="h-10 rounded-full px-3 aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-brand-ink"
        >
          <ZapIcon className="in-aria-pressed:fill-brand" aria-hidden="true" />
          Speed read
        </Button>
      </div>
      {speedOn && (
        <div aria-hidden="true" className="h-0.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-brand transition-[width] duration-150 ease-linear"
            style={{ width: `${plan.words.length === 0 ? 100 : Math.min(step / plan.words.length, 1) * 100}%` }}
          />
        </div>
      )}
    </header>
  );
}
