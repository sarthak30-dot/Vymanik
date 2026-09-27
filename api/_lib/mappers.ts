import type { PlantDTO, AnomalyDTO, TeamMemberDTO } from "../../packages/types/src/index";

export function toPlantDTO(row: Record<string, unknown>): PlantDTO {
  return {
    id:             row.id as string,
    name:           row.name as string,
    location:       row.location as string,
    capacityMW:     Number(row.capacity_mw),
    totalPanels:    Number(row.total_panels),
    lastInspection: row.last_inspection as string | null,
    nextInspection: row.next_inspection as string | null,
    healthScore:    Number(row.health_score),
    dailyLossINR:   Number(row.daily_loss_inr),
    dailyLossKWh:   Number(row.daily_loss_kwh),
    feedInTariff:   Number(row.feed_in_tariff),
    lat:            Number(row.lat),
    lng:            Number(row.lng),
    // null when migration 006 hasn't been run (no column) or the row predates it.
    client:         (row.client as string | null | undefined) ?? null,
  };
}

export function toAnomalyDTO(row: Record<string, unknown>): AnomalyDTO {
  return {
    id:             row.id as string,
    inspectionId:   row.inspection_id as string,
    plantId:        row.plant_id as string,
    panelId:        row.panel_id as string,
    row:            Number(row.row),
    col:            Number(row.col),
    type:           row.type as string,
    deltaT:         row.delta_t != null ? Number(row.delta_t) : null,
    severity:       row.severity as AnomalyDTO["severity"],
    categoryCode:   (row.category_code as string | null) ?? null,
    defectType:     (row.defect_type as string | null) ?? null,
    string:         row.string as string,
    inverter:       row.inverter as string,
    status:         row.status as AnomalyDTO["status"],
    date:           row.date as string,
    inspectionTime: row.inspection_time as string,
    rgbNote:        row.rgb_note as string,
    gps: {
      lat: Number(row.gps_lat),
      lng: Number(row.gps_lng),
    },
    peakTemp:       row.peak_temp     != null ? Number(row.peak_temp)     : undefined,
    refTemp:        row.ref_temp      != null ? Number(row.ref_temp)      : undefined,
    irradiance:     row.irradiance    != null ? Number(row.irradiance)    : undefined,
    moduleSerial:   row.module_serial != null ? String(row.module_serial) : undefined,
    dailyLossINR:   row.daily_loss_inr != null ? Number(row.daily_loss_inr) : undefined,
    dailyLossKWh:   row.daily_loss_kwh != null ? Number(row.daily_loss_kwh) : undefined,
    // Survey fields (migration 007) — undefined for rows without them, or
    // before the migration has been run.
    block:          row.block       != null ? String(row.block)       : undefined,
    smb:            row.smb         != null ? String(row.smb)         : undefined,
    stringSide:     row.string_side != null ? String(row.string_side) : undefined,
    module:         row.module      != null ? String(row.module)      : undefined,
    defectCode:     row.defect_code != null ? String(row.defect_code) : undefined,
    footprint:      Array.isArray(row.footprint) ? (row.footprint as [number, number][]) : undefined,
  };
}

export function toTeamMemberDTO(row: Record<string, unknown>): TeamMemberDTO {
  const name = row.name as string;
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join("") || "NA";

  return {
    id:                    row.id as string,
    name,
    initials,
    email:                 row.email as string,
    phone:                 (row.phone as string) ?? "",
    droneModel:            (row.drone_model as string) ?? "",
    certifications:        (row.certifications as string[]) ?? [],
    assignedPlantId:       (row.assigned_plant_id as string | null) ?? null,
    status:                row.status as TeamMemberDTO["status"],
    // Falls back when migration 005_team_member_roles.sql hasn't been run yet
    // against this Supabase project — the column won't exist on the row.
    role:                  (row.role as TeamMemberDTO["role"]) ?? "Drone Pilot",
    currentTask:           (row.current_task as string | null) ?? null,
    inspectionsCompleted:  Number(row.inspections_completed ?? 0),
    anomaliesFound:        Number(row.anomalies_found ?? 0),
    lastActive:            (row.last_active as string) ?? "",
  };
}
