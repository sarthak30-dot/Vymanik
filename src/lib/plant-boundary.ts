/**
 * Plant boundary for GPS validation during CSV ingestion.
 *
 * WHY THIS IS ITS OWN FILE INSTEAD OF IMPORTING FROM map.tsx
 * --------------------------------------------------------------
 * map.tsx already has a `PLANT_BOUNDARY_COORDS` constant with these exact
 * numbers, drawn as the dashed outline on the site map. This file does not
 * import it. Task 4's guardrail draws a hard line between the live map and
 * this admin ingestion flow — "does not alter runtime map visual styles
 * directly" — and the safest way to honour that literally is for the
 * ingestion wizard to depend on nothing map.tsx exports, so a change made for
 * one can never have a side effect on the other. The cost is duplicated
 * numbers; the value is that this file, the wizard, and their tests can be
 * reasoned about with map.tsx closed.
 *
 * If the boundary ever moves, both copies need updating — that coupling is
 * accepted on purpose, not missed. The values themselves are the composited
 * extent of the March 2026 thermal orthomosaic (see the OVERLAYS baseline in
 * lib/overlay-registration.ts), the same ground truth both places draw from.
 *
 * PLANT_BOUNDARY is the *primary* plant's rectangle and stays the default, so
 * existing callers are unchanged. The checks below take a box so a second
 * plant's ingestion can be validated against its own surveyed extent — read
 * from its uploaded survey (`plant_surveys.overlay_*`) — instead of being told
 * its perfectly good coordinates are 500 km off-site.
 */

export interface BoundaryBox {
  west: number;
  east: number;
  south: number;
  north: number;
}

export const PLANT_BOUNDARY: BoundaryBox = {
  west: 73.023697,
  east: 73.035302,
  south: 28.259854,
  north: 28.2645,
};

/** Metres of slack outside the strict rectangle before a point counts as
 *  "out of boundary" — a GPS reading a few metres past the surveyed edge is
 *  ordinary receiver noise, not a data-entry error, and flagging it would
 *  train an operator to stop trusting the check. ~15 m is roughly a rack's
 *  depth at this site, generous enough to absorb noise without accepting a
 *  point that is genuinely off-site. */
const TOLERANCE_M = 15;
const M_PER_DEG_LAT = 110_600;

/** Metres per degree of longitude at the box's own centre latitude, rather
 *  than at one site's. A rectangle at 16°N is ~9% wider per degree than one in
 *  Rajasthan, and using the wrong figure would mis-measure how far outside a
 *  point sits — and so flag or accept the wrong rows. */
function mPerDegLng(box: BoundaryBox): number {
  const centreLat = (box.south + box.north) / 2;
  return 111_320 * Math.cos((centreLat * Math.PI) / 180);
}

export interface BoundaryCheck {
  withinBoundary: boolean;
  /** Metres outside the (untoleranced) rectangle; 0 when inside. */
  distanceOutsideM: number;
}

/**
 * How far outside the strict rectangle a point sits, in the same flat-earth
 * approximation used everywhere else on this map (valid at this site's
 * ~1.1 km scale — see the note in lib/map-camera.ts).
 */
export function checkBoundary(
  lat: number,
  lng: number,
  box: BoundaryBox = PLANT_BOUNDARY,
): BoundaryCheck {
  const dLatOut = lat < box.south ? box.south - lat : lat > box.north ? lat - box.north : 0;
  const dLngOut = lng < box.west ? box.west - lng : lng > box.east ? lng - box.east : 0;

  const mLng = mPerDegLng(box);
  const distanceOutsideM = Math.hypot(dLatOut * M_PER_DEG_LAT, dLngOut * mLng);

  const withinBoundary = dLatOut <= TOLERANCE_M / M_PER_DEG_LAT && dLngOut <= TOLERANCE_M / mLng;
  return { withinBoundary, distanceOutsideM: Math.round(distanceOutsideM) };
}

/**
 * Would swapping lat and lng land this row on-site? The single most common
 * real-world CSV mistake is a spreadsheet with Longitude in column A and
 * Latitude in column B — every value is individually a plausible coordinate,
 * so the ordinary boundary check just reports "3,400 km out of boundary" and
 * leaves the operator to guess why. Checking the swap explicitly turns that
 * into a specific, actionable message instead of a confusing distance.
 */
export function looksSwapped(lat: number, lng: number, box: BoundaryBox = PLANT_BOUNDARY): boolean {
  return (
    !checkBoundary(lat, lng, box).withinBoundary && checkBoundary(lng, lat, box).withinBoundary
  );
}
