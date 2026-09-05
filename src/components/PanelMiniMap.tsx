import { Link } from "@tanstack/react-router";
import { MapPin, Maximize2 } from "lucide-react";
import MapGL, { Marker } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { tokenFor } from "@/lib/severity-tokens";
import type { Severity, Status } from "@/lib/mock-data";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

/**
 * A static, non-interactive locator map for one anomaly's panel — a contextual
 * "where on the site is this" glimpse on the anomaly detail page, deep-linking
 * into the full map focused on the same panel.
 *
 * Deliberately NOT the real map component (routes/_app/map.tsx): that page owns
 * 1,249 features, the orthomosaic overlays, clustering and the alignment tools;
 * none of that belongs on a detail page and re-mounting it would be heavy. This
 * is a single satellite tile with one pin.
 *
 * `interactive={false}` disables every gesture (drag/scroll/zoom/rotate) in one
 * prop, matching the brief's "controls disabled (static/lightweight view)" — so
 * the card reads as an image, and the "View in Full Site Map" link is the only
 * way to actually explore, landing on /map?focus=<id> pre-centred on this panel.
 */
export function PanelMiniMap({
  anomalyId,
  panelId,
  lat,
  lng,
  severity,
  status,
  caption,
}: {
  anomalyId: string;
  panelId: string;
  lat: number;
  lng: number;
  severity: Severity;
  status?: Status;
  /** Rack/inverter context (e.g. "Table-198 · INV-B") shown as a footer strip so
   *  the panel's location reads without opening the full map. */
  caption?: string;
}) {
  const pinColor = tokenFor(severity, status)?.vivid ?? "#EE0000";

  return (
    <section className="bg-card border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <h2 className="font-semibold text-sm uppercase tracking-widest text-grey-400 flex items-center gap-2">
          <MapPin size={14} className="text-ochre" /> Panel Location
        </h2>
        <Link
          to="/map"
          search={{ focus: anomalyId }}
          className="text-ochre hover:underline text-xs inline-flex items-center gap-1 font-medium"
        >
          <Maximize2 size={12} /> View in Full Site Map
        </Link>
      </div>

      <div className="relative h-56 bg-black">
        {MAPBOX_TOKEN ? (
          <MapGL
            mapboxAccessToken={MAPBOX_TOKEN}
            // A fresh view each mount; there is no camera state to keep because
            // the map cannot be moved.
            initialViewState={{ longitude: lng, latitude: lat, zoom: 18 }}
            mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
            interactive={false}
            attributionControl={false}
            style={{ width: "100%", height: "100%" }}
          >
            <Marker longitude={lng} latitude={lat} anchor="bottom">
              <div className="flex flex-col items-center -mb-1">
                <span
                  className="px-1.5 py-0.5 mb-1 rounded-sm text-[10px] font-semibold mono text-white shadow"
                  style={{ backgroundColor: pinColor }}
                >
                  {panelId}
                </span>
                <MapPin size={30} strokeWidth={2.5} color="#ffffff" fill={pinColor} className="drop-shadow-md" />
              </div>
            </Marker>
          </MapGL>
        ) : (
          // Same graceful degradation the main map uses when the token is absent
          // from a build, rather than a blank black rectangle.
          <div className="absolute inset-0 flex items-center justify-center text-center px-4">
            <p className="text-xs text-muted-foreground">
              Map preview unavailable — Mapbox token not configured for this build.
              <br />
              GPS: <span className="mono">{lat}° N, {lng}° E</span>
            </p>
          </div>
        )}
      </div>

      {caption && (
        <div className="px-5 py-2.5 border-t border-border flex items-center gap-2 text-xs">
          <MapPin size={12} style={{ color: pinColor }} className="shrink-0" />
          <span className="mono font-semibold text-foreground">{panelId}</span>
          <span className="text-muted-foreground truncate">· {caption}</span>
        </div>
      )}
    </section>
  );
}
