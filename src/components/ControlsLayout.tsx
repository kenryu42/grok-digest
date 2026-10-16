import { SearchIcon } from "lucide-react";
import { cn } from "cn";
import { DetailControl } from "virtual:grok-digest/components/DetailControl";
import { KeyboardHints } from "virtual:grok-digest/components/KeyboardHints";
import { SearchField } from "virtual:grok-digest/components/SearchField";
import { StatusLine } from "virtual:grok-digest/components/StatusLine";
import { TopicChips } from "virtual:grok-digest/components/TopicChips";
import { UndoToast } from "virtual:grok-digest/components/UndoToast";
import { ViewTabs } from "virtual:grok-digest/components/ViewTabs";
import { DepthIcon } from "./DepthIcon.tsx";
import { Button } from "./ui/button.tsx";
import type { Controls } from "../lib/bookmark-controls.ts";
import { DEPTH_LABELS } from "../lib/depth.ts";

export function ControlsLayout({ controls }: { controls: Controls }) {
  const { searchShown, detailShown, toggleDetail, depth, openSearch, barRef } = controls;
  return (
    <div className="flex flex-col gap-4 max-sm:contents">
      <ViewTabs controls={controls} />

      <div
        ref={barRef}
        className="flex flex-col gap-4 max-sm:sticky max-sm:top-0 max-sm:z-10 max-sm:-mx-4 max-sm:gap-2 max-sm:border-b max-sm:bg-background/90 max-sm:px-4 max-sm:pt-safe-2 max-sm:pb-2 max-sm:backdrop-blur-md"
      >
        <div className={cn("flex items-center gap-2", !searchShown && "max-sm:hidden")}>
          <SearchField controls={controls} />
        </div>

        <div className={cn("flex items-center gap-2", searchShown && "max-sm:hidden")}>
          <TopicChips controls={controls} />
          <Button
            type="button"
            variant="outline"
            aria-expanded={detailShown}
            aria-label={`Detail: ${DEPTH_LABELS[depth]}`}
            onClick={toggleDetail}
            className="h-9 shrink-0 rounded-full px-3 sm:hidden"
          >
            <DepthIcon depth={depth} />
            {DEPTH_LABELS[depth]}
          </Button>
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

        <div className={cn("sm:w-96", !detailShown && "max-sm:hidden")}>
          <DetailControl controls={controls} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <StatusLine controls={controls} />
        <KeyboardHints controls={controls} />
      </div>

      <UndoToast controls={controls} />
    </div>
  );
}
