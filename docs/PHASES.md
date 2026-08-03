# UrjaScan Portal — Change Log Against the 11-Section Spec

Source spec: `UrjaScan_Design_Thinking.md` (Vymanik Aerospace root). This file tracks what has
actually been built, commit by commit, against that spec — kept up to date as work lands.

---

## Phase 1 — shipped (commit `8794ab3`)

Scoped down from the full spec to Sections 1, 2, 4, 6 after client-priority confirmation.

### Section 6 — RBAC

**Problem found:** `PATCH /api/anomalies/[id]` had no role check at all — any client-role
auth token could edit anomaly status by calling the API directly, bypassing the UI entirely.

**What changed:**
- `src/lib/permissions.ts` (client) and `api/_lib/permissions.ts` (server) — a single
  permission matrix, so the two sides can't drift out of sync.
- The matrix is enforced in two places: the UI hides (not just disables) controls the
  current role can't use, and the API independently re-checks on every write. The API check
  is the one that actually matters for security — the UI check is only a UX nicety, since a
  client-side hide can always be bypassed by calling the API directly.

### Section 2 — Defect taxonomy

- `src/lib/taxonomy.ts` + migration `003_defect_taxonomy.sql` — `category_code` and
  `defect_type` are now DB-enforced controlled vocabularies (CHECK constraints / enum-style),
  not free text.
- Added `POST /api/anomalies`, which **did not exist before**. The "Report Anomaly" form was
  only writing to a local in-memory cache — nothing was ever persisted to Supabase.

### Section 1 — Asset hierarchy

- Migration `004_asset_hierarchy.sql` — `Plant → Block → Inverter → String` schema.
- Admin "Plant Layout" bulk generator (`api/plant-layout.ts`) to seed the hierarchy for a
  plant in one action instead of row-by-row entry.
- Cascading dropdowns in the anomaly form (block → inverter → string), with a free-text
  fallback for any plant that doesn't have a layout defined yet.

### Section 4 — CSV import

- Canonical import templates.
- Row-level validation with specific errors (e.g. "Row 14: missing lat/lng") instead of an
  all-or-nothing failure.
- Partial success: valid rows import, invalid rows are skipped and listed in a downloadable
  error report.

### Verification at the time

`tsc --noEmit` and `npm run build` passed. The dedicated browser preview tool could not reach
this project path (sandbox permission issue tied to this specific directory — not a code
problem), so the UI itself was not screenshot-verified in that session.

### Blocking action — still not done

Migrations `002_team_members.sql`, `003_defect_taxonomy.sql`, `004_asset_hierarchy.sql` have
**never been run against the production Supabase database.** Until they are, anomaly
creation, plant-layout generation, and CSV import all silently no-op (the app degrades
gracefully to local-only state instead of crashing — but nothing persists).

**To fix:** open the Supabase project's SQL Editor and run the three files in
`packages/db/migrations/` in order (002 → 003 → 004). This cannot be done from here — it
needs direct Supabase dashboard access, which this environment doesn't have.

---

## Map & UI fixes — 2026-07-14 (uncommitted, in working tree)

Not part of the spec phases above — a direct fix requested against the live `/map` page.

### Removed the Schematic view

The client didn't understand the abstract row/column grid view, so it's gone: the
Schematic/Satellite toggle, the `GridCanvas` canvas-renderer component (~280 lines), and the
"Use Schematic for exact row/module reference" line in the GPS disclaimer banner. Satellite
(drone-imagery) view is now the only map mode — `mapMode` state, `Grid3x3` icon import, and
all `severityFor`/`_ANOMALY_MAP`/`PANEL_ASPECT` helpers that only existed to support the grid
canvas were deleted rather than left as dead code.

File: `src/routes/_app/map.tsx`.

### V1 / V2 drone imagery not rendering — root-caused, not yet confirmed fixed

**What's ruled out** (checked directly, not assumed):
- The image assets themselves are fine — `public/rgb_block20.png` and `rgb2_block20.png`
  are valid 1024px orthomosaics with real panel-row content, well under any GPU texture
  limit.
- The georeferencing bounds (`RGB_BOUNDS`, `RGB2_BOUNDS`) are in the correct
  top-left/top-right/bottom-right/bottom-left order Mapbox's image-source spec requires, and
  the default map center falls inside them.
- The `<Source type="image">` / `<Layer type="raster">` usage matches the installed
  `@vis.gl/react-mapbox` v8 API correctly.
- Both the committed (`HEAD`) and uncommitted versions of `map.tsx` use the same
  image-source approach — so this isn't a regression introduced by the uncommitted diff.
  It also explains why the many prior commits iterating on V1/V2 rendering (border
  flood-fill, dot-footprint constraints, marker-vs-layer swaps) never fully fixed it: they
  were all changes to *this* code, and the evidence points to the failure being upstream of
  it.

