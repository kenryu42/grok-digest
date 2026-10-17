import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { cn } from "cn";
import { LinkCard } from "./LinkCard.tsx";
import { PostBody } from "./PostBody.tsx";
import { TopicTile } from "./TopicTile.tsx";
import { hostOf } from "../lib/card-kind.ts";
import { SpeedStage } from "./SpeedStage.tsx";
import { shows } from "../lib/depth.ts";
import type { PostPart } from "../lib/media.ts";
import { CARD_DEPTH, type BlockKind, type SwipeControls, type SwipePage } from "../lib/swipe-mode.ts";
import { TOPIC_LABELS } from "../lib/topics.ts";

const KEYBOARD_CLICK = 0;

const BLOCK_STYLES: Record<BlockKind, string> = {
  headline: "font-heading text-headline leading-snug font-semibold text-balance sm:text-3xl",
  summary: "font-serif text-lg leading-relaxed text-pretty sm:text-xl",
  point: "border-l-2 border-border pl-4 text-base leading-relaxed text-pretty sm:text-lg",
  action: "rounded-lg bg-brand-soft px-3 py-2 text-base leading-relaxed text-pretty sm:text-lg",
  post: "text-base leading-relaxed whitespace-pre-wrap text-foreground/85",
};

export function SwipeCard({ swipe, page, current }: { swipe: SwipeControls; page: SwipePage; current: boolean }) {
  const { done, reading, expanded, toggleExpanded } = swipe;
  const open = expanded.has(page.id);
  const coverRef = useCoverThatKeepsItsPlace(open);
  const firstLink = page.links[0] ?? page.post.flatMap((part) => (part.kind === "link" ? [part.link] : []))[0];
  return (
    <article data-topic={page.topic} className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4">
      {page.cover !== undefined && (
        <img
          ref={coverRef}
          src={page.cover.url}
          alt={page.cover.alt}
          hidden={open}
          className="aspect-video w-full rounded-xl bg-muted object-cover"
        />
      )}
      <div className="flex items-center gap-3">
        {page.cover === undefined && page.topic !== undefined && (
          <TopicTile
            topic={page.topic}
            seed={page.id}
            letter={firstLink === undefined ? undefined : hostOf(firstLink.url).charAt(0).toUpperCase()}
            className="relative size-11 shrink-0 rounded-lg"
          />
        )}
        <p className="flex min-w-0 flex-1 flex-col gap-0.5">
          {page.topic !== undefined && (
            <span className="text-xs font-semibold tracking-wider text-topic uppercase">
              {TOPIC_LABELS[page.topic]}
            </span>
          )}
          <span className="truncate text-sm text-muted-foreground">{page.author}</span>
        </p>
        {done.has(page.id) && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-done px-2 py-0.5 text-xs font-medium text-done-foreground">
            <CheckIcon className="size-3" aria-hidden="true" />
            Done
          </span>
        )}
      </div>
      <h2 className={BLOCK_STYLES.headline}>{page.headline}</h2>
      {current && reading ? (
        <SpeedStage swipe={swipe} />
      ) : (
        <div className="flex flex-col gap-4">
          {page.blocks
            .filter((block) => shows(CARD_DEPTH, block.level))
            .map((block) => (
              <p key={block.key} className={BLOCK_STYLES[block.kind]}>
                {block.kind === "action" && <span className="font-medium text-brand-ink">Try: </span>}
                {block.text}
              </p>
            ))}
          {page.links.length > 0 && (
            <ul className="flex max-w-md flex-col gap-2" aria-label="Links in the post">
              {page.links.map((link) => (
                <li key={link.url}>
                  <LinkCard {...link} />
                </li>
              ))}
            </ul>
          )}
          {page.post.length > 0 && (
            <OriginalPost parts={page.post} open={open} onToggle={() => toggleExpanded(page.id)} />
          )}
        </div>
      )}
    </article>
  );
}

function useCoverThatKeepsItsPlace(open: boolean) {
  const coverRef = useRef<HTMLImageElement>(null);
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    const cover = coverRef.current;
    const scroller = cover?.closest("article")?.parentElement;
    const next = cover?.nextElementSibling;
    if (wasOpen.current === open) return;
    wasOpen.current = open;
    if (cover === null || !(scroller instanceof HTMLElement) || !(next instanceof HTMLElement)) return;
    cover.hidden = false;
    const coverSpace = next.offsetTop - cover.offsetTop;
    cover.hidden = open;
    scroller.scrollTop += open ? -coverSpace : coverSpace;
  }, [open]);
  return coverRef;
}

const POST_LABEL = "text-xs font-medium text-muted-foreground";
const PEEK_THUMBNAILS = 4;

function OriginalPost({ parts, open, onToggle }: { parts: readonly PostPart[]; open: boolean; onToggle: () => void }) {
  if (!open) {
    const images = parts.flatMap((part) => (part.kind === "images" ? part.images : []));
    const text = parts.flatMap((part) => (part.kind === "text" ? [part.text] : [])).join(" ");
    return (
      <button
        type="button"
        data-swipe-peek
        aria-expanded="false"
        onClick={(event) => {
          if (event.detail === KEYBOARD_CLICK) onToggle();
        }}
        className="flex flex-col gap-1 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className={cn(POST_LABEL, "flex items-center gap-1")}>
          Original post
          <ChevronDownIcon className="size-3.5" aria-hidden="true" />
        </span>
        {text !== "" && (
          <span
            className={cn(
              BLOCK_STYLES.post,
              "line-clamp-2 [mask-image:linear-gradient(to_bottom,black_30%,transparent)]",
            )}
          >
            {text}
          </span>
        )}
        {images.length > 0 && (
          <span className="mt-1 flex items-center gap-2">
            {images.slice(0, PEEK_THUMBNAILS).map((image) => (
              <img
                key={image.url}
                src={image.url}
                alt=""
                className="size-14 rounded-md border border-border bg-muted object-cover"
              />
            ))}
            {images.length > PEEK_THUMBNAILS && (
              <span className="text-sm font-medium text-muted-foreground tabular-nums">
                +{images.length - PEEK_THUMBNAILS}
              </span>
            )}
          </span>
        )}
      </button>
    );
  }
  return (
    <section aria-label="Original post" className="flex flex-col gap-2">
      <h3 className={POST_LABEL}>Original post</h3>
      <PostBody parts={parts} className="text-base text-foreground/85 sm:text-lg" />
      <button
        type="button"
        aria-expanded="true"
        onClick={onToggle}
        className="flex items-center gap-1 self-start rounded-md py-2 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ChevronUpIcon className="size-4" aria-hidden="true" />
        Show less
      </button>
    </section>
  );
}
