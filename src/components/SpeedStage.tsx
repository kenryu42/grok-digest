import { cn } from "cn";
import { prefersReducedMotion } from "../lib/morph.ts";
import { graphemes, stepMs, type ReadToken } from "../lib/reading.ts";
import type { BlockKind, SwipeControls } from "../lib/swipe-mode.ts";

const BLOCK_LABELS: Record<BlockKind, string> = {
  headline: "Headline",
  summary: "Summary",
  point: "Key point",
  action: "Try",
  post: "Original post",
};

export function SpeedStage({ swipe }: { swipe: SwipeControls }) {
  const { plan, step, playing, starting, speed, blocks: labels } = swipe;
  const word = plan.words[step];
  const block = labels[word?.block ?? 0];
  const letters = graphemes(word?.text ?? "");
  const focus = word?.focus ?? 0;
  return (
    <div data-speed-stage className="flex min-h-56 flex-1 flex-col items-center justify-center gap-6">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {block === undefined ? "" : BLOCK_LABELS[block.kind]}
      </p>
      {playing || starting || word === undefined ? (
        <div className="relative w-full py-6">
          <span aria-hidden="true" className="absolute top-0 left-1/2 h-3 border-l border-brand/60" />
          <span aria-hidden="true" className="absolute bottom-0 left-1/2 h-3 border-l border-brand/60" />
          <p
            key={step}
            data-speed-word
            className="grid w-full grid-cols-[1fr_auto_1fr] font-heading text-4xl leading-none whitespace-pre"
            style={
              playing && !prefersReducedMotion()
                ? { animation: `word-flash ${stepMs(plan, step, speed)}ms linear both` }
                : undefined
            }
          >
            <span className="text-right">{letters.slice(0, focus).join("")}</span>
            <span className="text-brand-ink">{letters[focus] ?? ""}</span>
            <span>{letters.slice(focus + 1).join("")}</span>
          </p>
        </div>
      ) : (
        <p data-speed-paused className="max-h-[50vh] overflow-y-auto text-xl leading-relaxed text-pretty">
          <BlockWords tokens={plan.blocks[word.block] ?? []} step={step} />
        </p>
      )}
    </div>
  );
}

function BlockWords({ tokens, step }: { tokens: ReadToken[]; step: number }) {
  return tokens.map((token) => (
    <span
      key={token.at}
      className={cn(
        token.word && token.step === step && "rounded-sm bg-brand-soft shadow-[0_0_0_2px_var(--brand-soft)]",
      )}
    >
      {token.text}
    </span>
  ));
}
