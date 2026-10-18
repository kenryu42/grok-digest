import { SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { cn } from "cn";
import { DoneCleanup } from "virtual:grok-digest/components/DoneCleanup";
import { FilterMenu } from "virtual:grok-digest/components/FilterMenu";
import { KeyboardHints } from "virtual:grok-digest/components/KeyboardHints";
import { SearchField } from "virtual:grok-digest/components/SearchField";
import { StatusLine } from "virtual:grok-digest/components/StatusLine";
import { TopicChips } from "virtual:grok-digest/components/TopicChips";
import { UndoToast } from "virtual:grok-digest/components/UndoToast";
import { Button } from "./ui/button.tsx";
import type { Controls } from "../lib/bookmark-controls.ts";

export function ControlsLayout({ controls }: { controls: Controls }) {
  const { searchShown, openSearch, barRef } = controls;
  return (
    <div className="flex flex-col gap-4 max-sm:contents">
      <div
        ref={barRef}
        className="relative flex flex-col gap-4 max-sm:sticky max-sm:top-0 max-sm:z-10 max-sm:-mx-4 max-sm:gap-2 max-sm:border-b max-sm:bg-background/90 max-sm:px-4 max-sm:pt-safe-2 max-sm:pb-2 max-sm:backdrop-blur-md"
      >
        <div className={cn("flex items-center gap-2", !searchShown && "max-sm:hidden")}>
          <SearchField controls={controls} />
        </div>

        <div className={cn("flex items-center gap-2 sm:items-start", searchShown && "max-sm:hidden")}>
          <TopicChips controls={controls} />
          <FiltersButton controls={controls} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={openSearch}
            aria-label="Search bookmarks"
            className="size-9 shrink-0 rounded-full sm:hidden"
          >
            <SearchIcon className="size-5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <StatusLine controls={controls} />
        <KeyboardHints controls={controls} />
      </div>

      <DoneCleanup controls={controls} />

      <UndoToast controls={controls} />
    </div>
  );
}

function FiltersButton({ controls }: { controls: Controls }) {
  const { filtersShown, toggleFilters, filtersChanged } = controls;
  return (
    <div className="shrink-0 sm:relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-expanded={filtersShown}
        aria-label="Sort and filter"
        title="Sort and filter"
        onClick={toggleFilters}
        className="relative size-9 rounded-full sm:size-7"
      >
        <SlidersHorizontalIcon aria-hidden="true" />
        {filtersChanged && (
          <span aria-hidden="true" className="absolute top-0.5 right-0.5 size-2 rounded-full bg-brand" />
        )}
      </Button>
      {filtersShown && (
        <div className="absolute top-full z-20 mt-2 max-sm:inset-x-4 sm:right-0 sm:w-96">
          <FilterMenu controls={controls} />
        </div>
      )}
    </div>
  );
}
