/**
 * UrjaScan Backend API
 *
 * Stack:
 *   API layer    — Cloudflare Worker (this repo, src/server.ts + TanStack Start server fns)
 *   Storage      — Cloudflare R2  (raw thermal/RGB uploads + processed tile pyramids)
 *   Database     — Cloudflare D1  (SQLite; anomalies, plants, inspections, users)
 *   Queue        — Cloudflare Queues  (async job dispatch to the Compute Worker)
 *   Sessions     — Cloudflare KV  (JWT session store)
 *   Real-time    — Cloudflare Durable Objects  (WebSocket hub for job progress)
 *   Compute      — Fly.io Machine  (CPU/GPU worker; GDAL, ODM, AI inference)
 *   Tile server  — TiTiler on Fly.io  (serves XYZ tiles from COG GeoTIFFs in R2)
 *   CDN          — Cloudflare Cache  (tiles cached at edge, TTL 7 days)
 *
 * TGIS pipeline per inspection
 *   1. Client POSTs multipart/form-data → Worker streams chunks → R2 (raw/)
 *   2. Worker enqueues ProcessingJob → Cloudflare Queue
 *   3. Fly.io Compute Worker dequeues job
 *      a. Pull raw images from R2
 *      b. OpenDroneMap stitch → orthomosaic GeoTIFF  (~25 min for 5 GB)
 *      c. gdal_translate → Cloud-Optimized GeoTIFF (COG)
 *      d. gdal2tiles → XYZ tile pyramid (z=0..20) → R2 (tiles/{inspectionId}/)
 *      e. Thermal threshold scan (ΔT > 15°C = anomaly candidate)
 *      f. YOLO-v8 inference on thermal tiles → hotspot bounding boxes
 *      g. GPS-project bounding boxes → panel grid coordinates
 *      h. Write anomaly rows to D1
 *      i. Update job stage → "Ready" via Durable Object WebSocket broadcast
 *   4. Frontend receives WS event, refreshes review queue
 *
 * Tile URL scheme
 *   GET /tiles/{inspectionId}/{z}/{x}/{y}.png
 *   Served by TiTiler pointing at R2 presigned COG URL.
 *   Thermal overlay: ?colormap=inferno&rescale=20,100   (20°C–100°C range)
 */

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password?: string;
  otp?: string;
  role: "client" | "team" | "admin";
}

export interface AuthToken {
  token: string;
  expiresAt: string;
  userId: string;
  role: "client" | "team" | "admin";
  plantIds: string[];
}

// ─── Plants ────────────────────────────────────────────────────────────────

export interface PlantDTO {
  id: string;
  name: string;
  location: string;
  capacityMW: number;
  totalPanels: number;
  lastInspection: string | null;
  nextInspection: string | null;
  healthScore: number;
  dailyLossINR: number;
  dailyLossKWh: number;
  feedInTariff: number;
  lat: number;
  lng: number;
}

// ─── Inspections ───────────────────────────────────────────────────────────

export type ProcessingStage =
  | "Queued"
  | "Uploading"
  | "Stitching"
  | "Tiling"
  | "AI Detection"
  | "Ready"
  | "Failed";

export interface InspectionJob {
  id: string;
  inspectionId: string;
  plantId: string;
  plantName: string;
  clientName: string;
  pilot: string;
  date: string;
  uploadedAt: string;
  datasetGB: number;
  tileCount: number | null;
  anomalyCount: number | null;
  stage: ProcessingStage;
  progressPct: number;
  errorMessage?: string;
}

export interface InspectionUploadRequest {
  plantId: string;
  clientId: string;
  date: string;
  pilot: string;
  droneModel: string;
  irradiance: number;
  windSpeed: number;
  cloudCover: string;
}

export interface UploadSession {
  uploadId: string;
  r2UploadUrl: string;
  wsJobUrl: string;
}

// ─── Anomalies ─────────────────────────────────────────────────────────────

export interface AnomalyDTO {
  id: string;
  inspectionId: string;
  plantId: string;
  panelId: string;
  row: number;
  col: number;
  type: string;
  deltaT: number | null;
  deltaTNorm: number | null;  // IEC 62446-3 normalised to 1000 W/m²
  severity: "critical" | "medium" | "normal" | "nodata";
  string: string;
  inverter: string;
  status: "New" | "Acknowledged" | "In Repair" | "Closed";
  rootCause: string | null;
  date: string;
  inspectionTime: string;
  rgbNote: string;
  gps: { lat: number; lng: number };
  peakTemp?: number;
  refTemp?: number;
  irradiance?: number;
  moduleSerial?: string;
  dailyLossINR?: number;
  dailyLossKWh?: number;
  tileBbox?: [number, number, number, number]; // [west, south, east, north] in WGS84
}

