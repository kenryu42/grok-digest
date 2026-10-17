import { ArrowUpRightIcon, CheckIcon, ClockIcon, CopyIcon, PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "./ui/button.tsx";
import { SPEED, type SwipeControls } from "../lib/swipe-mode.ts";

export function SwipeFooter({ swipe }: { swipe: SwipeControls }) {
  const {
    undoPending,
    undo,
    speedOn,
    page,
    togglePlaying,
    finished,
    playing,
    speed,
    changeSpeed,
    copy,
    copied,
    pageDone,
    toggleDone,
    later,
  } = swipe;
  return (
    <footer className="relative mx-auto flex w-full max-w-2xl flex-col gap-3 border-t px-safe-4 pt-3 pb-safe-4">
      <output className="pointer-events-none absolute inset-x-0 -top-14 flex justify-center px-4">
        {undoPending && (
          <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-foreground py-1.5 pr-1.5 pl-4 text-sm text-background shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
            Marked done
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={undo}
              className="h-9 rounded-full px-3 font-semibold text-background underline underline-offset-4 hover:bg-background/15 hover:text-background dark:hover:bg-background/15"
            >
              Undo
            </Button>
          </span>
        )}
        {copied && !undoPending && (
          <span className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm text-background shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 pointer-fine:hidden">
            <CheckIcon className="size-4" aria-hidden="true" />
            Copied
          </span>
        )}
      </output>
      {speedOn && page !== undefined && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={togglePlaying}
            aria-label={finished ? "Read again" : playing ? "Pause" : "Play"}
            className="size-11 rounded-full"
          >
            {finished ? (
              <RotateCcwIcon className="size-5" aria-hidden="true" />
            ) : playing ? (
              <PauseIcon className="size-5 fill-current" aria-hidden="true" />
            ) : (
              <PlayIcon className="size-5 fill-current" aria-hidden="true" />
            )}
          </Button>
          <label className="flex flex-1 items-center gap-3 text-sm text-muted-foreground">
            <span className="sr-only">Speed</span>
            <input
              type="range"
              min={SPEED.min}
              max={SPEED.max}
              step={SPEED.step}
              value={speed}
              onChange={(event) => changeSpeed(Number(event.target.value))}
              className="h-11 min-w-0 flex-1 accent-foreground"
            />
            <span className="w-18 text-right text-foreground tabular-nums">{speed} wpm</span>
          </label>
        </div>
      )}
      {page !== undefined && (
        <div className="flex items-center justify-between gap-2 pointer-coarse:justify-center">
          <Button
            type="button"
            variant="ghost"
            onClick={copy}
            title="Copy for an AI assistant (c)"
            className="h-11 rounded-full pointer-coarse:hidden"
          >
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={later}
            aria-label="Later"
            title="Move to the end (l)"
            className="size-11 rounded-full text-muted-foreground pointer-coarse:hidden"
          >
            <ClockIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={pageDone}
            onClick={toggleDone}
            title="Mark done (e)"
            className="h-11 rounded-full px-4 pointer-coarse:hidden aria-pressed:border-done aria-pressed:bg-done aria-pressed:text-done-foreground"
          >
            <CheckIcon aria-hidden="true" />
            Done
          </Button>
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-1 rounded-full px-3 text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Open on X
            <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      )}
    </footer>
  );
}
