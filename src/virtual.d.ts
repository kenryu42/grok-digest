/// <reference types="astro/client" />

declare module "virtual:grok-digest/bookmarks" {
  const raw: unknown;
  export const source: string;
  export default raw;
}

declare module "virtual:grok-digest/scans" {
  const raw: unknown;
  export const source: string;
  export default raw;
}

declare module "virtual:grok-digest/config" {
  const raw: unknown;
  export const source: string;
  export default raw;
}

declare module "virtual:grok-digest/magazine" {
  const files: import("./lib/magazine.ts").IssueFile[];
  export default files;
}

declare module "virtual:grok-digest/theme.css";
