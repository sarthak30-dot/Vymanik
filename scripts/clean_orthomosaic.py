#!/usr/bin/env python3
"""
Clean a drone orthomosaic PNG for use as a Mapbox `type: "image"` overlay.

Orthomosaics come out of the stitching software letterboxed onto a rectangular
canvas: the flight footprint is an irregular polygon, and everything outside it
is padded with flat white (or black) filler. A Mapbox image source stretches the
*entire* rectangle onto its four corner coordinates, so that filler gets painted
over the satellite basemap as an opaque box.

This script does three things:

  1. Alpha-cuts the filler. Background is found by flood-filling inward from the
     canvas border, NOT by thresholding — the magma/inferno colormap used for
     thermal data has near-black at its cold end and near-white at its hot end,
     so a naive "make white transparent" pass punches holes straight through the
     hottest panels. Only filler *connected to the border* is removed.

  2. Bleeds edge colour outward before upscaling. Upsampling an image whose
     transparent region is still white RGB drags white into the data edge and
     leaves a bright halo around the footprint. Dilating real colours into the
     background first keeps edges clean.

  3. Upscales + unsharp-masks so panel rows stay legible when magnified past the
     source resolution.

Canvas dimensions are preserved through step 1, so the georeferencing corner
coordinates in map.tsx (THERMAL_BOUNDS etc.) remain valid without recomputation.

Usage:
    python3 scripts/clean_orthomosaic.py public/thermal_block20.png \
        --out public/thermal_block20_clean.png --scale 2
"""

import argparse
from collections import deque

import numpy as np
from PIL import Image, ImageFilter


def background_mask(rgb: np.ndarray, white_thresh: int, black_thresh: int) -> np.ndarray:
    """Flood-fill filler colour inward from the canvas border.

    Returns a bool mask that is True for padding pixels. A pixel qualifies only
    if it is filler-coloured AND reachable from the border through other filler
    pixels, which is what protects saturated hot/cold data pixels of the same
    colour sitting in the interior.
    """
    h, w, _ = rgb.shape
    filler = ((rgb > white_thresh).all(-1)) | ((rgb < black_thresh).all(-1))

    bg = np.zeros((h, w), dtype=bool)
    q: deque = deque()

    # Seed every filler pixel sitting on the canvas edge.
    for y, x in (
        [(0, x) for x in range(w)]
        + [(h - 1, x) for x in range(w)]
        + [(y, 0) for y in range(h)]
        + [(y, w - 1) for y in range(h)]
    ):
        if filler[y, x] and not bg[y, x]:
            bg[y, x] = True
            q.append((y, x))

    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and filler[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))

    return bg


def dilate(mask: np.ndarray, iterations: int = 1) -> np.ndarray:
    """4-connected binary dilation via array shifts."""
    out = mask.copy()
    for _ in range(iterations):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def bleed_edges(rgb: np.ndarray, bg: np.ndarray, iterations: int) -> np.ndarray:
    """Push real colour outward into the transparent region.

    Each pass fills background pixels that touch a filled pixel with the mean of
    those neighbours. Only a few passes are needed — just enough to cover the
    resampling kernel's reach during upscaling.
    """
    out = rgb.astype(np.float32).copy()
    filled = ~bg

    for _ in range(iterations):
        acc = np.zeros_like(out)
        cnt = np.zeros(out.shape[:2], dtype=np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            shifted_rgb = np.roll(out, (dy, dx), axis=(0, 1))
            shifted_filled = np.roll(filled, (dy, dx), axis=(0, 1))
            acc += shifted_rgb * shifted_filled[..., None]
            cnt += shifted_filled

        target = bg & (cnt > 0)
        out[target] = acc[target] / cnt[target][:, None]
        filled = filled | target

    return out.astype(np.uint8)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("src")
    p.add_argument("--out", required=True)
    p.add_argument("--scale", type=float, default=2.0, help="upscale factor (1 = keep source size)")
    p.add_argument("--white-thresh", type=int, default=238, help="all channels above this = white filler")
    p.add_argument("--black-thresh", type=int, default=18, help="all channels below this = black filler")
    p.add_argument("--erode", type=int, default=1, help="px of data edge to trim, kills anti-aliased filler fringe")
    p.add_argument("--sharpen", type=int, default=110, help="unsharp mask strength (percent), 0 to disable")
    p.add_argument("--quantize", type=int, default=255, help="palette colours, 0 for full RGBA (~4x larger)")
    args = p.parse_args()

    src = Image.open(args.src).convert("RGB")
    rgb = np.array(src)
    h, w, _ = rgb.shape

    bg = background_mask(rgb, args.white_thresh, args.black_thresh)
    # The stitcher anti-aliases the footprint boundary, leaving a 1px band that is
    # neither pure filler nor real data. Growing the background eats that fringe.
    if args.erode:
        bg = dilate(bg, args.erode)

    print(f"source     : {w}x{h}")
    print(f"background : {bg.mean() * 100:.1f}% of canvas cut to transparent")

    rgb = bleed_edges(rgb, bg, iterations=max(2, int(args.scale) + 1))

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    out = Image.fromarray(np.dstack([rgb, alpha]))

    if args.scale != 1.0:
        out = out.resize((int(w * args.scale), int(h * args.scale)), Image.LANCZOS)

    if args.sharpen:
        # Unsharp only the colour channels — sharpening alpha would re-introduce
        # a hard ringing halo at the footprint boundary.
        r, g, b, a = out.split()
        colour = Image.merge("RGB", (r, g, b)).filter(
            ImageFilter.UnsharpMask(radius=2, percent=args.sharpen, threshold=3)
        )
        out = Image.merge("RGBA", (*colour.split(), a))

    if args.quantize:
        # A false-colour thermal render only ever contains colours from its
        # colormap ramp, so a palette costs almost nothing visually (~6/255 mean
        # channel error here) while cutting the file to roughly a quarter.
        # FASTOCTREE is the only PIL quantizer that handles RGBA.
        out = out.quantize(colors=args.quantize, method=Image.FASTOCTREE)

    out.save(args.out, optimize=True)
    print(f"wrote      : {args.out} ({out.size[0]}x{out.size[1]}, {out.mode})")


if __name__ == "__main__":
    main()
