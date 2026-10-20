export const TOPICS = [
  "ai-agents",
  "models-releases",
  "dev-tools",
  "startups-business",
  "japan-tech",
  "design",
  "science",
  "world",
  "culture",
  "history",
  "economics",
  "health",
  "other",
] as const;

export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  "ai-agents": "AI agents",
  "models-releases": "Models & releases",
  "dev-tools": "Dev tools",
  "startups-business": "Startups & business",
  "japan-tech": "Japan tech",
  design: "Design",
  science: "Science",
  world: "World",
  culture: "Culture",
  history: "History",
  economics: "Economics",
  health: "Health",
  other: "Other",
};
