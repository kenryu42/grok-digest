import robots from "../assets/robots.txt?raw";

export const GET = (): Response => new Response(robots, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
