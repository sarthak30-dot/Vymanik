// Shared API types used by both frontend (src/lib/api.ts) and backend (apps/api/)

export type Role = "client" | "team" | "admin";
export type Severity = "critical" | "medium" | "normal" | "nodata";
export type AnomalyStatus = "New" | "Acknowledged" | "In Repair" | "Closed";
export type ProcessingStage =
  | "Queued"
  | "Uploading"
  | "Stitching"
  | "Tiling"
  | "AI Detection"
  | "Ready"
  | "Failed";

export interface AuthToken {
  token: string;
  expiresAt: string;
  userId: string;
  role: Role;
  plantIds: string[];
}

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

export interface AnomalyDTO {
  id: string;
  inspectionId: string;
  plantId: string;
  panelId: string;
  row: number;
  col: number;
  type: string;
  deltaT: number | null;
  severity: Severity;
  string: string;
  inverter: string;
  status: AnomalyStatus;
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
}
