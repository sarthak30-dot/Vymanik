/**
 * Radiometric defect frames captured by the drone, one per anomaly.
 *
 * The survey KML carries the source frame in its `Label` field — e.g.
 * "23389.JPG" — which scripts/import_defect_kml.py folds into the anomaly's
 * `rgbNote` as "Image: 23389.JPG".
 *
 * The 484 frames live in public/defimages, lowercased and re-encoded from the
 * 696 MB of DJI M3T originals down to 36 MB (EXIF stripped, which also drops the
 * per-frame GPS the originals embed). There are fewer frames than anomalies —
 * 484 against 1,249 — because one frame typically captures several defects on the
 * same table, so several anomalies legitimately share an image.
 *
 * `pos` is a Block 20 leftover. That deliverable disambiguated the two modules a
 * single frame could cover with a "(pos a)" / "(pos b)" suffix; the March 2026 KML
 * has no equivalent field, so the suffix is absent and `pos` parses as null.
 * The parse is kept rather than deleted because the field costs nothing and the
 * next deliverable may carry it again — but nothing may depend on it being set.
 */

const DEFECT_IMAGE_DIR = "/defimages";

export interface DefectImageRef {
  /** Lowercased filename as stored on disk, or null if the note carries no frame. */
  filename: string | null;
  /** Which of the two modules in the frame the defect is on. */
  pos: "a" | "b" | null;
  /** Ready-to-use src, or null when there is no frame to show. */
  src: string | null;
}

/** Parse `Image: 7531.JPG (pos a)` out of an anomaly's rgbNote. */
export function parseDefectImage(note: string | undefined | null): DefectImageRef {
  const raw = note?.match(/Image:\s*([\w.-]+\.JPG)/i)?.[1] ?? null;
  const pos = (note?.match(/\(pos ([ab])\)/)?.[1] ?? null) as "a" | "b" | null;
  const filename = raw ? raw.toLowerCase() : null;
  return { filename, pos, src: filename ? `${DEFECT_IMAGE_DIR}/${filename}` : null };
}
