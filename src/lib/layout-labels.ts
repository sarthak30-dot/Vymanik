/**
 * "Table-6 · INV-3" for a string and its inverter — or just "Table-6" when the
 * survey has no inverter (a survey without an inverter hierarchy stores "—"),
 * so a dash isn't printed where an inverter name would go.
 */
export function stringAndInverter(a: { string: string; inverter: string }): string {
  const inv = a.inverter.trim();
  return inv && inv !== "—" ? `${a.string} · ${inv}` : a.string;
}
