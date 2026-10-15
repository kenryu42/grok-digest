import favicon from "../assets/favicon.svg?raw";

export const GET = (): Response => new Response(favicon, { headers: { "Content-Type": "image/svg+xml" } });
