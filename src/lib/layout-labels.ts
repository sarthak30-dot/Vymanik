/**
 * "Table-6 · INV-3" for a string and its inverter — or just "Table-6" when the
 * survey has no inverter (a survey without an inverter hierarchy stores "—"),
 * so a dash isn't printed where an inverter name would go.
 */
export function stringAndInverter(a: { string: string; inverter: string }): string {
  const inv = a.inverter.trim();
  return inv && inv !== "—" ? `${a.string} · ${inv}` : a.string;
}

/**
 * How a survey names a defect's position — in that survey's own vocabulary.
 *
 * The two deliverables this portal carries do not agree, and neither is wrong.
 *
 * Blocks 06-122 has a block/inverter hierarchy. Its register groups by block
 * and writes a position as "Block: 16, Inv: A, Table: 3, Panel: R8-P12".
 *
 * Hamirpur has neither blocks nor inverters. Its Master CSV groups by rack row
 * — Primary_Zone reads "Row: 19" — and writes the position as its own Layout
 * Location column does: "Table: 6 | S: B | Mod: A - 1". Printing that plant
 * under a "Block" heading invents a hierarchy the site does not have and that
 * the client's own audit workbook never mentions, which is what this fixes.
 *
 * The discriminator is the inverter, matching stringAndInverter above: a survey
 * with no inverter hierarchy stores "—". It is a property of the deliverable,
 * not of the plant id, so a future upload gets the right vocabulary without
 * anything here learning its name.
 */
export interface RegisterLocation {
  /** Heading for the primary grouping column — "Block" or "Row". */
  zoneLabel: string;
  /** Plural, for tab labels and prose — "Blocks" / "Rows". */
  zoneLabelPlural: string;
  /** The zone's value on its own, e.g. "16". "—" when the survey carries none. */
  zone: string;
  /** The register's own Layout Location string, in the register's own format. */
  layout: string;
  /**
   * `layout` plus the zone, for the places that have no separate zone column
   * (the mobile cards, the detail header). The block-style string already
   * names its block, so this is the same string there; the row-style one does
   * not, and losing the row on mobile would leave a defect you cannot walk to.
   */
  full: string;
}

export interface RegisterAnomaly {
  block?: string;
  inverter: string;
  string: string;
  panelId: string;
  stringSide?: string;
  module?: string;
}

/**
 * `plantName` is only a fallback for the Block 20 deliverable, whose rows carry
 * no block field and whose plant was named "Block 20 Solar Plant" — without it
 * those rows read "Block: Block 20 Solar Plant".
 */
export function registerLocation(a: RegisterAnomaly, plantName = ""): RegisterLocation {
  const table = a.string.replace(/^Table-/i, "");
  const zone = a.block ?? plantName.match(/Block\s+(\d+)/i)?.[1] ?? "—";
  const inv = a.inverter?.trim().replace(/^INV-/i, "") ?? "";

  if (inv && inv !== "—") {
    const layout = `Block: ${zone}, Inv: ${inv}, Table: ${table}, Panel: ${a.panelId}`;
    return { zoneLabel: "Block", zoneLabelPlural: "Blocks", zone, layout, full: layout };
  }

  // Row-style register: mirror the Master CSV's Layout Location verbatim, and
  // drop any part the row doesn't carry rather than printing an empty label.
  const parts = [`Table: ${table}`];
  if (a.stringSide) parts.push(`S: ${a.stringSide}`);
  if (a.module) parts.push(`Mod: ${a.module}`);
  const layout = parts.join(" | ");
  return {
    zoneLabel: "Row",
    zoneLabelPlural: "Rows",
    zone,
    layout,
    // Matches how the Master CSV reads across its two columns: "Row: 19" then
    // "Table: 6 | S: B | Mod: A - 1".
    full: `Row: ${zone} | ${layout}`,
  };
}
