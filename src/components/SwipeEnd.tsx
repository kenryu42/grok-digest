import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "./ui/button.tsx";
import type { SwipeControls } from "../lib/swipe-mode.ts";

function cards(count: number): string {
  return `${count} ${count === 1 ? "card" : "cards"}`;
}

export function SwipeEnd({ swipe }: { swipe: SwipeControls }) {
  const { items, copy, copied } = swipe.deleteQueue;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-safe-6 text-center">
      <p className="font-heading text-2xl font-semibold">That's all {cards(swipe.pages.length)}</p>
      <p className="text-muted-foreground">Cards you mark done leave your inbox.</p>
      <div className="mt-2 flex gap-2">
        <Button type="button" variant="outline" onClick={() => swipe.goTo(0)} className="h-11 rounded-full px-5">
          Start over
        </Button>
        <Button type="button" onClick={swipe.close} className="h-11 rounded-full px-5">
          Close
        </Button>
      </div>
      {items.length > 0 && (
        <div className="mt-6 flex max-w-sm flex-col items-center gap-3 rounded-2xl border px-5 py-4">
          <p className="text-sm text-muted-foreground">
            {cards(items.length)} to delete. Copy the request and paste it to your Grok bot.
          </p>
          <Button type="button" variant="outline" onClick={copy} className="h-11 rounded-full px-5">
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {copied ? "Copied" : "Copy for Grok"}
          </Button>
        </div>
      )}
    </div>
  );
}
