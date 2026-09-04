#!/usr/bin/env python3
"""
Generate low-memory WebP thumbnails for every drone defect frame.

Task 6 (Mobile Field Inspector) asks for progressive image loading: a
technician on a site with patchy signal should see *something* for a defect
frame almost instantly, with the full 640x512 JPEG (~75KB average, 484 files,
36MB total) fetched in the background rather than blocking the first paint.

Real thumbnails, not a client-side resize of the full image — a browser still
has to download the full-size bytes before it can shrink them, which defeats
the point on a slow link. These are generated once, at build/data-update
time, and served as static files exactly like the source JPEGs already are.

Output: public/defimages/thumb/<name>.webp, one per public/defimages/<name>.jpg,
160px wide (proportional height), quality 55. At that size a thumbnail
averages a few KB against the source's ~75KB — small enough to treat as
"free" even on a throttled connection, while still recognisably showing the
IronRed hotspot pattern that tells a technician "yes, this is the right
frame" before the full-resolution version arrives.

Re-run whenever public/defimages/ gets new source frames (a new survey
import). Skips any source file whose thumbnail is already newer, so re-runs
after a partial import only do the new work.

Usage: python3 scripts/generate_defect_thumbnails.py
"""

import sys
from pathlib import Path

from PIL import Image

SRC_DIR = Path(__file__).resolve().parent.parent / "public" / "defimages"
OUT_DIR = SRC_DIR / "thumb"
THUMB_WIDTH = 160
WEBP_QUALITY = 55


def main() -> None:
    if not SRC_DIR.is_dir():
        print(f"error: {SRC_DIR} does not exist", file=sys.stderr)
        sys.exit(1)

    OUT_DIR.mkdir(exist_ok=True)

    sources = sorted(SRC_DIR.glob("*.jpg"))
    if not sources:
        print(f"error: no .jpg files found in {SRC_DIR}", file=sys.stderr)
        sys.exit(1)

    made = 0
    skipped = 0
    total_in = 0
    total_out = 0

    for src in sources:
        dst = OUT_DIR / f"{src.stem}.webp"
        if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            skipped += 1
            continue

        with Image.open(src) as im:
            ratio = THUMB_WIDTH / im.width
            size = (THUMB_WIDTH, max(1, round(im.height * ratio)))
            im = im.convert("RGB").resize(size, Image.LANCZOS)
            im.save(dst, "WEBP", quality=WEBP_QUALITY, method=6)

        total_in += src.stat().st_size
        total_out += dst.stat().st_size
        made += 1

    print(f"generated {made} thumbnails, skipped {skipped} up to date, in {OUT_DIR}")
    if made:
        print(f"{total_in / 1024:.0f} KB source -> {total_out / 1024:.0f} KB thumbnails "
              f"({total_out / total_in * 100:.1f}% of original, {made} files)")


if __name__ == "__main__":
    main()
