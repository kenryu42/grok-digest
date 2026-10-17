import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "./ui/button.tsx";
import type { Controls } from "../lib/bookmark-controls.ts";

export function DoneCleanup({ controls }: { controls: Controls }) {
  const { view, searching, counts, copyDoneRequest, doneRequestCopied } = controls;
  if (view !== "done" || searching || counts.done === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm">
      <p className="flex-1 text-muted-foreground">
        To remove these for good, copy a request and paste it to your Grok bot.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-done-request
        onClick={copyDoneRequest}
        className="h-9 shrink-0 rounded-full px-3"
      >
        {doneRequestCopied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        {doneRequestCopied ? "Copied" : "Copy for Grok"}
      </Button>
    </div>
  );
}
