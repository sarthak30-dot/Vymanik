/**
 * Section 2 defect/anomaly controlled vocabulary — UrjaScan Portal change spec.
 *
 * Canonical source — api/* imports this directly (relative import, same as
 * api/_lib/mappers.ts already does for other shared types). src/lib/taxonomy.ts
 * mirrors these exact values for the frontend, since the Vite frontend build
 * doesn't otherwise import packages/types (see that file for why). If you
 * change a value here, update the frontend mirror in the same change.
 */

/** Defect type — fixed list from the spec, editable only by Admin (Section 2). */
export const DEFECT_TYPES = [
  "Diode Failure",
  "Single-cell Hotspot",
  "Multi-cell Hotspot",
  "Full-module Hotspot",
  "Module Offline",
  "Soiling",
  "Delamination",
  "Shading",
  "Cracked Cell",
  "PID (Potential Induced Degradation)",
  "Junction Box Fault",
  "Other",
] as const;

export type DefectType = (typeof DEFECT_TYPES)[number];

/**
 * Category code — PLACEHOLDER. The Jul 8 meeting referenced "CO2/CO3-style"
 * codes but didn't define them precisely (see spec's "Open questions to
 * confirm with Vymanik", item 1). These are provisional so the schema and
 * forms aren't blocked on that answer — swap the `code`/`label` values here
 * once confirmed and both mirrors below pick it up.
 */
export const CATEGORY_CODES = [
  { code: "CO1", label: "CO1 — Electrical fault (placeholder, confirm with Vymanik)" },
  { code: "CO2", label: "CO2 — Thermal anomaly (placeholder, confirm with Vymanik)" },
  { code: "CO3", label: "CO3 — Physical/mechanical damage (placeholder, confirm with Vymanik)" },
  { code: "CO4", label: "CO4 — Environmental (soiling/shading) (placeholder, confirm with Vymanik)" },
] as const;

export type CategoryCode = (typeof CATEGORY_CODES)[number]["code"];

/**
 * Severity is already a DB-enforced controlled vocabulary
 * (see packages/db/migrations/001_init.sql CHECK constraint) — kept as the
 * existing critical/medium/normal/nodata levels rather than renamed to the
 * spec's Low/Medium/High, since severity is read on 8+ frontend files and a
 * rename has no functional benefit over the existing color-coded scheme.
 * Mapping: critical≈High(red), medium≈Medium(amber), normal≈Low(green),
 * nodata = no thermal data captured for this asset.
 */
