#!/usr/bin/env python3
"""
Solve the corner coordinates for the thermal orthomosaic overlay in map.tsx.

WHY THIS EXISTS
---------------
A GeoTIFF stores tie-points (pixel -> world anchors) in its tags. A PNG has
nowhere to put them, so exporting the orthomosaic to PNG threw the
georeferencing away. Two of the three usual ways to recover it are closed here:

  * No sidecar. There is no .tfw / .pgw / .wld world file, and the PNG carries no
    metadata chunk.
  * No satellite reference. The normal fallback is to match the raster against
    satellite imagery, but Mapbox/Maxar coverage of this site predates
    construction — the basemap is bare scrub with no array to align to.

What remains is the 347 surveyed defect coordinates (finalreport CSV /
Block20_1GV_4.kml). Those are real ground positions, and every one of them sits
on a panel, so a correct registration must land essentially all of them on a
data pixel of the raster.

THE FIT
-------
Hit rate alone is a degenerate objective: inflating the geographic box shrinks
the point cloud toward the dense middle of the footprint, so hit rate rises
monotonically with scale and the optimiser happily runs away to a meaningless
answer (100% at 0.75 m/px, with the cloud covering only 73% of the footprint).

Two physical constraints make it well posed:

  1. Square ground pixels. An orthomosaic is resampled to a regular grid, so x
     and y resolution are equal. This collapses 4 free parameters to 3.
  2. The cloud must span the footprint. 347 defects spread over 224 of the 733
     racks and all 26 panel columns cannot occupy only the middle of the array,
     so the point cloud is required to cover >=97% of the data region's extent.

Under those, the optimum is 0.5625 m/px with 87% of defects on a data pixel —
against ~44% for chance, which is what the footprint's fill ratio would give.

Result is accurate to roughly a panel row. If the source .tif ever surfaces, read
its tie-point tags instead and delete this.

Usage:
    python3 scripts/fit_thermal_bounds.py \
        --raster public/thermal_block20.png \
        --csv ~/Downloads/finalreport_20Block\\ \\(1\\).csv
"""

import argparse
import csv
import math

import numpy as np
from PIL import Image

from clean_orthomosaic import background_mask

# Plant centroid latitude. Used for the degrees<->metres conversion; over a 600 m
# site the cos(lat) term varies by far less than the fit's own resolution.
SITE_LAT = 28.2568
M_PER_DEG_LAT = 110_600.0
M_PER_DEG_LNG = 111_320.0 * math.cos(math.radians(SITE_LAT))

# A point cloud covering less of the data footprint than this is taken as the
# runaway-scale solution described above and rejected.
MIN_SPAN_FRACTION = 0.97


def load_defects(path: str) -> tuple[np.ndarray, np.ndarray]:
    with open(path, newline="") as fh:
        rows = list(csv.DictReader(fh))
    return (
        np.array([float(r["xcoord"]) for r in rows]),
        np.array([float(r["ycoord"]) for r in rows]),
    )


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--raster", default="public/thermal_block20.png")
    p.add_argument("--csv", required=True, help="finalreport CSV with xcoord/ycoord columns")
    args = p.parse_args()

    img = Image.open(args.raster).convert("RGB")
    rgb = np.array(img)
    height, width, _ = rgb.shape

    # Flood-fill from the border rather than thresholding: the magma colormap puts
    # real data at both near-black and near-white, so a plain threshold would
    # punch holes through the coldest and hottest panels.
    data = ~background_mask(rgb, 238, 18)
    ys, xs = np.where(data)
    ix0, ix1, iy0, iy1 = xs.min(), xs.max(), ys.min(), ys.max()

    lng, lat = load_defects(args.csv)
    # Defect positions as metres east / north of the cloud's SW corner.
    east = (lng - lng.min()) * M_PER_DEG_LNG
    north = (lat - lat.min()) * M_PER_DEG_LAT
    north_span = north.max()

    def evaluate(res: float, off_e: float, off_n: float) -> tuple[float, float, float]:
        """Return (hit rate, x span fraction, y span fraction) for a candidate fit.

        res is metres per pixel; off_e / off_n place the cloud's NW corner
        relative to the data region's top-left pixel, in metres.
        """
        px = ix0 + (east + off_e) / res
        py = iy0 + ((north_span - north) + off_n) / res
        xi, yi = np.round(px).astype(int), np.round(py).astype(int)
        inside = (xi >= 0) & (xi < width) & (yi >= 0) & (yi < height)

        hit = np.zeros(len(east), dtype=bool)
        hit[inside] = data[yi[inside], xi[inside]]
        return (
            hit.mean(),
            (px.max() - px.min()) / (ix1 - ix0),
            (py.max() - py.min()) / (iy1 - iy0),
        )

    best = None
    for res in np.linspace(0.50, 0.60, 41):
        for off_e in np.linspace(-20, 40, 61):
            for off_n in np.linspace(-20, 40, 61):
                hits, span_x, span_y = evaluate(res, off_e, off_n)
                if span_x < MIN_SPAN_FRACTION or span_y < MIN_SPAN_FRACTION:
                    continue
                if best is None or hits > best[0]:
                    best = (hits, res, off_e, off_n)

    if best is None:
        raise SystemExit("no candidate satisfied the span constraint — widen the search range")

    hits, res, off_e, off_n = best
    chance = data.sum() / ((ix1 - ix0 + 1) * (iy1 - iy0 + 1))
    print(f"raster      : {width}x{height}, data region {ix1-ix0+1}x{iy1-iy0+1} px")
    print(f"resolution  : {res:.4f} m/px (isotropic)")
    print(f"defects hit : {hits * 100:.1f}% on a data pixel  (chance {chance * 100:.0f}%)")

    # The fit places the *data region*; Mapbox needs corners for the whole canvas,
    # so extrapolate outward from the data bbox by the same resolution.
    deg_x, deg_y = res / M_PER_DEG_LNG, res / M_PER_DEG_LAT
    anchor_lng = lng.min() - off_e / M_PER_DEG_LNG
    anchor_lat = lat.max() + off_n / M_PER_DEG_LAT

    west = anchor_lng - ix0 * deg_x
    east_edge = anchor_lng + (width - 1 - ix0) * deg_x
    north_edge = anchor_lat + iy0 * deg_y
    south = anchor_lat - (height - 1 - iy0) * deg_y

    print(f"canvas span : {(east_edge - west) * M_PER_DEG_LNG:.0f} x "
          f"{(north_edge - south) * M_PER_DEG_LAT:.0f} m")
    print("\nTHERMAL_BOUNDS coordinates for map.tsx (NW, NE, SE, SW):\n")
    print(f"    [{west:.6f}, {north_edge:.6f}], [{east_edge:.6f}, {north_edge:.6f}],")
    print(f"    [{east_edge:.6f}, {south:.6f}], [{west:.6f}, {south:.6f}],")


if __name__ == "__main__":
    main()
