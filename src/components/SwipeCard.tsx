import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "cn";
import { LinkCard } from "./LinkCard.tsx";
import { SpeedStage } from "./SpeedStage.tsx";
import { shows } from "../lib/depth.ts";
import { CARD_DEPTH, type BlockKind, type SwipeBlock, type SwipeControls, type SwipePage } from "../lib/swipe-mode.ts";
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
  return (
    <article data-topic={page.topic} className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-topic" />
        <span className="min-w-0 truncate">
          {page.topic === undefined ? page.author : `${TOPIC_LABELS[page.topic]} · ${page.author}`}
        </span>
        {done.has(page.id) && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-done px-2 py-0.5 text-xs font-medium text-done-foreground">
            <CheckIcon className="size-3" aria-hidden="true" />
            Done
          </span>
        )}
      </p>
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
          {page.blocks.some((block) => !shows(CARD_DEPTH, block.level)) && (
            <OriginalPost
              blocks={page.blocks.filter((block) => !shows(CARD_DEPTH, block.level))}
              open={expanded.has(page.id)}
              onToggle={() => toggleExpanded(page.id)}
            />
          )}
        </div>
      )}
    </article>
  );
}

const POST_LABEL = "text-xs font-medium text-muted-foreground";

function OriginalPost({
  blocks,
  open,
  onToggle,
}: {
  blocks: readonly SwipeBlock[];
  open: boolean;
  onToggle: () => void;
}) {
  if (!open) {
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
        <span
          className={cn(
            BLOCK_STYLES.post,
            "line-clamp-2 [mask-image:linear-gradient(to_bottom,black_30%,transparent)]",
          )}
        >
          {blocks.map(({ text }) => text).join(" ")}
        </span>
      </button>
    );
  }
  return (
    <section aria-label="Original post" className="flex flex-col gap-2">
      <h3 className={POST_LABEL}>Original post</h3>
      {blocks.map((block) => (
        <p key={block.key} className={BLOCK_STYLES[block.kind]}>
          {block.text}
        </p>
      ))}
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
