export const siteHref = (file: string): string => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${file}`;

export const cardHref = (id: string): string => siteHref(`#b-${id}`);

export const issueHref = (date?: string): string => siteHref(date === undefined ? "magazine/" : `magazine/${date}/`);
