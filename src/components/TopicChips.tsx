import { cn } from "cn";
import { Button } from "./ui/button.tsx";
import type { Controls } from "../lib/bookmark-controls.ts";
import { TOPIC_LABELS, type Topic } from "../lib/topics.ts";

export function TopicChips({ controls }: { controls: Controls }) {
  const { topic, topics, chooseTopic, topicsRef } = controls;
  return (
    <fieldset
      ref={topicsRef}
      aria-label="Filter by topic"
      className="relative flex min-w-0 flex-1 gap-2 max-sm:-ml-4 max-sm:snap-x max-sm:scroll-px-4 max-sm:overflow-x-auto max-sm:pr-6 max-sm:pl-4 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-1.5rem),transparent)] max-sm:[scrollbar-width:none] sm:flex-wrap"
    >
      <TopicChip label="All topics" pressed={topic === null} onClick={() => chooseTopic(null)} />
      {topics.map((t) => (
        <TopicChip key={t} topic={t} label={TOPIC_LABELS[t]} pressed={topic === t} onClick={() => chooseTopic(t)} />
      ))}
    </fieldset>
  );
}

function TopicChip({
  topic,
  label,
  pressed,
  onClick,
}: {
  topic?: Topic;
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? "default" : "outline"}
      aria-pressed={pressed}
      onClick={onClick}
      data-topic={topic}
      className={cn(
        "snap-start rounded-full px-3 max-sm:h-9",
        topic !== undefined && pressed && "bg-topic text-topic-foreground hover:bg-topic/85",
      )}
    >
      {topic !== undefined && (
        <span aria-hidden="true" className="size-2 rounded-full bg-topic group-aria-pressed/button:bg-current" />
      )}
      {label}
    </Button>
  );
}
