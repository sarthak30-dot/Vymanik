/**
 * Image-based plant → block picker for the header's plant switcher.
 *
 * Replaces the plain-text `<select>` with a thumbnail so an operator picks a
 * plant by *seeing* it (an aerial thumbnail of its own GPS coordinates via
 * Mapbox's static image API, same token the map/CSV wizard already use —
 * falling back to an initials tile when no token is configured, never a
 * broken image). Picking a plant expands it in place to show that plant's
 * blocks (derived from its own anomaly data, the same source
 * anomalies/by-block.tsx charts from — not the Plant Layout table, which is
 * empty for most demo plants); clicking a block deep-links straight into
 * that block's drill-down via by-block's `?block=` search param instead of
 * landing the operator on the whole-plant chart and making them find it
 * again by hand.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, LayoutGrid } from "lucide-react";
import { allPlants, type PlantSummary } from "@/lib/mock-data";
import { usePlantContext } from "@/lib/plant-context";
import { useAnomalies } from "@/lib/queries";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

function thumbnailUrl(p: PlantSummary, px: number): string | null {
  if (!MAPBOX_TOKEN) return null;
  // Static Images API — zoom 14 frames a plant-sized area without a network
  // round-trip to fit its actual footprint; good enough for a picker thumbnail.
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${p.gps.lng},${p.gps.lat},14,0/${px}x${px}@2x?access_token=${MAPBOX_TOKEN}`;
}

function initials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "PL"
  );
}

function PlantThumb({ plant, px }: { plant: PlantSummary; px: number }) {
  const url = thumbnailUrl(plant, px);
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        onError={() => setFailed(true)}
        alt=""
        width={px}
        height={px}
        className="object-cover shrink-0 bg-grey-100"
        style={{ width: px, height: px }}
      />
    );
  }
  // No Mapbox token, or the thumbnail failed to load — an initials tile reads
  // as "this plant" at a glance same as a photo would, never a broken-image icon.
  return (
    <div
      className="shrink-0 bg-primary text-white flex items-center justify-center font-semibold"
      style={{ width: px, height: px, fontSize: px * 0.34 }}
    >
      {initials(plant.name)}
    </div>
  );
}

/** Unique block codes for a plant, counted off its own anomaly data — same
 *  derivation anomalies/by-block.tsx uses, so the chips shown here always
 *  match what that page actually has to drill into. */
function useBlocksForPlant(plantId: string): { block: string; count: number }[] {
  const { data: allAnomalies = [] } = useAnomalies();
  const grouped = new Map<string, number>();
  for (const a of allAnomalies) {
    if (a.plantId !== plantId && !(!a.plantId && plantId === "plant-001")) continue;
    const b = a.block;
    if (!b) continue;
    grouped.set(b, (grouped.get(b) ?? 0) + 1);
  }
  return [...grouped.entries()]
    .map(([block, count]) => ({ block, count }))
    .sort((a, b) => Number(a.block) - Number(b.block) || a.block.localeCompare(b.block));
}

export function PlantPicker() {
  const { selectedPlant, setSelectedPlantId } = usePlantContext();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const blocks = useBlocksForPlant(expandedId ?? "");

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickPlant(p: PlantSummary) {
    setSelectedPlantId(p.id);
    setExpandedId((prev) => (prev === p.id ? null : p.id));
  }

  function pickBlock(block: string) {
    setOpen(false);
    navigate({ to: "/anomalies/by-block", search: { block } });
  }

  return (
    <div ref={rootRef} className="hidden md:block relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Switch plant"
        className="flex items-center gap-2 h-8 pl-1.5 pr-2.5 border border-grey-200 bg-grey-50 hover:bg-muted text-sm font-medium text-foreground"
      >
        <PlantThumb plant={selectedPlant} px={22} />
        <span className="max-w-[160px] truncate">{selectedPlant.name}</span>
        <span className="mono text-xs text-muted-foreground">— {selectedPlant.capacityMW} MW</span>
        <ChevronDown size={12} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-80 max-h-[70vh] overflow-y-auto bg-card border border-border shadow-lg z-50">
          {allPlants.map((p) => {
            const isSelected = p.id === selectedPlant.id;
            const isExpanded = p.id === expandedId;
            return (
              <div key={p.id} className="border-b border-grey-200 last:border-b-0">
                <button
                  onClick={() => pickPlant(p)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted transition ${isSelected ? "bg-ochre-muted" : ""}`}
                >
                  <PlantThumb plant={p} px={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.location} · {p.capacityMW} MW
                    </p>
                  </div>
                  {isSelected && (
                    <span className="text-[10px] font-semibold text-ochre-fg uppercase tracking-wide shrink-0">
                      Current
                    </span>
                  )}
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3">
                    {blocks.length > 0 ? (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-grey-400 mb-1.5 flex items-center gap-1.5">
                          <LayoutGrid size={11} /> Jump to a block
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {blocks.map(({ block, count }) => (
                            <button
                              key={block}
                              onClick={() => pickBlock(block)}
                              className="h-7 px-2.5 border border-grey-200 bg-card hover:border-ochre hover:bg-ochre-muted text-xs font-medium inline-flex items-center gap-1"
                              title={`${count} defect${count === 1 ? "" : "s"} in Block ${block}`}
                            >
                              Block {block}
                              <span className="mono text-[10px] text-muted-foreground">
                                {count}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No block-level data for this plant yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
