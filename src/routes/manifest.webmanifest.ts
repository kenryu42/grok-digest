import { DEFAULT_TITLE } from "../lib/custom.ts";
import { siteConfig } from "../lib/site-config.ts";

const manifest = {
  name: siteConfig.title,
  short_name: siteConfig.title === DEFAULT_TITLE ? "Digest" : siteConfig.title,
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#f9f6f1",
  theme_color: "#f9f6f1",
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
  ],
};

export const GET = (): Response =>
  new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json" } });