**Leading hypothesis:** the Mapbox access token (`VITE_MAPBOX_TOKEN`) is invalid, expired, or
domain-restricted on the **production** build specifically. This would explain every observed
symptom at once — the base satellite tiles and the custom V1/V2 image overlays both fail to
load (both need Mapbox's style/tile pipeline to succeed), while the anomaly dot markers still
show and land in roughly the right place, because `Marker` positioning is computed from the
map's camera transform, which initializes independently of whether any tiles ever load.

**Why this isn't confirmed:** this sandbox has no outbound internet access — `curl` to
`api.mapbox.com` and `npx vercel whoami` both silently fail here, and the bundled browser
preview tool can't launch a dev server against this project path (same permission issue noted
in Phase 1). So the token can't be checked or the live site inspected from this environment.

**What was done instead:** `src/routes/_app/map.tsx` now has an `onError`/`onLoad` handler on
the main satellite `<MapGL>` that catches Mapbox load failures and shows a visible red banner
on the map (instead of failing silently), with a message that distinguishes "token missing at
build time" from "token present but rejected." This turns the bug from invisible into
diagnosable without needing another debugging session.

**What you need to check:** open `urjascan.vercel.app/map` and look for that red banner.
- If it says the token is missing: `VITE_MAPBOX_TOKEN` isn't set in Vercel's Production
  environment variables (Project Settings → Environment Variables) — the local `.env` value
  won't apply to the deployed build unless it's also set there.
- If it says the token was rejected: check the token at mapbox.com/account/access-tokens —
  specifically whether it has a URL restriction list that doesn't include
  `urjascan.vercel.app`.
- If no banner appears and imagery still doesn't show: the cause is something else and this
  hypothesis is wrong — screenshot the browser console (Network tab, filter for
  `api.mapbox.com` or `rgb_block20.png`) and that'll pin it down in one look.

---

## Section 3 (partial) — KML export — shipped 2026-07-14 (uncommitted)

Section 3 originally bundled three different features: KML export, KML import, and an
in-map digitization tool for tracing block/string boundaries on the drone imagery. Scoped
down to KML export first, since it's the smallest self-contained piece and the other two
depend on geographic data (block/string polygons) that doesn't exist in the schema yet —
`blocks`/`inverters`/`strings` (migration `004`) only store hierarchy codes and counts, no
coordinates.

**What "layout" means in this export, given that constraint:** there's no polygon geometry
per block or string to export, so the layout is represented as a folder hierarchy instead —
anomalies grouped by severity, each carrying its block/inverter/string as metadata in the
placemark description. The plant boundary polygon is exported for Rajpur (`plant-001`, the
only plant with a drone-surveyed footprint today); other plants export a single point at
their recorded GPS center instead.

