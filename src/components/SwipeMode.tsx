import { CheckIcon, InboxIcon } from "lucide-react";
import { SwipeCard } from "virtual:grok-digest/components/SwipeCard";
import { SwipeEnd } from "virtual:grok-digest/components/SwipeEnd";
import { SwipeFooter } from "virtual:grok-digest/components/SwipeFooter";
import { SwipeHeader } from "virtual:grok-digest/components/SwipeHeader";
import { useSwipeMode } from "../lib/swipe-mode.ts";

type Props = Parameters<typeof useSwipeMode>[0];

export function SwipeMode(props: Props) {
  const { swipe, frame } = useSwipeMode(props);
  const { dialogRef, pagerRef, moverRef, onDialogClose, pagerHandlers } = frame;
  return (
    <dialog
      ref={dialogRef}
      aria-label="Swipe mode"
      onClose={onDialogClose}
      className="fixed inset-0 m-0 hidden h-dvh max-h-none w-full max-w-none flex-col bg-background p-0 text-foreground backdrop:bg-background open:flex motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-300"
    >
      <SwipeHeader swipe={swipe} />

      <div
        ref={pagerRef}
        tabIndex={-1}
        data-swipe-pager
        {...pagerHandlers}
        className="relative min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [scrollbar-width:none]"
      >
        {swipe.pages.map((page, index) => {
          const isCurrent = index === swipe.current;
          return (
            <section
              key={page.id}
              data-swipe-page={page.id}
              data-current={isCurrent || undefined}
              className="group/page relative flex h-full snap-start snap-always flex-col touch-pan-y"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 hidden items-center justify-end gap-2 bg-done px-8 text-lg font-medium text-done-foreground group-data-[swiping=done]/page:flex"
              >
                <CheckIcon className="size-5" />
                Done
              </span>
              <span
                aria-hidden="true"
                className="absolute inset-0 hidden items-center justify-end gap-2 bg-muted px-8 text-lg font-medium text-foreground group-data-[swiping=inbox]/page:flex"
              >
                <InboxIcon className="size-5" />
                Back to inbox
              </span>
              <div
                ref={isCurrent ? moverRef : undefined}
                className="relative flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto bg-background px-safe-5 pt-3 pb-8"
              >
                <SwipeCard swipe={swipe} page={page} current={isCurrent} />
              </div>
            </section>
          );
        })}
        <section className="flex min-h-full snap-start snap-always flex-col">
          <SwipeEnd swipe={swipe} />
        </section>
      </div>

      <SwipeFooter swipe={swipe} />
    </dialog>
  );
}
