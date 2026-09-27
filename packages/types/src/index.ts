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
  /** Client / plant owner name (migration 006) — null for rows saved before it. */
  client: string | null;
}

export type TeamMemberStatus = "On Mission" | "Active" | "Off Duty";

/**
 * What this person actually does — added in migration 005 so the Control
 * Center can record who flies vs. who processes the captured data, instead
 * of everyone added showing up as an undifferentiated "team member".
 */
export type TeamMemberRole = "Drone Pilot" | "Data Processor" | "Pilot & Processor" | "Supervisor";

export interface TeamMemberDTO {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  droneModel: string;
  certifications: string[];
  assignedPlantId: string | null;
  status: TeamMemberStatus;
  role: TeamMemberRole;
  currentTask: string | null;
  inspectionsCompleted: number;
  anomaliesFound: number;
  lastActive: string;
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
  categoryCode?: string | null;
  defectType?: string | null;
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
  /** Asset-register fields + surveyed outline from an uploaded survey KML
   *  (migration 007). Absent for hand-entered / CSV rows. */
  block?: string;
  smb?: string;
  stringSide?: string;
  module?: string;
  defectCode?: string;
  footprint?: [number, number][];
}
