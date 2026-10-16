import { DEPTHS, type Depth } from "../lib/depth.ts";

const ROW_HEIGHT = 6;
const ICON_BOTTOM = 21;
const FULL_ICON_FILL = "M5 3H19a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z";

const iconFill = (filledRows: number): string =>
  filledRows === DEPTHS.length - 1
    ? FULL_ICON_FILL
    : `M3 ${ICON_BOTTOM - filledRows * ROW_HEIGHT}H21V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z`;

export function DepthIcon({ depth }: { depth: Depth }) {
  const filledRows = DEPTHS.indexOf(depth);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-filled-rows={filledRows}
    >
      {filledRows > 0 && <path d={iconFill(filledRows)} className="fill-brand stroke-none" />}
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M21 9H3" />
      <path d="M21 15H3" />
    </svg>
  );
}
