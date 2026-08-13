/**
 * "Does this ground position actually fall on drone imagery?" — for any overlay.
 *
 * Two separate questions live here, and conflating them was the trap:
 *
 *   onData()          — is the exact pixel under this point real data?
 *   insideFootprint() — is this point inside the surveyed area at all?
 *
 * They differ because the orthomosaic is not solid. Measured on the thermal
 * raster, only 88.2% of the array's own outline is filled — the remaining 11.8%
 * is service roads and stitching gaps punched right through the middle. So of the
 * 48 surveyed defects that miss a data pixel, 25 are sitting in one of those
 * interior gaps and are perfectly well placed; only 23 are outside the array
 * outline, which is the case that reads as a bug on screen.
 *
 * Hiding a marker because it landed in a road gap would delete a real, correctly
 * located defect from the client's view. So marker suppression uses
 * insideFootprint(), which bridges the gaps, while alignment scoring uses onData(),
 * which is deliberately unforgiving because that is what makes the score move when
 * the operator nudges the image.
 */

import {
  worldToImage,
  type Baseline,
  type OverlayDef,
  type Placement,
} from "./overlay-registration";

/** Ground size of one footprint cell. Wider than any service road at this site,
 *  so max-pooling into these cells closes the roads without swallowing the real
 *  concave notches in the array outline. */
const FOOTPRINT_CELL_M = 5;
/** Ground size of one data cell for scoring. Roughly two panel widths — fine
 *  enough that a one-rack misalignment changes the score. */
const DATA_CELL_M = 2;

interface Grid {
  w: number;
  h: number;
  bits: Uint8Array;
}

export interface RasterMask {
  /** Fine grid: real data only, gaps included. */
  data: Grid;
  /** Coarse grid: the surveyed area with interior gaps bridged. */
  footprint: Grid;
}

function sample(g: Grid, u: number, v: number): boolean {
  if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return false;
  const x = Math.min(g.w - 1, Math.floor(u * g.w));
  const y = Math.min(g.h - 1, Math.floor(v * g.h));
  return g.bits[y * g.w + x] === 1;
}

/**
 * Max-pool the image's alpha channel down to a grid of the requested cell count.
 *
 * Max rather than mean: a cell counts as covered if *any* of its pixels carry
 * data. That is what bridges the roads at the coarse scale, and at the fine scale
 * it keeps thin panel rows from being averaged away into background.
 */
function pool(px: Uint8ClampedArray, iw: number, ih: number, gw: number, gh: number): Grid {
  const bits = new Uint8Array(gw * gh);
  for (let y = 0; y < ih; y++) {
    const gy = Math.min(gh - 1, Math.floor((y / ih) * gh));
    for (let x = 0; x < iw; x++) {
      // Index 3 of each RGBA quad is alpha. Threshold at 10 to ignore the soft
      // edge clean_orthomosaic.py leaves where it alpha-cut the white filler.
      if (px[(y * iw + x) * 4 + 3] > 10) {
        const gx = Math.min(gw - 1, Math.floor((x / iw) * gw));
        bits[gy * gw + gx] = 1;
      }
    }
  }
  return { w: gw, h: gh, bits };
}

/** One dilation pass, to close gaps a road cuts diagonally across cell corners. */
function dilate(g: Grid): Grid {
  const out = new Uint8Array(g.bits);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.bits[y * g.w + x] !== 1) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < g.h && nx >= 0 && nx < g.w) out[ny * g.w + nx] = 1;
        }
      }
    }
  }
  return { w: g.w, h: g.h, bits: out };
}

const M_PER_DEG_LAT = 110_600.0;
const M_PER_DEG_LNG = 111_320.0 * Math.cos((28.2568 * Math.PI) / 180);

function groundSize(b: Baseline) {
  return {
    width: (b.east - b.west) * M_PER_DEG_LNG,
    height: (b.north - b.south) * M_PER_DEG_LAT,
  };
}

const cache = new Map<string, Promise<RasterMask | null>>();

/**
 * Read an overlay's alpha channel into masks. Cached per URL — the pixels never
 * change, only where they get placed, so this runs once per image per session.
 *
 * Same-origin assets, so the canvas is never tainted and getImageData is allowed.
 * Returns null rather than throwing if the image 404s: a missing overlay should
 * degrade to "no coverage information", not break the map.
 */
export function loadRasterMask(def: OverlayDef): Promise<RasterMask | null> {
  const hit = cache.get(def.url);
  if (hit) return hit;

  const task = new Promise<RasterMask | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        const { data: px } = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const g = groundSize(def.baseline);
        const mk = (cellM: number) =>
          pool(
            px,
            canvas.width,
            canvas.height,
            Math.max(1, Math.round(g.width / cellM)),
            Math.max(1, Math.round(g.height / cellM)),
          );

        resolve({
          data: mk(DATA_CELL_M),
          footprint: dilate(mk(FOOTPRINT_CELL_M)),
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = def.url;
  });

  cache.set(def.url, task);
  return task;
}

export interface CoverageTest {
  /** Inside the surveyed area, interior road/stitch gaps bridged. */
  insideFootprint(lng: number, lat: number): boolean;
  /** On a real data pixel — unforgiving, used to score an alignment. */
  onData(lng: number, lat: number): boolean;
}

export function makeCoverageTest(
  def: OverlayDef,
  placement: Placement,
  mask: RasterMask | null,
): CoverageTest | null {
  if (!mask) return null;
  return {
    insideFootprint(lng, lat) {
      const { u, v } = worldToImage(def.baseline, placement, lng, lat);
      return sample(mask.footprint, u, v);
    },
    onData(lng, lat) {
      const { u, v } = worldToImage(def.baseline, placement, lng, lat);
      return sample(mask.data, u, v);
    },
  };
}

export interface AlignmentScore {
  /** Points landing on a real data pixel, as a percentage. */
  onData: number;
  /** Points inside the surveyed footprint, as a percentage. */
  inFootprint: number;
  /** Points outside the footprint entirely — the ones that read as misplaced. */
  strays: number;
  total: number;
}

/**
 * Score a placement against known-good ground positions.
 *
 * The reference points are the surveyed KML panel centroids, which are the only
 * exact geography available here — so a higher score genuinely means "more of the
 * real panels line up with imagery", not "the picture looks better".
 */
export function scorePlacement(
  def: OverlayDef,
  placement: Placement,
  mask: RasterMask | null,
  points: { lng: number; lat: number }[],
): AlignmentScore | null {
  const test = makeCoverageTest(def, placement, mask);
  if (!test || points.length === 0) return null;
  let onData = 0;
  let inFootprint = 0;
  for (const p of points) {
    if (test.onData(p.lng, p.lat)) onData++;
    if (test.insideFootprint(p.lng, p.lat)) inFootprint++;
  }
  return {
    onData: (onData / points.length) * 100,
    inFootprint: (inFootprint / points.length) * 100,
    strays: points.length - inFootprint,
    total: points.length,
  };
}
