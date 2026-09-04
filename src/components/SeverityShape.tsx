import { RING_INNER, RING_OUTER, RING_WIDTH_PX, shapePoints, type MarkerShape } from "@/lib/severity-tokens";

/**
 * One shape-coded, anti-camouflage-ringed swatch — the shared unit this
 * whole task's symbology system is built from. Used at small scale here
 * (table badges, the map legend) and the same shape ids drive the actual map
 * markers in lib/defect-overlay.ts, which draws the same silhouettes at
 * marker scale on a <canvas> instead of inline SVG (Mapbox needs a raster
 * sprite, not a DOM node) — kept as two implementations of one shape
 * vocabulary rather than one shared renderer, because nothing else here runs
 * inside a WebGL context.
 *
 * THE RING IS THREE NESTED SHAPES, NOT ONE STROKE
 * -----------------------------------------------------
 * An SVG `stroke` is centred ON a path's edge, so two different-width strokes
 * on the same path overlap rather than sit side by side — that draws one
 * blended edge, not two offset rings. Actual concentric offset rings need
 * three separate filled shapes at decreasing size, back to front: a full-size
 * black shape, a smaller white shape inset inside it, and the coloured fill
 * inset inside that. What's visible of each outer layer is only the sliver
 * the next layer inward doesn't cover — which is the offset border the brief
 * asks for. See lib/severity-tokens.ts's RING_* constants for the widths.
 */
export function SeverityShape({
  shape, fill, size = 9, pulse = false,
}: {
  shape: MarkerShape;
  /** Vivid fill — always the `.vivid` token, never `.text`. A shape drawn
   *  with its text-safe shade would be legible but color-mismatched against
   *  the map marker for the same tier. */
  fill: string;
  size?: number;
  /** Critical-only "dynamic inner pulse" — see PULSE_* in severity-tokens.ts. */
  pulse?: boolean;
}) {
  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {pulse && (
        <span
          className="absolute inset-0 rounded-full animate-critical-pulse"
          style={{ backgroundColor: fill }}
        />
      )}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative">
        {/* Back to front: black (full size) -> white (inset) -> fill (inset further). */}
        <ShapePath shape={shape} size={size} inset={0} fill={RING_INNER} />
        <ShapePath shape={shape} size={size} inset={RING_WIDTH_PX} fill={RING_OUTER} />
        <ShapePath shape={shape} size={size} inset={RING_WIDTH_PX * 2} fill={fill} />
      </svg>
    </span>
  );
}

function ShapePath({ shape, size, inset, fill }: { shape: MarkerShape; size: number; inset: number; fill: string }) {
  if (shape === "circle") {
    const r = size / 2;
    return <circle cx={r} cy={r} r={r - inset} fill={fill} />;
  }
  const points = shapePoints(shape, size, inset).map(pt => pt.join(",")).join(" ");
  return <polygon points={points} fill={fill} />;
}
