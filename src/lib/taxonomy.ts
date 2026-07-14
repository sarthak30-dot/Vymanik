/**
 * Frontend mirror of packages/types/src/taxonomy.ts — see that file for the
 * full explanation of each list (category codes are provisional placeholders
 * pending Vymanik confirmation). Keep these two files in sync by hand; the
 * frontend build doesn't import packages/types directly (see src/lib/auth.ts
 * and src/lib/permissions.ts for the same convention with the Role type).
 */

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

export const CATEGORY_CODES = [
  { code: "CO1", label: "CO1 — Electrical fault (placeholder, confirm with Vymanik)" },
  { code: "CO2", label: "CO2 — Thermal anomaly (placeholder, confirm with Vymanik)" },
  { code: "CO3", label: "CO3 — Physical/mechanical damage (placeholder, confirm with Vymanik)" },
  { code: "CO4", label: "CO4 — Environmental (soiling/shading) (placeholder, confirm with Vymanik)" },
] as const;

export type CategoryCode = (typeof CATEGORY_CODES)[number]["code"];
