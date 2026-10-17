import { CheckIcon, CopyIcon, Trash2Icon } from "lucide-react";
import { Button } from "./ui/button.tsx";
import type { Controls } from "../lib/bookmark-controls.ts";

export function DeleteQueue({ controls }: { controls: Controls }) {
  const { items, copy, copied, restore } = controls.deleteQueue;
  if (items.length === 0) return null;
  return (
    <details className="group/queue rounded-2xl border px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <Trash2Icon className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        <span className="flex-1">
          {items.length} to delete <span className="text-muted-foreground group-open/queue:hidden">· Show</span>
          <span className="hidden text-muted-foreground group-open/queue:inline">· Hide</span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.preventDefault();
            copy();
          }}
          className="h-9 rounded-full px-3"
        >
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          {copied ? "Copied" : "Copy for Grok"}
        </Button>
      </summary>
      <p className="mt-3 text-muted-foreground">
        These are hidden on this device. Paste the request to your Grok bot and it removes them for good; each one
        leaves this list once it has.
      </p>
      <ul className="mt-3 flex flex-col divide-y">
        {items.map(({ id, headline, author }) => (
          <li key={id} className="flex items-center gap-3 py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{headline}</span>
              <span className="truncate text-xs text-muted-foreground">{author}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => restore(id)}
              className="h-9 rounded-full px-3"
            >
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
