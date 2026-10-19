import type { ReactNode } from "react";
import { CheckIcon, CopyIcon, InboxIcon, ShareIcon } from "lucide-react";
import { cn } from "cn";
import { SwipeCard } from "virtual:grok-digest/components/SwipeCard";
import { SwipeEnd } from "virtual:grok-digest/components/SwipeEnd";
import { SwipeFooter } from "virtual:grok-digest/components/SwipeFooter";
import { SwipeHeader } from "virtual:grok-digest/components/SwipeHeader";
import { useSwipeMode } from "../lib/swipe-mode.ts";

type Props = Parameters<typeof useSwipeMode>[0];

export function SwipeMode(props: Props) {
  const { swipe, frame } = useSwipeMode(props);
  const { dialogRef, pagerRef, moverRef, onDialogClose, act, nudging, pagerHandlers } = frame;
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
        data-nudge={nudging || undefined}
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
              className="group/page relative flex h-[calc(100%-3.5rem)] snap-start snap-always flex-col touch-pan-y"
            >
              {isCurrent && (
                <>
                  <div
                    data-swipe-tray="right"
                    className="invisible absolute inset-y-0 left-0 flex items-center gap-4 px-safe-4 group-data-[swiping=right]/page:visible"
                  >
                    {swipe.canShare && (
                      <TrayButton label="Share" tone="bg-sky-500 text-white" onClick={() => act("share")}>
                        <ShareIcon />
                      </TrayButton>
                    )}
                    <TrayButton
                      label={swipe.copied ? "Copied" : "Copy"}
                      tone="bg-zinc-500 text-white"
                      onClick={() => act("copy")}
                    >
                      {swipe.copied ? <CheckIcon /> : <CopyIcon />}
                    </TrayButton>
                  </div>
                  <div
                    data-swipe-tray="left"
                    className="invisible absolute inset-y-0 right-0 flex items-center gap-4 px-safe-4 group-data-[swiping=left]/page:visible"
                  >
                    {swipe.pageDone ? (
                      <TrayButton label="Inbox" tone="bg-muted-foreground text-background" onClick={() => act("done")}>
                        <InboxIcon />
                      </TrayButton>
                    ) : (
                      <TrayButton label="Done" tone="bg-done text-done-foreground" onClick={() => act("done")}>
                        <CheckIcon />
                      </TrayButton>
                    )}
                  </div>
                </>
              )}
              <div
                ref={isCurrent ? moverRef : undefined}
                className="relative flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto [overflow-anchor:none] rounded-t-3xl border-t bg-background px-safe-5 pt-3 pb-8 transition-[border-color,opacity] duration-300 opacity-60 group-data-current/page:border-transparent group-data-current/page:opacity-100"
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

function TrayButton({
  label,
  tone,
  onClick,
  children,
}: {
  label: string;
  tone: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 text-sm font-medium text-muted-foreground outline-none"
    >
      <span
        className={cn(
          "flex size-14 items-center justify-center rounded-full shadow-sm in-focus-visible:ring-3 in-focus-visible:ring-ring/50 [&_svg]:size-6",
          tone,
        )}
      >
        {children}
      </span>
      {label}
    </button>
  );
}
