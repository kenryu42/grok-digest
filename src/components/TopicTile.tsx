import {
  AsteriskIcon,
  BotIcon,
  BoxesIcon,
  DramaIcon,
  FlaskConicalIcon,
  GlobeIcon,
  HeartPulseIcon,
  LandmarkIcon,
  PenToolIcon,
  ScrollIcon,
  TerminalIcon,
  TrainFrontIcon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import type { Topic } from "../lib/topics.ts";

const PLACEMENTS = [
  "[--tile-x:18%] [--tile-y:12%] [--tile-turn:8deg]",
  "[--tile-x:82%] [--tile-y:20%] [--tile-turn:-14deg]",
  "[--tile-x:30%] [--tile-y:85%] [--tile-turn:22deg]",
  "[--tile-x:75%] [--tile-y:78%] [--tile-turn:-6deg]",
  "[--tile-x:50%] [--tile-y:5%] [--tile-turn:34deg]",
  "[--tile-x:10%] [--tile-y:55%] [--tile-turn:-28deg]",
] as const;

const TOPIC_GLYPHS: Record<Topic, LucideIcon> = {
  "ai-agents": BotIcon,
  "models-releases": BoxesIcon,
  "dev-tools": TerminalIcon,
  "startups-business": TrendingUpIcon,
  "japan-tech": TrainFrontIcon,
  design: PenToolIcon,
  science: FlaskConicalIcon,
  world: GlobeIcon,
  culture: DramaIcon,
  history: ScrollIcon,
  economics: LandmarkIcon,
  health: HeartPulseIcon,
  other: AsteriskIcon,
};

function hashOf(seed: string): number {
  let hash = 7;
  for (let index = 0; index < seed.length; index++) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash;
}

export function TopicTile({
  topic,
  seed,
  letter,
  className,
}: {
  topic: Topic;
  seed: string;
  letter?: string | undefined;
  className?: string;
}) {
  const Glyph = TOPIC_GLYPHS[topic];
  return (
    <span
      aria-hidden="true"
      data-topic={topic}
      className={cn(
        "topic-tile flex items-center justify-center overflow-hidden text-white [container-type:size]",
        PLACEMENTS[hashOf(seed) % PLACEMENTS.length],
        className,
      )}
    >
      <Glyph
        className="absolute -right-[20%] -bottom-[25%] size-[110%] rotate-(--tile-turn) opacity-15"
        strokeWidth={1}
      />
      {letter === undefined ? (
        <Glyph className="relative size-[min(40%,4rem)] drop-shadow-sm" strokeWidth={1.75} />
      ) : (
        <span className="relative font-serif text-[min(48cqmin,4rem)] leading-none font-semibold drop-shadow-sm">
          {letter}
        </span>
      )}
    </span>
  );
}
