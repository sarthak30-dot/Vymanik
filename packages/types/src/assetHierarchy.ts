/**
 * Section 1 asset ID convention — UrjaScan Portal change spec.
 * Example: PLANT21-B24-INV03-STR05-MOD012
 */

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

export function blockCode(index: number): string {
  return `B${pad(index, 2)}`;
}

export function inverterCode(index: number): string {
  return `INV${pad(index, 2)}`;
}

export function stringCode(index: number): string {
  return `STR${pad(index, 2)}`;
}

export function moduleCode(index: number): string {
  return `MOD${pad(index, 3)}`;
}

/** Builds the full standard asset ID for a module, e.g. PLANT21-B24-INV03-STR05-MOD012 */
export function buildModuleAssetId(opts: {
  plantCode: string;
  blockCode: string;
  inverterCode: string;
  stringCode: string;
  moduleIndex: number;
}): string {
  return `${opts.plantCode}-${opts.blockCode}-${opts.inverterCode}-${opts.stringCode}-${moduleCode(opts.moduleIndex)}`;
}

/** Derives a short plant code from a plant id/name for use in asset IDs, e.g. "plant-rajpur-1" -> "PLANTRAJPUR1" */
export function derivePlantCode(plantId: string): string {
  return plantId.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
