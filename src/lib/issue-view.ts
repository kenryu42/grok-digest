import { STORAGE_PREFIX } from "./storage.ts";

export const ISSUE_VIEWS = ["magazine", "digest"] as const;
export type IssueView = (typeof ISSUE_VIEWS)[number];
export const DEFAULT_ISSUE_VIEW: IssueView = "magazine";
export const ISSUE_VIEW_PARAM = "view";
export const ISSUE_VIEW_STORAGE_KEY = `${STORAGE_PREFIX}issue-view`;

export const ISSUE_VIEW_LABELS: Record<IssueView, string> = {
  magazine: "Magazine",
  digest: "Digest",
};
