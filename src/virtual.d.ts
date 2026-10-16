/// <reference types="astro/client" />

declare module "virtual:grok-digest/bookmarks" {
  const raw: unknown;
  export const source: string;
  export default raw;
}

declare module "virtual:grok-digest/config" {
  const raw: unknown;
  export const source: string;
  export default raw;
}

declare module "virtual:grok-digest/theme.css";

declare module "virtual:grok-digest/components/Header.astro" {
  const Header: typeof import("./components/Header.astro").default;
  export default Header;
}

declare module "virtual:grok-digest/components/Footer.astro" {
  const Footer: typeof import("./components/Footer.astro").default;
  export default Footer;
}

declare module "virtual:grok-digest/components/BookmarkCard.astro" {
  const BookmarkCard: typeof import("./components/BookmarkCard.astro").default;
  export default BookmarkCard;
}
