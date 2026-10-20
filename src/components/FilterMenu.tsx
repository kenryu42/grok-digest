import { cn } from "cn";
import type { ReactNode } from "react";
import type { Controls } from "../lib/bookmark-controls.ts";
import { SORT_LABELS, SORTS, SOURCE_FILTER_LABELS, SOURCE_FILTERS } from "../lib/filter.ts";

export function FilterMenu({ controls }: { controls: Controls }) {
  const { sort, chooseSort, showDone, setShowDone, hasScans, source, chooseSource } = controls;
  const sortRow = (
    <Row>
      {SORTS.map((s) => (
        <Option key={s} pressed={sort === s} onClick={() => chooseSort(s)}>
          {SORT_LABELS[s]}
        </Option>
      ))}
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
      <Option pressed={showDone} onClick={() => setShowDone(!showDone)}>
        Done
      </Option>
    </Row>
  );
  if (!hasScans) return sortRow;
  return (
    <div className="flex flex-col gap-2">
      {sortRow}
      <Row label="Show">
        {SOURCE_FILTERS.map((s) => (
          <Option key={s} pressed={source === s} onClick={() => chooseSource(s)}>
            {SOURCE_FILTER_LABELS[s]}
          </Option>
        ))}
      </Row>
    </div>
  );
}

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div
      role={label === undefined ? undefined : "group"}
      aria-label={label}
      className="flex h-11 items-center gap-1 rounded-full border bg-popover p-1 text-popover-foreground shadow-lg sm:h-9"
    >
      {children}
    </div>
  );
}

function Option({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-full flex-1 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        "aria-pressed:bg-muted aria-pressed:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
