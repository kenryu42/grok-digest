import { Button } from "./ui/button.tsx";
import type { SwipeControls } from "../lib/swipe-mode.ts";

export function SwipeEnd({ swipe }: { swipe: SwipeControls }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-safe-6 text-center">
      <p className="font-heading text-2xl font-semibold">That's all {swipe.pages.length} cards</p>
      <p className="text-muted-foreground">Cards you mark done leave your inbox.</p>
      <div className="mt-2 flex gap-2">
        <Button type="button" variant="outline" onClick={() => swipe.goTo(0)} className="h-11 rounded-full px-5">
          Start over
        </Button>
        <Button type="button" onClick={swipe.close} className="h-11 rounded-full px-5">
          Close
        </Button>
      </div>
    </div>
  );
}