**What changed:**
- `src/lib/kml.ts` (new) — `buildAnomaliesKML()` builds a KML 2.2 document: styled
  severity-colored placemarks (icon color derived from the same `SEV_COLOR` palette used on
  the map, converted from `#rrggbb` to KML's `aabbggrr` order), grouped into folders by
  severity, plus the plant boundary or center-point folder. `downloadKML()` triggers a
  browser download via a `Blob` — no server round-trip, since the map page already has all
  the data client-side.
- `src/routes/_app/map.tsx` — "Export KML" button in the header, next to the overlay
  controls. Exports whatever the sidebar filters currently show (`visibleAnomalies`), not
  the full unfiltered anomaly list, so "export what I'm looking at" holds.
- Caught one correctness bug before it shipped: the description field for each placemark is
  wrapped in `<![CDATA[...]]>`, which is already raw, unescaped text — running it through
  the same XML-entity escaper used for `<name>` fields would have double-escaped it (a
  literal `&` in a defect type would have rendered as the text `&amp;` in Google Earth
  instead of `&`). Split into `esc()` for real XML-escaped fields and `cdataSafe()` (which
  only neutralizes an embedded `]]>` sequence, the one thing that actually breaks CDATA) for
  the description body.
- Verified by hand: bundled `kml.ts` standalone with esbuild, ran it against a sample
  anomaly with deliberately hostile characters (`R"<9&>`, `Hot Spot & <test>`), and parsed
  the output with Python's `xml.etree.ElementTree` to confirm it's well-formed. `tsc
  --noEmit` and `vite build` both pass clean.

**Not done:** actually opening the file in Google Earth / Google My Maps to visually confirm
placemark colors and boundary rendering — no browser available in this environment (see the
map-fix section above). Worth a quick check on your end before calling this done.

---

## Section 3 (partial) — real panel-footprint geometry from `Block20_1GV_4.kml` — shipped 2026-08-03 (uncommitted)

Vymanik supplied `Block20_1GV_4.kml` — a drone-survey export containing 347 `<Placemark>`
polygons, one per defective panel in Block 20, each carrying `Rack`/`Panel`/`Module`/`row`/
`col`/`block`/`inv`/`table`/`str`/`ID` as typed `ExtendedData`. This answers the "Vymanik's
actual CSV/KML format" open question below — informally, it's per-panel polygon geometry with
a `Schema`/`SchemaData` block, not the flat CSV Section 4 was built against.

**What it turned out to be:** cross-matching by `(Rack+Panel, table, inv)` key found a 347/347
exact match against the 347 hardcoded anomalies already in `src/lib/mock-data.ts` — this file
*is* the source the mock data was built from (or an identical sibling export), just missing
the polygon shapes, which the mock data flattened down to a single lat/lng point. So this
wasn't a fresh import so much as recovering geometry that had been dropped.

**What changed:**
- `src/lib/mock-data.ts` — added `footprint?: [number, number][]` to the `Anomaly` interface
  (a closed ring of `[lng, lat]` pairs — the actual surveyed panel outline) and populated it
  on all 347 Block 20 entries via key-matched injection from the KML. `_enrich()` already
  spreads `...a`, so the field flows through untouched.
- `src/routes/_app/map.tsx` — new "Panels" toggle in the overlay control group (next to IR/V1/
  V2). Renders `panelOutlinesGeoJSON` (built from `visibleAnomalies` that have a `footprint`,
  respecting the existing sidebar filters) as a `fill` + `line` layer, color-matched to
  `SEV_COLOR` via a Mapbox `match` expression. This replaces the implicit "dot = approximate
  GPS point" model with actual panel-shaped geometry for anomalies that have it — on by
  default.
- `src/lib/kml.ts` — `buildAnomaliesKML()` now emits `<MultiGeometry><Point/><Polygon/></...>`
  per placemark when `footprint` is present (falls back to `Point`-only otherwise), so the
  "Export KML" button round-trips real panel outlines back out, not just pins. Added
  `PolyStyle`/`LineStyle` (translucent severity fill) alongside the existing `IconStyle` to
  each severity `<Style>` block.

**Defect-code decode (from the KML's `ID` field, cross-checked against `type` in
`mock-data.ts`):** `DF` = Diode Failure, `MM` = Multi-Module Hotspot, `MC` = Multi-Cell
Hotspot, `VMC` = Vegetation/Multi-Cell Hotspot, `C` = Cell Hotspot, `MO` = Module Open Circuit,
`SH` = Shading, `SO` = Soiling. **This is a different, more granular scheme than the `CO1`–
`CO4` placeholders in `taxonomy.ts`** (8 specific fault types vs. 4 broad categories) — it
doesn't resolve that open question, though a plausible (unconfirmed) mapping exists: DF/MO →
electrical (CO1), MM/MC/VMC/C → thermal (CO2), SH/SO → environmental (CO4). Not applied to
`taxonomy.ts` since it's a guess, not a Vymanik confirmation.

**Verified:** `tsc --noEmit` and `vite build` both pass clean. Match coverage confirmed
programmatically (347/347, zero collisions on the matching key) before injecting geometry, so
there's no risk of a footprint attached to the wrong panel.

**Not done:** visual confirmation in a live browser — same sandbox limitation as the KML-export
and V1/V2 work above (`preview_start` fails with `EPERM` reading
`node_modules/vite/bin/vite.js` in this project path). Worth loading `/map` and toggling
"Panels" on your end to confirm the outlines render where expected, especially at high zoom
where panel-sized polygons (~1.3m × 1m) are small.

## Not started (Phase 2 / 3 of the spec)

Deferred by client choice when Phase 1 was scoped, still untouched:

| Section | What it covers |
|---|---|
| 3 (remainder) | KML *upload* UI (generic import for future surveys/plants — Block 20's own geometry is now in `mock-data.ts`, see above), satellite-imagery digitization tool |
| 5 | Chunked/resumable uploads for 10GB thermal batches |
| 7 | QC review workflow (Open → Pending QC → Reviewed → Resolved lifecycle) |
| 8–11 | Multi-plant dashboard, PDF reporting, field PWA, UI polish |

## Open questions from the spec (still unanswered by Vymanik)

- Real meaning of the `CO2`/`CO3` category codes — currently placeholder `CO1`–`CO4` in one
  config file (`src/lib/taxonomy.ts`), easy to swap once known. `Block20_1GV_4.kml`'s defect
  codes (`DF`/`MC`/`VMC`/`C`/`MM`/`MO`/`SH`/`SO`) are a different, more granular scheme and
  don't answer this — see the KML-footprint section above for an unconfirmed guess mapping.
- ~~Vymanik's actual CSV/KML format, if one already exists informally.~~ Answered
  2026-08-03: `Block20_1GV_4.kml`, per-panel polygons with typed `ExtendedData` (Rack/Panel/
  Module/block/inv/table/str/ID). See the section above.
- Expected scale (plants / modules / upload frequency) — affects Section 5's architecture.
- Whether AI-based anomaly detection is in scope, and when.
