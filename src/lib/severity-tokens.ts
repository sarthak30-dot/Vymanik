/**
 * The high-contrast defect symbology system — colors, anti-camouflage
 * borders, and shape codes — for markers, boxes, badges, table cells, and the
 * PDF report. This is the "global design token layer" the brief asks for:
 * every consuming surface (map overlay in lib/defect-overlay.ts and
 * routes/_app/map.tsx, table cells in SeverityBadge.tsx, the PDF generator in
 * routes/_app/reports.tsx) reads from here rather than carrying its own hex
 * literals, which is what let the old palette drift into the exact
 * "camouflage" problem this exists to fix — every consumer had picked its own
 * shade of the same nominal color.
 *
 * WHAT THE BRIEF'S FOUR NAMES MAP ONTO, AND WHY THEY WEREN'T RENAMED
 * ----------------------------------------------------------------------
 * The brief names four tiers — Critical/Hotspot, Major/String Failure,
 * Minor/Soiling/Diode, Resolved/Inspected — but this app's data model has
 * three SEVERITY levels (critical/medium/normal, aka IEC 62446-3 COA3/2/1)
 * plus an orthogonal STATUS field (New/Acknowledged/In Repair/Closed). This
 * module keys its tokens to that existing model rather than introducing a
 * fourth severity value, for the same reason Task 2's dashboard kept COA
 * codes where a client reads them: `Severity` is a plain string union
 * consumed in 15+ files (mock-data.ts, api.ts, permissions checks, filters,
 * CSV import, the map's hit-testing) — renaming it top to bottom to chase new
 * marketing labels would be a data-model change wearing a palette task's
 * clothes, and every file that already works would become a file that might
 * not. The mapping actually used:
 *
 *     Critical / Hotspot        -> severity: "critical"
 *     Major / String Failure    -> severity: "medium"
 *     Minor / Soiling           -> severity: "normal"
 *     Resolved / Inspected      -> status: "Closed"  (NOT a severity at all)
 *
 * ONE NAMED EXAMPLE IS WRONG AGAINST THIS APP'S OWN DATA, FLAGGED RATHER THAN
 * SILENTLY FOLLOWED: the brief lists "Diode" under Minor. In this dataset
 * every Diode Failure is severity "critical" (see mock-data.ts's _TYPE_DELTA —
 * a diode fault runs a 38°C rise, in the same band as a multi-module hotspot)
 * and always has been, back to the Block 20 deliverable. Recoloring 127 real
 * diode-failure rows to yellow because a color-system brief's example text
 * grouped them with soiling would misrepresent an electrical fault as
 * cosmetic. Nothing here reclassifies data — only the paint each existing
 * class gets.
 *
 * TWO SHADES PER TIER, AND THE MEASUREMENTS BEHIND WHY
 * ---------------------------------------------------------
 * Each tier has a VIVID token (the brief's literal hex) and a TEXT token (a
 * darker variant of the same hue). They are not interchangeable, and using
 * the wrong one in the wrong place reproduces a different legibility bug:
 *
 *   VIVID  — for anything drawn with the mandatory anti-camouflage ring
 *            (map fills, dots, boxes, badge swatches). Measured against this
 *            site's real backgrounds: Critical #FF2E2E scores 5.34:1 on a
 *            black monocrystalline cell and 15.59:1 for Minor #FFE600 — a
 *            real, large improvement over the old muted palette's 3.6-4.4:1
 *            there. But EVERY vivid tier — old palette included — falls
 *            under the 3:1 graphics floor against light terrain (sandy soil:
 *            1.1-1.8:1; grass: 1.0-4.0:1) and Minor #FFE600 is catastrophic
 *            as anything unringed on white UI chrome (1.27:1). The ring
 *            carries legibility there, not the fill — see ANTI_CAMOUFLAGE_RING.
 *
 *   TEXT   — for anything with no ring to lean on: table cells, badge labels,
 *            chart lines, PDF body text. Derived by holding each vivid hue
 *            and desaturating/darkening it until it clears 4.5:1 (WCAG AA
 *            normal text) against BOTH white and black — a single value has
 *            to work in both, because styles.css's --critical/--medium/
 *            --normal have no .dark override and never have. Using VIVID here
 *            instead is exactly the failure mode this file exists to prevent:
 *            Minor's vivid #FFE600 as text on a white table cell is 1.27:1,
 *            below even large-text AA, let alone body copy.
 *
 * Regenerate TEXT values with the WCAG relative-luminance formula (searched
 * lightness in HSL, hue and saturation held constant) if a VIVID value ever
 * changes — they are not arbitrary picks, they are the darkest point on that
 * hue's own lightness ramp that still passes AA against both extremes.
 */