export interface AnomalyStatusPatch {
  status?: "New" | "Acknowledged" | "In Repair" | "Closed";
  rootCause?: string | null;
}

// ─── Tiles ─────────────────────────────────────────────────────────────────

export interface TileLayerConfig {
  inspectionId: string;
  tileUrlTemplate: string;   // e.g. /api/tiles/{inspectionId}/{z}/{x}/{y}.png
  thermalUrlTemplate: string; // same path + ?colormap=inferno&rescale=20,100
  bounds: [number, number, number, number]; // [west, south, east, north]
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  totalSizeGB: number;
}

// ─── API Client ────────────────────────────────────────────────────────────

// In dev, Vite proxies /api → http://localhost:3001 (see vite.config.ts).
// In production (Vercel), /api/* is served by serverless functions.
// Set VITE_API_BASE_URL only if your backend is on a different domain.
const BASE = `${import.meta.env.VITE_API_BASE_URL ?? ""}/api`;

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // If the server says our token is invalid/expired, clear the session and
  // send the user back to the login page instead of leaving them on a blank screen.
  if (res.status === 401) {
    const { clearAuth } = await import("./auth");
    clearAuth();
    window.location.href = "/";
    throw new Error("Session expired. Please log in again.");
  }

  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    login: (body: LoginRequest) => req<AuthToken>("POST", "/auth/login", body),
    sendOtp: (phone: string) => req<{ sent: boolean }>("POST", "/auth/otp", { phone }),
    logout: (token: string) => req<void>("POST", "/auth/logout", {}, token),
  },

  plants: {
    list: (token: string) => req<PlantDTO[]>("GET", "/plants", undefined, token),
    get: (id: string, token: string) => req<PlantDTO>("GET", `/plants/${id}`, undefined, token),
  },

  inspections: {
    /** Initiate an upload session; use the returned r2UploadUrl to stream multipart */
    createUpload: (body: InspectionUploadRequest, token: string) =>
      req<UploadSession>("POST", "/inspections/upload", body, token),
    /** Poll or use WebSocket at wsJobUrl to track progress */
    getJob: (uploadId: string, token: string) =>
      req<InspectionJob>("GET", `/inspections/jobs/${uploadId}`, undefined, token),
    /** All jobs visible to this team user */
    listJobs: (token: string) => req<InspectionJob[]>("GET", "/inspections/jobs", undefined, token),
    /** Analyst approves and publishes to client */
    publish: (inspectionId: string, token: string) =>
      req<void>("POST", `/inspections/${inspectionId}/publish`, {}, token),
  },

  anomalies: {
    list: (plantId: string, inspectionId: string, token: string) =>
      req<AnomalyDTO[]>("GET", `/anomalies?plantId=${plantId}&inspectionId=${inspectionId}`, undefined, token),
    get: (id: string, token: string) =>
      req<AnomalyDTO>("GET", `/anomalies/${id}`, undefined, token),
    patch: (id: string, body: AnomalyStatusPatch, token: string) =>
      req<AnomalyDTO>("PATCH", `/anomalies/${id}`, body, token),
  },

  tiles: {
    config: (inspectionId: string, token: string) =>
      req<TileLayerConfig>("GET", `/tiles/${inspectionId}/config`, undefined, token),
    /** Returns a short-lived R2 presigned URL for a specific tile (fallback if no public CDN) */
    presign: (inspectionId: string, z: number, x: number, y: number, token: string) =>
      req<{ url: string }>("GET", `/tiles/${inspectionId}/${z}/${x}/${y}/presign`, undefined, token),
  },

  reports: {
    generate: (inspectionId: string, type: "exec" | "tech" | "warranty", token: string) =>
      req<{ downloadUrl: string }>("POST", `/reports/${inspectionId}/${type}`, {}, token),
  },
};

// ─── WebSocket job events ───────────────────────────────────────────────────

export type JobEvent =
  | { type: "progress"; stage: ProcessingStage; pct: number }
  | { type: "tilesDone"; tileCount: number; totalSizeGB: number }
  | { type: "anomaliesDone"; count: number }
  | { type: "ready"; inspectionId: string }
  | { type: "error"; message: string };

export function connectJobSocket(wsUrl: string, onEvent: (e: JobEvent) => void): () => void {
  const ws = new WebSocket(wsUrl);
  ws.onmessage = (msg) => {
    try { onEvent(JSON.parse(msg.data as string) as JobEvent); } catch { /* ignore */ }
  };
  return () => ws.close();
}
