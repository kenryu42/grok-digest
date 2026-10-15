import icon180 from "../assets/icon-180.png?inline";
import icon192 from "../assets/icon-192.png?inline";
import icon512 from "../assets/icon-512.png?inline";

const ICONS: Record<string, string> = { "180": icon180, "192": icon192, "512": icon512 };

export const getStaticPaths = () => Object.keys(ICONS).map((size) => ({ params: { size } }));

export const GET = ({ params }: { params: { size?: string } }): Response => {
  const dataUrl = ICONS[params.size ?? ""] ?? "";
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  return new Response(bytes, { headers: { "Content-Type": "image/png" } });
};
