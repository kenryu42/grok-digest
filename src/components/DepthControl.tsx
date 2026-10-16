import { cn } from "cn";
import { useRef, useState, type PointerEvent } from "react";
import { DEPTH_LABELS, DEPTHS, type Depth } from "../lib/depth.ts";

const DRAG_START_DISTANCE = 4;

type Props = {
  depth: Depth;
  onChange: (depth: Depth) => void;
};

type Press = { pointerId: number; startX: number; dragging: boolean };

export function DepthControl({ depth, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<Press | null>(null);
  const [dragX, setDragX] = useState<number | null>(null);
  const index = DEPTHS.indexOf(depth);

  const stopAt = (clientX: number): { x: number; depth: Depth } => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect === undefined) return { x: 0, depth };
    const stop = rect.width / DEPTHS.length;
    const x = Math.min(Math.max(clientX - rect.left - stop / 2, 0), rect.width - stop);
    return { x, depth: DEPTHS[Math.round(x / stop)] ?? depth };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (!event.isPrimary || event.button !== 0) return;
    pressRef.current = { pointerId: event.pointerId, startX: event.clientX, dragging: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const press = pressRef.current;
    if (press === null || press.pointerId !== event.pointerId) return;
    if (event.buttons === 0) {
      onPointerCancel();
      return;
    }
    if (!press.dragging) {
      if (Math.abs(event.clientX - press.startX) < DRAG_START_DISTANCE) return;
      press.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const stop = stopAt(event.clientX);
    setDragX(stop.x);
    onChange(stop.depth);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const press = pressRef.current;
    if (press === null || press.pointerId !== event.pointerId) return;
    pressRef.current = null;
    setDragX(null);
    onChange(stopAt(event.clientX).depth);
  };

  const onPointerCancel = (): void => {
    pressRef.current = null;
    setDragX(null);
  };

  return (
    <div className="relative">
      <input
        type="range"
        min={0}
        max={DEPTHS.length - 1}
        step={1}
        value={index}
        onChange={(event) => onChange(DEPTHS[Number(event.target.value)] ?? depth)}
        aria-label="Detail"
        aria-valuetext={DEPTH_LABELS[depth]}
        className="peer sr-only"
      />
      <div
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="relative h-9 cursor-pointer touch-pan-y rounded-full bg-muted p-1 select-none peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
      >
        <div ref={trackRef} className="relative grid h-full grid-cols-4">
          <span
            data-depth-thumb
            style={{ transform: dragX === null ? `translateX(${index * 100}%)` : `translateX(${dragX}px)` }}
            className={cn(
              "absolute inset-y-0 left-0 w-1/4 rounded-full bg-card shadow-xs",
              dragX === null && "transition-transform duration-500 ease-spring",
            )}
          />
          {DEPTHS.map((d) => (
            <span
              key={d}
              data-depth-stop={d}
              className={cn(
                "relative flex items-center justify-center text-sm font-medium text-muted-foreground transition-colors",
                d === depth && "text-foreground",
              )}
            >
              {DEPTH_LABELS[d]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

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
