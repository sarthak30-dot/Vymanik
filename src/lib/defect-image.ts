/**
 * Radiometric defect frames captured by the drone, one per anomaly.
 *
 * The inspection report (finalreport_20Block.csv) carries the source frame in its
 * `Label` column — e.g. "7531.JPG" — which the importer folds into the anomaly's
 * `rgbNote` as "Image: 7531.JPG (pos a)". `pos` distinguishes the two modules a
 * single frame can cover when the defect sits on a table boundary.
 *
 * The 229 frames live in public/defimages, lowercased. There are fewer frames
 * than anomalies (229 vs 347) because one frame often captures several defects on
 * the same table, so several anomalies legitimately share an image.
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
