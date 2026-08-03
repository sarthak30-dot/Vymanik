import type { Anomaly, Severity } from "./mock-data";

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "#ef4444",
  medium: "#f59e0b",
  normal: "#22c55e",
  nodata: "#374151",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// KML IconStyle <color> is aabbggrr — the inverse byte order of a #rrggbb hex.
function toKmlColor(hex: string): string {
  const r = hex.slice(1, 3), g = hex.slice(3, 5), b = hex.slice(5, 7);
  return `ff${b}${g}${r}`.toLowerCase();
}

// CDATA content is already raw text — don't HTML-escape it (that would show
// "&amp;" literally). Only the "]]>" terminator sequence needs neutralizing.
function cdataSafe(s: string): string {
  return s.replace(/]]>/g, "]] >");
}

export interface KmlExportOptions {
  plantName: string;
  /** [lng, lat] pairs forming a closed ring. Omit for plants without a surveyed boundary. */
  boundary?: [number, number][];
  /** Used as a single marker when no boundary is available. */
  plantCenter?: { lat: number; lng: number };
  anomalies: Anomaly[];
}

export function buildAnomaliesKML({ plantName, boundary, plantCenter, anomalies }: KmlExportOptions): string {
  const styles = (Object.entries(SEVERITY_COLOR) as [Severity, string][])
    .map(
      ([sev, hex]) => `
    <Style id="sev-${sev}">
      <IconStyle>
        <color>${toKmlColor(hex)}</color>
        <scale>1.1</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon>
      </IconStyle>
      <LineStyle><color>${toKmlColor(hex)}</color><width>1.5</width></LineStyle>
      <PolyStyle><color>80${toKmlColor(hex).slice(2)}</color></PolyStyle>
    </Style>`,
    )
    .join("");

  const boundaryFolder = boundary
    ? `
    <Folder>
      <name>Plant Boundary</name>
      <Placemark>
        <name>${esc(plantName)} — Boundary</name>
        <Style>
          <LineStyle><color>ff0088f5</color><width>2</width></LineStyle>
          <PolyStyle><color>1a0088f5</color></PolyStyle>
        </Style>
        <Polygon>
          <outerBoundaryIs><LinearRing><coordinates>
            ${boundary.map(([lng, lat]) => `${lng},${lat},0`).join(" ")}
          </coordinates></LinearRing></outerBoundaryIs>
        </Polygon>
      </Placemark>
    </Folder>`
    : plantCenter
      ? `
    <Folder>
      <name>Plant Location</name>
      <Placemark>
        <name>${esc(plantName)}</name>
        <Point><coordinates>${plantCenter.lng},${plantCenter.lat},0</coordinates></Point>
      </Placemark>
    </Folder>`
      : "";

  const bySeverity = new Map<Severity, Anomaly[]>();
  for (const a of anomalies) {
    if (!bySeverity.has(a.severity)) bySeverity.set(a.severity, []);
    bySeverity.get(a.severity)!.push(a);
  }

  const anomalyFolders = Array.from(bySeverity.entries())
    .map(([sev, list]) => {
      const placemarks = list
        .map(
          a => `
      <Placemark>
        <name>${esc(a.panelId)}</name>
        <styleUrl>#sev-${sev}</styleUrl>
        <description><![CDATA[
          <b>${cdataSafe(a.type)}</b><br/>
          Severity: ${a.severity}<br/>
          String: ${cdataSafe(a.string)} &middot; Inverter: ${cdataSafe(a.inverter)}<br/>
          Status: ${a.status}<br/>
          ${a.deltaT !== null ? `&Delta;T: +${a.deltaT}&deg;C<br/>` : ""}
          GPS: ${a.gps.lat.toFixed(5)}, ${a.gps.lng.toFixed(5)}
        ]]></description>
        <MultiGeometry>
          <Point><coordinates>${a.gps.lng},${a.gps.lat},0</coordinates></Point>${
            a.footprint
              ? `
          <Polygon><outerBoundaryIs><LinearRing><coordinates>${a.footprint
                  .map(([lng, lat]) => `${lng},${lat},0`)
                  .join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon>`
              : ""
          }
        </MultiGeometry>
      </Placemark>`,
        )
        .join("");
      const label = sev.charAt(0).toUpperCase() + sev.slice(1);
      return `
    <Folder>
      <name>${esc(label)} (${list.length})</name>${placemarks}
    </Folder>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(plantName)} — UrjaScan Export</name>${styles}${boundaryFolder}${anomalyFolders}
  </Document>
</kml>`;
}

export function downloadKML(filename: string, kml: string) {
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
