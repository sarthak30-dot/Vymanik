import { clientDefectType } from "./mock-data";

/**
 * How many modules one reported defect puts out of service.
 *
 * Most defects are one finding on one module. A String Offline is different:
 * the thermal camera sees the whole string heated, and the client's audit
 * counts every module on it — 26 for a full string, 13 for a Partial String
 * Offline. The client confirmed (2026-10) that this is the rule for every
 * plant, so it lives here as one shared definition rather than in each report
 * or tile that needs a module count.
 *
 * Keyed on the client-facing category, not the raw `type`, so every internal
 * spelling that reads as "String Offline" (see clientDefectType) counts the
 * same way.
 *
 * Use this for "how many modules are affected" figures (report summary,
 * healthy-panel count). Counts of *defects* — the anomaly list, the severity
 * pie, the defect-wise graphs — stay one per finding, as in the audit workbook.
 */
export const MODULES_PER_STRING = 26;
export const MODULES_PER_PARTIAL_STRING = 13;

export function moduleMultiplier(type: string): number {
  switch (clientDefectType(type)) {
    case "String Offline":
      return MODULES_PER_STRING;
    case "Partial String Offline":
      return MODULES_PER_PARTIAL_STRING;
    default:
      return 1;
  }
}

/** Modules affected by a set of defects, multipliers applied. */
export function affectedModules(rows: readonly { type: string }[]): number {
  let total = 0;
  for (const r of rows) total += moduleMultiplier(r.type);
  return total;
}