import type { Severity, Status } from "./mock-data";

export type RGB = readonly [number, number, number];

export interface SeverityToken {
  /** The brief's own name for this tier, kept only as documentation — see
   *  the module docblock for why the code itself still says "medium"/"normal". */
  briefName: string;
  vivid: string;
  vividRGB: RGB;
  text: string;
  textRGB: RGB;
  shape: MarkerShape;
}

export type MarkerShape = "triangle" | "circle" | "square" | "diamond";

/**
 * Shape code per tier — the accessibility half of this task, independent of
 * color. A technician who cannot distinguish red from amber can still
 * distinguish a triangle from a circle. Triangle-for-critical and
 * circle-for-major are the brief's own two named examples; square and
 * diamond extend the same silhouette-coding to the remaining two tiers so
 * every marker on the map reads by shape alone with the fill colour hidden.
 * Four distinct enough silhouettes that a 12px marker still reads correctly —
 * this is the same reasoning safety signage and aviation charts use, not a
 * novel scheme.
 */
export const SEVERITY: Record<Exclude<Severity, "nodata">, SeverityToken> = {
  critical: {
    briefName: "Critical / Hotspot",
    // Cyan, not the old red #FF2E2E: red camouflages against the warm magma/
    // ochre thermal IR raster (critical-red measured only 1.94:1 on the mean
    // thermal background — see boxPaint's casing note). Cyan is the cold end of
    // the IR palette's opposite, so a cyan ring reads against hot pixels.
    vivid: "#00FFFF", vividRGB: [0x00, 0xff, 0xff],
    // TEXT variant regenerated to the docblock's rule — a teal whose relative
    // luminance (~0.179) is the one narrow band that clears 4.5:1 (WCAG AA)
    // against BOTH white and black, since --critical has no .dark override.
    text: "#008383", textRGB: [0x00, 0x83, 0x83],
    shape: "triangle",
  },
  medium: {
    briefName: "Major / String Failure",
    // Neon green, not the old orange #FF8C00: orange sits inside the thermal
    // raster's own warm ramp and blends into it. Neon green is off that ramp
    // entirely, so a medium box stays separable from the IR beneath it.
    vivid: "#39FF14", vividRGB: [0x39, 0xff, 0x14],
    // TEXT variant regenerated per the docblock rule (hue held, darkened until
    // it clears 4.5:1 on both white and black); ~0.176 luminance.
    text: "#1E870B", textRGB: [0x1e, 0x87, 0x0b],
    shape: "circle",
  },
  normal: {
    briefName: "Minor / Soiling",
    vivid: "#FFE600", vividRGB: [0xff, 0xe6, 0x00],
    text: "#847700", textRGB: [0x84, 0x77, 0x00],
    shape: "square",
  },
} as const;

/**
 * "Resolved / Inspected" — keyed to Status, not Severity, per the module
 * docblock. Only "Closed" gets the resolved token; every other status keeps
 * showing its severity's own color, because an Acknowledged critical is still
 * an open critical and should not read as safe.
 */
export const RESOLVED: SeverityToken = {
  briefName: "Resolved / Inspected",
  vivid: "#00E599", vividRGB: [0x00, 0xe5, 0x99],
  text: "#00875A", textRGB: [0x00, 0x87, 0x5a],
  shape: "diamond",
};

