import { LinkIcon } from "lucide-react";
import type { PostLink } from "../lib/bookmarks.ts";
import { hostOf } from "../lib/card-kind.ts";

export function LinkCard({ url, title, image }: PostLink) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-link-card
      className="group/link flex overflow-hidden rounded-xl border border-border transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none has-[img:not([hidden])]:flex-col"
    >
      {image !== undefined && (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          className="aspect-[1.91/1] w-full border-b border-border bg-muted object-cover"
        />
      )}
      <span className="flex w-16 shrink-0 items-center justify-center border-r border-border bg-muted text-muted-foreground group-has-[img:not([hidden])]/link:hidden">
        <LinkIcon className="size-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2.5">
        <span className="truncate text-xs text-muted-foreground">{hostOf(url)}</span>
        <span
          data-link-title
          className="line-clamp-2 text-sm font-medium text-pretty text-foreground group-hover/link:underline group-hover/link:decoration-brand group-hover/link:underline-offset-4"
        >
          {title}
        </span>
      </span>
    </a>
  );
}
