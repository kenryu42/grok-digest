import { ControlsLayout } from "virtual:grok-digest/components/ControlsLayout";
import { SwipeMode } from "./SwipeMode.tsx";
import { useBookmarkControls } from "../lib/bookmark-controls.ts";
import type { PageSettings } from "../lib/custom.ts";
import type { SearchEntry } from "../lib/search.ts";

type Props = {
  entries: SearchEntry[];
  settings: PageSettings;
};

export function BookmarkControls({ entries, settings }: Props) {
  const { controls, swipe } = useBookmarkControls({ entries, settings });
  return (
    <>
      <ControlsLayout controls={controls} />
      {swipe !== null && (
        <SwipeMode
          cards={swipe.cards}
          start={swipe.start}
          done={swipe.done}
          onToggleDone={swipe.toggleDone}
          onLater={swipe.later}
          onClose={swipe.close}
        />
      )}
    </>
  );
}
