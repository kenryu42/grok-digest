import { useEffect } from "react";
import { openXLinksInApp } from "../lib/x-app-link.ts";

export function XAppLinks() {
  useEffect(() => openXLinksInApp(window), []);
  return null;
}
