#!/usr/bin/env python3
"""
Regenerate the _rawAnomalies array in src/lib/mock-data.ts from the client CSV.

Usage:
  python3 scripts/gen_mock_from_csv.py \
    "/Users/bharatjain/Downloads/DFECT PANELS.csv" \
    src/lib/mock-data.ts

The script locates the const _rawAnomalies = ([ ... ] as any) block in mock-data.ts
and replaces its contents with data generated from the CSV.
"""
import csv
import sys
import re
from pathlib import Path

CSV_PATH    = sys.argv[1] if len(sys.argv) > 1 else "/Users/bharatjain/Downloads/DFECT PANELS.csv"
TARGET_PATH = sys.argv[2] if len(sys.argv) > 2 else "src/lib/mock-data.ts"

INSPECTION_DATE = "31 March 2026"

CODE_MAP = {
    "MM": ("Multi-Module Hotspot", "critical"),
    "BD": ("Diode Failure",        "critical"),
    "SP": ("Module Open Circuit",  "critical"),
    "MB": ("Bypassed Substring",   "critical"),
    "MC": ("Multi-Cell Hotspot",   "medium"),
    "SC": ("Cell Hotspot",         "medium"),
    "SO": ("Soiling",              "normal"),
    "SH": ("Shading",              "normal"),
}

SEV_RANK = {"critical": 0, "medium": 1, "normal": 2}

# ── Parse CSV ─────────────────────────────────────────────────────────────────
rows = []
with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    for row in reader:
        rack   = row["Rack"].strip().strip('"')
        panel  = row["Panel"].strip().strip('"')
        module = row["Module"].strip().strip('"')
        block  = row["block"].strip().strip('"').lstrip("0") or "0"
        inv    = row["inv"].strip().strip('"')
        smb    = row["smb"].strip().strip('"')
        table  = row["table"].strip().strip('"')
        str_ab = row["str"].strip().strip('"')
        code   = row["id"].strip().strip('"')
        img    = row["Label"].strip().strip('"')
        lng    = float(row["xcoord"].strip())
        lat    = float(row["ycoord"].strip())

        dtype, sev = CODE_MAP.get(code, ("Other", "medium"))
        rows.append(dict(
            rack=rack, panel=panel, module=module, block=block,
            inv=inv, smb=smb, table=table, str=str_ab,
            code=code, type=dtype, severity=sev,
            img=img, lat=lat, lng=lng,
        ))

rows.sort(key=lambda r: (SEV_RANK.get(r["severity"], 3), r["block"].zfill(3),
                          int(r["rack"]), int(r["panel"])))

# ── Build replacement entries ─────────────────────────────────────────────────
entry_lines = []
for i, r in enumerate(rows, 1):
    pid     = f"R{r['rack']}-P{r['panel']}"
    inv_str = f"INV-{r['inv']}"
    tbl_str = f"Table-{r['table']}"
    smb_fmt = r["smb"].zfill(2) if r["smb"].isdigit() else r["smb"]
    comma   = "," if i < len(rows) else ""
    entry_lines.append(
        f'  {{ id: "{i}", panelId: "{pid}", row: {r["rack"]}, col: {r["panel"]}, '
        f'type: "{r["type"]}", deltaT: null, severity: "{r["severity"]}", '
        f'string: "{tbl_str}", inverter: "{inv_str}", '
        f'status: "New", date: "{INSPECTION_DATE}", inspectionTime: "—", '
        f'rgbNote: "Image: {r["img"]}", '
        f'gps: {{ lat: {r["lat"]:.7f}, lng: {r["lng"]:.7f} }}, '
        f'block: "{r["block"]}", smb: "{smb_fmt}", stringSide: "{r["str"]}", '
        f'module: "{r["module"]}", defectCode: "{r["code"]}" }}{comma}'
    )

# ── Read and patch mock-data.ts ───────────────────────────────────────────────
src = Path(TARGET_PATH).read_text(encoding="utf-8")

# Match: const _rawAnomalies = ([   ...all entries...   ] as any)
START_PAT = re.compile(r'const _rawAnomalies = \(\[')
END_PAT   = re.compile(r'\] as unknown\) as RawAnomaly\[\];')

m_start = START_PAT.search(src)
if not m_start:
    sys.exit("ERROR: could not find 'const _rawAnomalies = ([' in " + TARGET_PATH)

# Find the matching '] as any)' after the opening
search_from = m_start.end()
m_end = END_PAT.search(src, search_from)
if not m_end:
    sys.exit("ERROR: could not find '] as any)' in " + TARGET_PATH)

before   = src[:m_start.end()]    # up to and including '(['
after    = src[m_end.start():]    # from '] as unknown) as RawAnomaly[];' onwards
new_body = "\n" + "\n".join(entry_lines) + "\n"

new_src = before + new_body + after
Path(TARGET_PATH).write_text(new_src, encoding="utf-8")

print(f"✓ Wrote {len(rows)} anomalies into {TARGET_PATH}")

from collections import Counter
print(f"\nSeverity: {dict(Counter(r['severity'] for r in rows).most_common())}")
print(f"Types:    {dict(Counter(r['type'] for r in rows).most_common())}")
print(f"Blocks:   {dict(sorted(Counter(r['block'] for r in rows).items(), key=lambda x: -x[1]))}")