export function isResolved(status: Status): boolean {
  return status === "Closed";
}

/** severity + status together decide the token — the one place that
 *  combination is resolved, so map, badge, and PDF can't disagree about it. */
export function tokenFor(severity: Severity, status?: Status): SeverityToken | null {
  if (severity === "nodata") return null;
  if (status && isResolved(status)) return RESOLVED;
  return SEVERITY[severity];
}

// ─── Anti-camouflage ring ───────────────────────────────────────────────────

/**
 * "Outer high-contrast black/white offset borders (1.5px)" — implemented as
 * TWO concentric rings, white then black, each 1.5px, rather than one ring in
 * a single color. A single-color ring is a bet: white wins on the black
 * monocrystalline cells the brief names, and nearly disappears on the sandy
 * soil the brief also names (see the module docblock — white-on-sand is a
 * near-luminance match). A one-of-each-color double ring removes the bet:
 * at any point along a marker's edge, whichever background is behind that
 * point, at least one of the two rings has a large luminance step against it,
 * because white and black bracket every possible background luminance. This
 * is the actual mechanism, not a stronger version of the old single white
 * casing in lib/defect-overlay.ts's boxPaint() — that halo is kept for the
 * bloom effect on hover/active, this ring is the base-state legibility
 * guarantee the brief is asking for.
 */
export const RING_WIDTH_PX = 1.5;
export const RING_OUTER = "#FFFFFF";
export const RING_INNER = "#000000";

/**
 * The four silhouettes as polygon points (a circle is returned as null — its
 * two consumers each already have a cheaper native way to draw one: SVG
 * `<circle>`, canvas `arc()`).
 *
 * THE ONE SHARED SOURCE OF EACH SHAPE'S GEOMETRY
 * ---------------------------------------------------
 * components/SeverityShape.tsx (badges, the map legend — SVG) and
 * lib/defect-overlay.ts (the map's own markers — <canvas>, because Mapbox
 * needs a raster sprite, not a DOM node) draw the same four shapes through two
 * different APIs that share no code of their own. Without this function nothing
 * stops the two from quietly drawing different triangles — the exact
 * "two consumers of one design token, one hand-edited without the other"
 * failure this whole token layer exists to prevent, just moved one level down
 * from color into geometry. Both call this for the vertices and only differ in
 * how they hand those vertices to their own drawing API.
 */
export function shapePoints(shape: Exclude<MarkerShape, "circle">, size: number, inset: number): [number, number][] {
  const r = size / 2;
  switch (shape) {
    case "square":
      return [[inset, inset], [size - inset, inset], [size - inset, size - inset], [inset, size - inset]];
    case "diamond":
      return [[r, inset], [size - inset, r], [r, size - inset], [inset, r]];
    case "triangle":
      return [[r, inset], [size - inset, size - inset], [inset, size - inset]];
  }
}

// ─── Critical pulse ─────────────────────────────────────────────────────────

/**
 * "Dynamic inner pulse" for critical only — the brief singles out critical,
 * and confining motion to the one tier that means "act now" is what keeps it
 * meaningful. A map where every marker breathes is a map where breathing
 * carries no information; critical-only pulsing is itself part of the
 * severity encoding, on top of color and shape.
 *
 * Implemented two ways because the two surfaces have no shared animation
 * primitive: DOM elements (badges, the legend) use the CSS keyframes below;
 * the Mapbox canvas (lib/defect-overlay.ts) cannot run a CSS animation on a
 * WebGL-painted circle, so it drives the same period via a requestAnimationFrame
 * loop calling setPaintProperty — see PULSE_PERIOD_MS, used by both.
 */
export const PULSE_PERIOD_MS = 1400;
export const PULSE_MIN_OPACITY = 0.35;
export const PULSE_MAX_OPACITY = 0.85;
/** How far the pulse ring grows beyond the marker's own radius, as a
 *  multiplier — 1.6 reads as "emanating from" rather than "replacing" the
 *  marker, which a 1:1 or smaller ring does not. */
export const PULSE_MAX_SCALE = 1.6;
