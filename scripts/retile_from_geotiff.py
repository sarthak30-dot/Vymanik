#!/usr/bin/env python3
"""
Render a web-sized Mapbox image overlay straight from the source GeoTIFF.

WHY THIS EXISTS
---------------
The overlays previously shipped were 1024 px PNGs (upscaled 2x by
clean_orthomosaic.py, which adds pixels but no detail). The real orthomosaics are
27k-69k px wide and live on the external drive:

    /Volumes/Expansion/Day1_T_modified.tif                       27489 x 20586
    /Volumes/Expansion/Sarthak Workspace/Vymanik/Day1_V1.tif     56155 x 40722
    /Volumes/Expansion/Sarthak Workspace/Vymanik/Day1_V2.tif     68854 x 39765

Going back to those lifts the "goes blocky past z19" ceiling by ~4-8x.

GEOREFERENCING: THIS SCRIPT DELIBERATELY IGNORES IT
---------------------------------------------------
It reads pixels only. The baselines in overlay-registration.ts stay authoritative
and unchanged, because each raster's full frame corresponds to its full baseline
rectangle. That matters most for the thermal, whose embedded geotransform is
NOT trustworthy: its ModelPixelScale is equal in X and Y *in degrees*, which at
28.26 N makes pixels non-square on the ground, and its implied 918 x 777 m
footprint is ~1.8x inflated against the surveyed defect coordinates (true extent
~580 x 424 m). Reading its tie-points would move a correct overlay to the wrong
place. V1/V2 tie-points *are* sound and already match their baselines exactly --
but we still only take pixels here, so one code path covers all three.

WHY MEMMAP RATHER THAN Image.open().resize()
--------------------------------------------
These are uncompressed TIFFs whose strips are contiguous and exactly sized, so
the pixel data is one contiguous (H, W, 3) uint8 block at StripOffsets[0]. numpy
can memmap that and stream it in row bands, which keeps peak RSS at a few MB
instead of asking PIL to decode 8 GB into RAM.

Usage:
    python3 scripts/retile_from_geotiff.py \
        /Volumes/Expansion/Day1_T_modified.tif \
        --out public/thermal_block20_hi.png --width 8192
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from clean_orthomosaic import background_mask, dilate  # noqa: E402

Image.MAX_IMAGE_PIXELS = None


def padding_mask(rgb, white_thresh: int, black_thresh: int, work_w: int = 1600):
    """Border-connected filler mask, resolved at low res then refined at full res.

    clean_orthomosaic.background_mask is a pure-Python BFS. That is fine on the
    old 1024 px overlays (~2.7 s) but extrapolates to ~3 minutes on a 50 MP
    canvas. Connectivity, though, is a large-scale property: whether a filler
    region touches the border is already decided on a small proxy. So we solve
    connectivity there and recover edge precision by intersecting the upscaled
    result with the exact full-resolution filler mask.

    A filler channel narrower than one proxy cell is missed, leaving that pocket
    opaque. That is the safe direction to err -- keeping a little padding beats
    punching a hole through the hottest panels, which is the failure mode the
    flood-fill approach exists to avoid in the first place.
    """
    H, W = rgb.shape[:2]
    filler = ((rgb > white_thresh).all(-1)) | ((rgb < black_thresh).all(-1))
    if W <= work_w:
        return background_mask(rgb, white_thresh, black_thresh)

    sh = max(1, round(H * work_w / W))
    # BOX resample averages the boolean mask, so a proxy cell's value is the
    # fraction of it that is filler; >=50% counts as passable.
    frac = np.asarray(Image.fromarray((filler * 255).astype(np.uint8))
                      .resize((work_w, sh), Image.BOX))
    proxy = np.dstack([np.where(frac >= 128, 255, 0).astype(np.uint8)] * 3)
    # black_thresh=0 so `rgb < 0` never fires; only the white branch selects.
    bg_small = background_mask(proxy, 254, 0)

    bg_up = np.asarray(Image.fromarray((bg_small * 255).astype(np.uint8))
                       .resize((W, H), Image.NEAREST)) > 127
    bg_up = dilate(bg_up, 2)          # absorb proxy-cell quantisation
    return bg_up & filler


def bleed_edges_lean(rgb, bg, iterations: int):
    """Push the nearest real colour outward into the padding.

    Same purpose as clean_orthomosaic.bleed_edges -- stop Mapbox's bilinear
    sampling from dragging white filler into the footprint edge -- but written
    against uint8 views instead of float32 np.roll copies, which at 50 MP is the
    difference between ~300 MB and ~2.5 GB of temporaries. Propagating the
    nearest colour rather than the neighbour mean also avoids smearing the edge.
    """
    out = rgb.copy()
    filled = ~bg
    H, W = bg.shape
    for _ in range(iterations):
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            yd = slice(max(0, dy), H + min(0, dy))
            ys = slice(max(0, -dy), H + min(0, -dy))
            xd = slice(max(0, dx), W + min(0, dx))
            xsl = slice(max(0, -dx), W + min(0, -dx))
            dst_f = filled[yd, xd]                 # basic slicing -> views
            take = filled[ys, xsl] & ~dst_f
            if not take.any():
                continue
            out[yd, xd][take] = out[ys, xsl][take]
            dst_f[take] = True
    return out


def open_raw(path: str):
    """Expose an uncompressed strip TIFF as a memmapped (H, W, 3) uint8 array.

    Refuses anything that is not laid out contiguously rather than silently
    returning misaligned pixels -- a compressed or oddly-strided file would
    produce garbage that still *looks* like an image.
    """
    im = Image.open(path)
    t = im.tag_v2
    W, H = im.size
    if t.get(259, 1) != 1:
        raise SystemExit(f"{path}: compressed TIFF (Compression={t.get(259)}); not supported")
    if t.get(284, 1) != 1:
        raise SystemExit(f"{path}: planar (PlanarConfiguration=2); not supported")
    spp = t.get(277, 3)
    offs, counts = list(t[273]), list(t[279])
    rps = t[278]
    row_bytes = W * spp
    contiguous = all(offs[i] + counts[i] == offs[i + 1] for i in range(len(offs) - 1))
    exact = all(c == row_bytes * min(rps, H - i * rps) for i, c in enumerate(counts))
    if not (contiguous and exact):
        raise SystemExit(f"{path}: strips are not contiguous/exact; cannot memmap")
    arr = np.memmap(path, np.uint8, "r", offset=offs[0], shape=(H, W, spp))
    return arr, W, H


def box_downsample(arr, target_w: int, verbose: bool = True):
    """Area-average downsample, streamed in row bands.

    Area-averaging (not striding) is the whole point: nearest-neighbour
    subsampling of a solar array aliases the panel rows into moire, which looks
    like detail but is noise. Bin edges are computed with integer arithmetic so
    every source pixel lands in exactly one output cell -- no gaps, no
    double-counting.
    """
    H, W, C = arr.shape
    target_h = max(1, round(H * target_w / W))
    xs = (np.arange(target_w + 1, dtype=np.int64) * W) // target_w
    ys = (np.arange(target_h + 1, dtype=np.int64) * H) // target_h
    widths = (xs[1:] - xs[:-1]).astype(np.float64)[:, None]
    out = np.empty((target_h, target_w, C), np.uint8)

    for j in range(target_h):
        y0, y1 = ys[j], ys[j + 1]
        if y1 <= y0:
            y1 = y0 + 1
        band = np.asarray(arr[y0:y1], dtype=np.float64)      # (rows, W, C)
        colsum = band.sum(axis=0)                            # (W, C)
        # Prefix sums let each output column be one subtraction regardless of
        # how many source columns it spans. float64 because the running total
        # reaches ~1e9 and float32 loses integers past ~1.6e7.
        cs = np.empty((W + 1, C), np.float64)
        cs[0] = 0
        np.cumsum(colsum, axis=0, out=cs[1:])
        binsum = cs[xs[1:]] - cs[xs[:-1]]
        out[j] = np.rint(binsum / (widths * (y1 - y0))).clip(0, 255).astype(np.uint8)
        if verbose and (j % 512 == 0 or j == target_h - 1):
            pct = (j + 1) / target_h * 100
            print(f"\r  downsampling {pct:5.1f}%  (row {j+1}/{target_h})", end="", file=sys.stderr)
    if verbose:
        print(file=sys.stderr)
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("src", help="source GeoTIFF")
    p.add_argument("--out", required=True, help="output PNG")
    p.add_argument("--width", type=int, default=8192,
                   help="output width in px (default 8192). Mapbox uploads this as a "
                        "WebGL texture; 8192 is safe on desktop, drop to 4096 if a "
                        "low-end GPU shows a blank overlay.")
    p.add_argument("--white-thresh", type=int, default=232,
                   help="a pixel counts as white filler above this in all channels")
    p.add_argument("--black-thresh", type=int, default=16,
                   help="a pixel counts as black filler below this in all channels")
    p.add_argument("--bleed", type=int, default=3,
                   help="dilate real colour this many px into the padding before "
                        "saving, so scaling does not drag filler into the footprint")
    p.add_argument("--quantize", type=int, default=0,
                   help="palettize to N colours (255 keeps a slot for full "
                        "transparency). Cuts file size a lot; 0 disables.")
    a = p.parse_args()

    arr, W, H = open_raw(a.src)
    print(f"{Path(a.src).name}: {W:,} x {H:,} ({W*H/1e6:.0f} MP, {W*H*3/1e9:.2f} GB raw)",
          file=sys.stderr)

    small = box_downsample(arr, a.width)
    th, tw = small.shape[:2]
    print(f"  -> {tw:,} x {th:,}", file=sys.stderr)

    bg = padding_mask(small, a.white_thresh, a.black_thresh)
    print(f"  padding cut: {bg.mean()*100:.1f}% of canvas", file=sys.stderr)

    rgb = bleed_edges_lean(small, bg, a.bleed)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # Bleeding pushes real colour outward, so the pixels immediately outside the
    # footprint now hold data. Re-cut alpha on the ORIGINAL mask, otherwise the
    # bled ring shows up as a halo.
    out = Image.fromarray(np.dstack([rgb, alpha]))

    if a.quantize:
        # MEDIANCUT cannot handle an alpha channel; FASTOCTREE is the only
        # built-in method that quantizes RGBA and keeps transparency intact.
        out = out.quantize(colors=a.quantize, method=Image.FASTOCTREE)

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    out.save(a.out, optimize=True)
    size = Path(a.out).stat().st_size
    print(f"  wrote {a.out}  {size/1e6:.2f} MB", file=sys.stderr)


if __name__ == "__main__":
    main()
