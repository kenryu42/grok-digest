import { cn } from "cn";
import type { ReactNode } from "react";
import { Button } from "./ui/button.tsx";
import type { Controls } from "../lib/bookmark-controls.ts";
import { SORT_LABELS, SORTS } from "../lib/filter.ts";

export function FilterMenu({ controls }: { controls: Controls }) {
  const { sort, chooseSort, showDone, setShowDone, hideNews, setHideNews, counts } = controls;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-popover p-3 text-popover-foreground shadow-lg">
      <fieldset aria-label="Sort by" className="grid h-9 grid-cols-3 rounded-full bg-muted p-1">
        {SORTS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={sort === s}
            onClick={() => chooseSort(s)}
            className={cn(
              "rounded-full text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              "aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs",
            )}
          >
            {SORT_LABELS[s]}
          </button>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <Toggle pressed={showDone} onClick={() => setShowDone(!showDone)}>
          Show done
          <span className="tabular-nums opacity-70">{counts.done}</span>
        </Toggle>
        <Toggle pressed={hideNews} onClick={() => setHideNews(!hideNews)}>
          Hide news
        </Toggle>
      </div>
    </div>
  );
}

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? "default" : "outline"}
      aria-pressed={pressed}
      onClick={onClick}
      className="rounded-full px-3 max-sm:h-9"
    >
      {children}
    </Button>
  );
}
