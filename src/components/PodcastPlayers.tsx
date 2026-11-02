import { useEffect } from "react";
import { startPodcasts } from "../lib/podcast-player.ts";

export function PodcastPlayers() {
  useEffect(startPodcasts, []);
  return null;
}
