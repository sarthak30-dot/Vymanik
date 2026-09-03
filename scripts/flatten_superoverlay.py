#!/usr/bin/env python3
"""
Flatten a Google Earth superoverlay KMZ into one georeferenced web overlay.

WHY
---
ortho4.kmz does not contain an orthomosaic. It contains 6,133 256x256 tiles
arranged as a quadtree, each wrapped in its own <GroundOverlay> with its own
<LatLonBox>, plus a tree of doc.kml files linking them. Google Earth streams
that; Mapbox cannot, because a Mapbox image source takes one image and four
corners. This script does the compositing.

That per-tile <LatLonBox> is also the point. The previous thermal deliverable
was a flat PNG whose georeferencing had been discarded on export, so
fit_thermal_bounds.py had to recover the placement by fitting against surveyed
defect coordinates and reached 87%. Here the corners are read, not solved, and
the result scores 100.0% (all 1,249 defects on a data pixel). See the header of
src/lib/overlay-registration.ts.

TWO THINGS THAT ARE EASY TO GET WRONG
-------------------------------------
1. The pyramid is not uniformly deep. Levels 0-8 exist, but ~5% of the block
   bottoms out at level 4 or shallower. Compositing only the deep levels — the
   obvious optimisation, since deep tiles overpaint shallow ones everywhere
   else — punches visible holes in exactly those areas. So every level is
   composited, shallowest first, and the deepest available tile wins by
   painting last.

2. A level-0 tile spans the whole 2.2 km site. Scaled naively onto an 8192 px
   canvas it becomes ~259 MP (~1 GB of RGBA) before a single pixel is used.
   Image.resize(size, box=...) crops in SOURCE pixel space as part of the same
   call, so each tile is only ever rasterised over the slice of canvas it
   actually covers. Peak memory is the canvas, not the largest tile.

USAGE
    python3 scripts/flatten_superoverlay.py ortho4.kmz out.webp \
        --bbox 73.023697 28.259854 73.035302 28.264500 --width 8192

    Omit --bbox to use the union of the deepest level's tiles. Output format is
    taken from the extension; .webp is strongly preferred (see the OVERLAYS note
    in src/lib/overlay-registration.ts for the size argument).
"""
import argparse
import math
import os
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

from PIL import Image

Image.MAX_IMAGE_PIXELS = None
K = "{http://www.opengis.net/kml/2.2}"


def collect(root):
    """Walk the doc.kml tree and return {tile path: (west, east, south, north)}."""
    tiles, seen = {}, set()

    def visit(doc):
        doc = os.path.normpath(doc)
        if doc in seen or not os.path.exists(doc):
            return
        seen.add(doc)
        base = os.path.dirname(doc)
        tree = ET.parse(doc)
        for go in tree.iter(K + "GroundOverlay"):
            box, icon = go.find(K + "LatLonBox"), go.find(f"{K}Icon/{K}href")
            if box is None or icon is None:
                continue
            tiles[os.path.normpath(os.path.join(base, icon.text.strip()))] = tuple(
                float(box.find(K + t).text) for t in ("west", "east", "south", "north"))
        for nl in tree.iter(K + "NetworkLink"):
            # Note: an ElementTree Element with no children is falsy, so these
            # two lookups cannot be collapsed into `a or b`.
            href = nl.find(f"{K}Link/{K}href")
            if href is None:
                href = nl.find(f"{K}Url/{K}href")
            if href is not None:
                visit(os.path.join(base, href.text.strip()))

    visit(os.path.join(root, "doc.kml"))
    return tiles


def composite(tiles, bbox, out_w):
    west, south, east, north = bbox
    m_lng = 111_320 * math.cos(math.radians((north + south) / 2))
    out_h = round(out_w * ((north - south) * 110_600) / ((east - west) * m_lng))
    canvas = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    sx, sy = out_w / (east - west), out_h / (north - south)

    root_w = max(e - w for w, e, _, _ in tiles.values())
    depth = lambda w, e: round(math.log2(root_w / (e - w)))

    painted = 0
    for path, (w, e, s, n) in sorted(tiles.items(), key=lambda kv: depth(kv[1][0], kv[1][1])):
        x0, x1 = (w - west) * sx, (e - west) * sx
        y0, y1 = (north - n) * sy, (north - s) * sy
        cx0, cy0 = max(0.0, x0), max(0.0, y0)
        cx1, cy1 = min(float(out_w), x1), min(float(out_h), y1)
        px0, py0 = round(cx0), round(cy0)
        pw, ph = round(cx1) - px0, round(cy1) - py0
        if pw < 1 or ph < 1:
            continue
        tile = Image.open(path).convert("RGBA")
        tw, th = tile.size
        box = ((cx0 - x0) / (x1 - x0) * tw, (cy0 - y0) / (y1 - y0) * th,
               (cx1 - x0) / (x1 - x0) * tw, (cy1 - y0) / (y1 - y0) * th)
        piece = tile.resize((pw, ph), Image.LANCZOS, box=box)
        canvas.paste(piece, (px0, py0), piece)
        painted += 1
    print(f"composited {painted}/{len(tiles)} tiles -> {canvas.size}", file=sys.stderr)
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kmz")
    ap.add_argument("out")
    ap.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"))
    ap.add_argument("--width", type=int, default=8192)
    ap.add_argument("--quality", type=int, default=80, help="WebP quality")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(args.kmz) as z:
            z.extractall(tmp)
        tiles = collect(tmp)
        if not tiles:
            sys.exit("no GroundOverlays found — is this a superoverlay KMZ?")
        if args.bbox:
            bbox = tuple(args.bbox)
        else:
            root_w = max(e - w for w, e, _, _ in tiles.values())
            deepest = max(round(math.log2(root_w / (e - w))) for w, e, _, _ in tiles.values())
            deep = [v for v in tiles.values()
                    if round(math.log2(root_w / (v[1] - v[0]))) == deepest]
            bbox = (min(v[0] for v in deep), min(v[2] for v in deep),
                    max(v[1] for v in deep), max(v[3] for v in deep))
            print(f"auto bbox (level {deepest}): {bbox}", file=sys.stderr)
        img = composite(tiles, bbox, args.width)

    if args.out.lower().endswith(".webp"):
        img.save(args.out, "WEBP", quality=args.quality, method=5)
    else:
        img.save(args.out)
    print(f"{args.out}  {os.path.getsize(args.out)/1e6:.1f} MB", file=sys.stderr)
    print(f"baseline: {{ west: {bbox[0]}, north: {bbox[3]}, "
          f"east: {bbox[2]}, south: {bbox[1]} }}")


if __name__ == "__main__":
    main()
