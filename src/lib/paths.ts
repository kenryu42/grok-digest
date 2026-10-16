export const siteHref = (file: string): string => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${file}`;
