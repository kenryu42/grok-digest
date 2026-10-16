import {
  CalendarCheckIcon,
  CheckCheckIcon,
  GalleryVerticalEndIcon,
  InboxIcon,
  LibraryIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "./ui/button.tsx";
import type { Controls } from "../lib/bookmark-controls.ts";
import { VIEWS, type View } from "../lib/filter.ts";

const VIEW_LABELS: Record<View, string> = { today: "Today", inbox: "Inbox", done: "Done", all: "All" };
const VIEW_ICONS: Record<View, LucideIcon> = {
  today: CalendarCheckIcon,
  inbox: InboxIcon,
  done: CheckCheckIcon,
  all: LibraryIcon,
};
const TAB_ORDER: Record<View, string> = {
  today: "max-sm:order-1",
  inbox: "max-sm:order-2",
  done: "max-sm:order-4",
  all: "max-sm:order-5",
};

export function ViewTabs({ controls }: { controls: Controls }) {
  const { view, searching, counts, chooseView, settings, openSwipe } = controls;
  return (
    <nav
      aria-label="Views"
      className={cn(
        "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-20 max-sm:grid max-sm:items-center max-sm:border-t max-sm:bg-background/90 max-sm:px-safe-2 max-sm:pt-1.5 max-sm:pb-safe-2 max-sm:backdrop-blur-md sm:flex sm:items-center sm:gap-3",
        settings.swipeMode ? "max-sm:grid-cols-5" : "max-sm:grid-cols-4",
      )}
    >
      <fieldset
        aria-label="Choose a view"
        className="max-sm:contents sm:flex sm:w-fit sm:flex-wrap sm:gap-1 sm:rounded-full sm:bg-muted sm:p-1"
      >
        {VIEWS.map((v) => {
          const Icon = VIEW_ICONS[v];
          return (
            <button
              key={v}
              type="button"
              aria-pressed={view === v && !searching}
              aria-label={`${VIEW_LABELS[v]} ${counts[v]}`}
              onClick={() => chooseView(v)}
              className={cn(
                "inline-flex min-w-0 items-center justify-center rounded-full text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:text-foreground max-sm:h-13 max-sm:flex-col max-sm:gap-0.5 max-sm:text-[0.6875rem] sm:h-8 sm:gap-1.5 sm:px-3.5 sm:aria-pressed:bg-card sm:aria-pressed:shadow-xs",
                TAB_ORDER[v],
              )}
            >
              <Icon className="size-5 in-aria-pressed:text-brand-ink sm:hidden" aria-hidden="true" />
              <span className="flex items-baseline gap-1">
                {VIEW_LABELS[v]}
                <span className="text-muted-foreground tabular-nums in-aria-pressed:font-semibold in-aria-pressed:text-brand-ink sm:text-xs">
                  {counts[v]}
                </span>
              </span>
            </button>
          );
        })}
      </fieldset>
      {settings.swipeMode && (
        <Button
          type="button"
          onClick={openSwipe}
          aria-label="Swipe through cards"
          title="Swipe through cards (s)"
          className="max-sm:order-3 max-sm:size-12 max-sm:justify-self-center max-sm:rounded-full max-sm:shadow-md max-sm:transition-[scale] max-sm:duration-500 max-sm:ease-spring max-sm:active:scale-90 max-sm:active:duration-150 sm:h-9 sm:rounded-full sm:px-4"
        >
          <GalleryVerticalEndIcon className="max-sm:size-5" aria-hidden="true" />
          <span className="max-sm:sr-only">Swipe</span>
        </Button>
      )}
    </nav>
  );
}
