import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { getToken } from "./auth";
import type { AnomalyStatusPatch, PlantDTO, AnomalyDTO, PlantLayout, NewPlantLayoutInput, TeamMemberRole, EditTeamMemberInput, PlantSurvey } from "./api";
import {
  plant as mockPlant, anomalies as mockAnomalies, inspectionHistory as mockHistory, allPlants,
  teamMembers as seedTeamMembers, type PlantSummary, type TeamMember,
} from "./mock-data";

const DEFAULT_PLANT_ID = "plant-001"; // matches allPlants[0].id in mock-data.ts
const DEFAULT_INSPECTION_ID = "insp-may-2026";

function mockPlantDTO(id = DEFAULT_PLANT_ID): PlantDTO {
  return {
    id,
    name: mockPlant.name,
    location: mockPlant.location,
    capacityMW: mockPlant.capacityMW,
    totalPanels: mockPlant.totalPanels,
    lastInspection: mockPlant.lastInspection,
    nextInspection: mockPlant.nextInspection,
    healthScore: mockPlant.healthScore,
    dailyLossINR: mockPlant.dailyLossINR,
    dailyLossKWh: mockPlant.dailyLossKWh,
    feedInTariff: mockPlant.feedInTariff,
    lat: 26.4521,
    lng: 73.0192,
    client: null,
  };
}

export function usePlant(id = DEFAULT_PLANT_ID) {
  return useQuery({
    queryKey: ["plant", id],
    queryFn: async () => {
      try {
        return await api.plants.get(id, getToken()!);
      } catch {
        return mockPlantDTO(id);
      }
    },
    enabled: !!getToken(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * DB plant ids the frontend already represents with a richer mock entry.
 * `plant-rajpur-1` is the original seed plant (packages/db/seed.sql) — its
 * survey has since been replaced by plant-001's Blocks 06-122 data, and it's
 * also the placeholder id /api/auth/login hands any login with no plantIds.
 * Listing it would show an empty "Rajpur Solar Plant" beside the real one
 * and move the demo owner onto it.
 */
const SUPERSEDED_PLANT_IDS = new Set(["plant-rajpur-1"]);

function plantDTOToSummary(p: PlantDTO): PlantSummary {
  return {
    id: p.id,
    name: p.name,
    client: p.client || "—",
    location: p.location,
    capacityMW: p.capacityMW,
    totalPanels: p.totalPanels,
    healthScore: p.healthScore,
    lastInspection: p.lastInspection ?? "—",
    nextInspection: p.nextInspection ?? "Not scheduled",
    assignedInspectorId: null,
    criticalCount: 0,
    mediumCount: 0,
    status: "Operational",
    gps: { lat: p.lat, lng: p.lng },
  };
}

/**
 * Every plant in the fleet: the mock-backed plants (which carry the survey
 * data the dashboard and map are built on) plus every plant saved to the
 * database through Control Center's Add Plant, so a plant added there is
 * still listed after a reload — in Control Center, the header picker, the
 * dashboard and the Inspector Portal. Falls back to the mock plants alone
 * when the API is unreachable, same as before.
 */
export function useFleetPlants(): PlantSummary[] {
  const { data } = useQuery({
    queryKey: ["plants", "fleet"],
    queryFn: () => api.plants.list(getToken()!),
    enabled: !!getToken(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  return useMemo(() => {
    if (!data) return allPlants;
    const known = new Set(allPlants.map((p) => p.id));
    const saved = data
      .filter((p) => !known.has(p.id) && !SUPERSEDED_PLANT_IDS.has(p.id))
      .map(plantDTOToSummary);
    return [...allPlants, ...saved];
  }, [data]);
}

/**
 * Every team member: the one seed inspector (which carries the baked-in
 * demo inspection stats) plus every member saved to the database through
 * Control Center's Add Team Member, so an addition, a role edit, or an
 * inspector assignment is still there after a reload — same pattern as
 * useFleetPlants above. Falls back to the seed alone when the API is
 * unreachable.
 */
export function useFleetTeamMembers(): TeamMember[] {
  const { data } = useQuery({
    queryKey: ["teamMembers", "fleet"],
    queryFn: () => api.teamMembers.list(getToken()!),
    enabled: !!getToken(),
    staleTime: 60 * 1000,
    retry: 1,
  });
  return useMemo(() => {
    if (!data) return seedTeamMembers;
    const known = new Set(seedTeamMembers.map((m) => m.id));
    const saved = data.filter((m) => !known.has(m.id));
    return [...seedTeamMembers, ...saved];
  }, [data]);
}

export function useAnomalies(
  plantId = DEFAULT_PLANT_ID,
  inspectionId?: string,
) {
  return useQuery({
    queryKey: ["anomalies", plantId, inspectionId ?? "all"],
    queryFn: async () => {
      // The demo plant's 1,249-defect survey is baked into the frontend and
      // is not a set of rows in the DB, so it's the source of truth for
      // plant-001 whether or not a backend is reachable. Any other plant's
      // defects come from an uploaded survey via the API; an empty list there
      // is a real answer (no survey yet), not a reason to show the demo data.
      if (plantId === DEFAULT_PLANT_ID) return mockAnomalies as AnomalyDTO[];
      try {
        return await api.anomalies.list(plantId, inspectionId, getToken()!);
      } catch {
        return [];
      }
    },
    enabled: !!getToken(),
    retry: 1,
  });
}

export function useAnomaly(id: string) {
  return useQuery({
    queryKey: ["anomaly", id],
    queryFn: async (): Promise<AnomalyDTO | null> => {
      try {
        return await api.anomalies.get(id, getToken()!);
      } catch {
        // Return null instead of throwing so the component can show a
        // friendly "not found" state without triggering React Query's error path.
        return (mockAnomalies.find(a => a.id === id) as AnomalyDTO) ?? null;
      }
    },
    enabled: !!id && !!getToken(),
    retry: 0, // no retries — null result is definitive
  });
}

export function usePatchAnomaly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, rootCause }: { id: string; status?: AnomalyStatusPatch["status"]; rootCause?: string | null }) => {
      try {
        return await api.anomalies.patch(id, { status, rootCause }, getToken()!);
      } catch {
        // API unavailable — apply change locally using cached data
        const cached = queryClient.getQueryData<AnomalyDTO[]>(
          ["anomalies", DEFAULT_PLANT_ID, "all"],
        ) ?? (mockAnomalies as AnomalyDTO[]);
        const found = cached.find(a => a.id === id);
        if (!found) throw new Error("Anomaly not found");
        return { ...found, ...(status !== undefined ? { status } : {}), ...(rootCause !== undefined ? { rootCause } : {}) } as AnomalyDTO;
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["anomaly", updated.id], updated);
      // Update list cache in-place without refetch to preserve local changes
      queryClient.setQueryData<AnomalyDTO[]>(
        ["anomalies", DEFAULT_PLANT_ID, "all"],
        (old = []) => old.map(a => a.id === updated.id ? updated : a),
      );
    },
  });
}

/** Input the inspector submits from the Report New Anomaly form */
export interface NewAnomalyInput {
  plantId: string;
  panelId: string;
  type: string;
  defectType?: string;
  categoryCode?: string;
  deltaT: number | null;
  notes: string;
  inspectorName: string;
  gps: { lat: number; lng: number };
  string?: string;
  inverter?: string;
  stringId?: string;
}

/**
 * Adds a new anomaly to the React Query cache so every subscriber
 * (dashboard, anomalies list, map) sees it immediately without a refetch.
 * Tries the real API first (persists to Supabase + validates the defect
 * taxonomy server-side); falls back to a locally-shaped record if the API
 * is unavailable, same degrade pattern as useCreatePlant/useCreateTeamMember.
 */
export function useAddAnomaly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewAnomalyInput): Promise<AnomalyDTO> => {
      // Derive severity from ΔT
      const severity: AnomalyDTO["severity"] =
        input.deltaT === null     ? "normal"
        : input.deltaT >= 30     ? "critical"
        : input.deltaT >= 15     ? "medium"
        :                          "normal";

      // Parse row/col from panelId e.g. "R14-M07" → row 14, col 7
      const parts = input.panelId.toUpperCase().split("-");
      const row = parseInt(parts[0]?.replace(/\D/g, "") || "0", 10);
      const col = parseInt(parts[1]?.replace(/\D/g, "") || "0", 10);

      const now = new Date();
      const dateStr = now.toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
      });
      const timeStr = now.toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit",
      });

      const rgbNote = input.notes.trim()
        || `Reported by ${input.inspectorName} during field inspection.`;

      try {
        return await api.anomalies.create(
          {
            plantId: input.plantId,
            inspectionId: DEFAULT_INSPECTION_ID,
            panelId: input.panelId,
            row, col,
            type: input.type,
            defectType: input.defectType,
            categoryCode: input.categoryCode,
            deltaT: input.deltaT,
            rgbNote,
            gps: input.gps,
            string: input.string,
            inverter: input.inverter,
            stringId: input.stringId,
          },
          getToken()!,
        );
      } catch {
        // Supabase not reachable/configured — anomaly still appears in this
        // session's caches so the inspector isn't blocked mid-field-visit.
      }

      const newAnomaly: AnomalyDTO = {
        id: `insp-${Date.now()}`,
        inspectionId: DEFAULT_INSPECTION_ID,
        plantId: input.plantId,
        panelId: input.panelId.toUpperCase(),
        row,
        col,
        type: input.type,
        deltaT: input.deltaT,
        deltaTNorm: input.deltaT ? Math.round(input.deltaT * (1000 / 847)) : null,
        severity,
        categoryCode: input.categoryCode ?? null,
        defectType: input.defectType ?? null,
        string: input.string ?? "Inspector Report",
        inverter: input.inverter ?? "—",
        status: "New",
        rootCause: null,
        date: dateStr,
        inspectionTime: timeStr,
        rgbNote,
        gps: input.gps,
        ...(input.deltaT !== null
          ? { peakTemp: 42 + input.deltaT, refTemp: 42 }
          : {}),
      };

      return newAnomaly;
    },

    onSuccess: (newAnomaly) => {
      // Prepend the new anomaly to every anomaly list in the cache,
      // regardless of which plant/inspection the cache key was built for.
      // This covers the default plant view the plant owner sees.
      queryClient.setQueriesData<AnomalyDTO[]>(
        { queryKey: ["anomalies"], exact: false },
        (old) => (old ? [newAnomaly, ...old] : [newAnomaly]),
      );
    },
  });
}

/** Fields collected from the "Add Plant" form in the Control Center */
export interface NewPlantFormInput {
  name: string;
  client: string;
  location: string;
  capacityMW: number;
  totalPanels: number;
  lat: number;
  lng: number;
}

/**
 * Saves a plant through the API and refreshes the fleet list so it shows up
 * everywhere that reads useFleetPlants(). No local fallback: this used to
 * swallow API errors and return an unsaved plant that looked added but was
 * gone on reload. A failure now reaches the form's error toast instead.
 */
export function useCreatePlant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewPlantFormInput): Promise<PlantSummary> => {
      const dto = await api.plants.create(
        {
          name: input.name,
          client: input.client,
          location: input.location,
          capacityMW: input.capacityMW,
          totalPanels: input.totalPanels,
          lat: input.lat,
          lng: input.lng,
        },
        getToken()!,
      );
      // The client name only round-trips once migration 006 has been run;
      // keep what the admin typed for this session's toast either way.
      return { ...plantDTOToSummary(dto), client: dto.client || input.client || "—" };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plants"] }),
  });
}

/** Fields collected from the "Add Team Member" form in the Control Center */
export interface NewTeamMemberFormInput {
  name: string;
  email: string;
  phone: string;
  droneModel: string;
  role: TeamMemberRole;
  currentTask: string;
}

/**
 * Saves a team member through the API and refreshes the fleet query so they
 * show up everywhere that reads useFleetTeamMembers(). No local fallback,
 * same reasoning as useCreatePlant — a silent local-only "success" used to
 * mean the member vanished again on reload with no sign anything was wrong.
 */
export function useCreateTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTeamMemberFormInput) =>
      api.teamMembers.create(
        {
          name: input.name, email: input.email, phone: input.phone, droneModel: input.droneModel,
          role: input.role, currentTask: input.currentTask || undefined,
        },
        getToken()!,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teamMembers"] }),
  });
}

/**
 * Edits an existing team member's role/task/plant assignment. No local
 * fallback (same reasoning as useInviteClient) — the whole point of editing
 * is that the change is real and will still be there on reload.
 */
export function useEditTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string } & EditTeamMemberInput) =>
      api.teamMembers.edit(input.id, input, getToken()!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teamMembers"] }),
  });
}

/**
 * Provisions a real Supabase Auth login for a client, scoped to the plants
 * the admin selects. No local fallback here on purpose — faking a "success"
 * for a real credential would be actively misleading.
 */
export function useInviteClient() {
  return useMutation({
    mutationFn: (input: { name: string; email: string; plantIds: string[] }) =>
      api.admin.inviteClient(input, getToken()!),
  });
}

const EMPTY_LAYOUT: PlantLayout = { blocks: [], inverters: [], strings: [] };

/**
 * Block/Inverter/String hierarchy for cascading dropdowns. Falls back to an
 * empty layout (not mock data) when the API is unavailable or the plant has
 * no layout defined yet — the anomaly form treats an empty layout as "fall
 * back to free-text Panel ID entry" rather than erroring.
 */
export function usePlantLayout(plantId: string) {
  return useQuery({
    queryKey: ["plantLayout", plantId],
    queryFn: async () => {
      try {
        return await api.plantLayout.get(plantId, getToken()!);
      } catch {
        return EMPTY_LAYOUT;
      }
    },
    enabled: !!plantId && !!getToken(),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

export function useGeneratePlantLayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewPlantLayoutInput) => api.plantLayout.generate(input, getToken()!),
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: ["plantLayout", input.plantId] });
    },
  });
}

export function useInspectionHistory() {
  return useQuery({
    queryKey: ["inspectionHistory"],
    queryFn: async () => {
      try {
        const token = getToken()!;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/inspections/history`,
          { headers },
        );
        if (!res.ok) throw new Error("Failed to fetch inspection history");
        return res.json() as Promise<
          Array<{ date: string; critical: number; medium: number; normal: number; panels: number; pilot: string }>
        >;
      } catch {
        return mockHistory;
      }
    },
    enabled: !!getToken(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ─── Survey upload (Control Center) ──────────────────────────────────────────

/** The plant's current uploaded survey, or null (also null before migration
 *  007, and whenever the API is unreachable — the app then falls back to its
 *  built-in mock survey, so a missing row is not an error). */
export function usePlantSurvey(plantId: string) {
  return useQuery({
    queryKey: ["survey", plantId],
    queryFn: async (): Promise<PlantSurvey | null> => {
      try {
        return (await api.survey.get(plantId, getToken()!)).survey;
      } catch {
        return null;
      }
    },
    enabled: !!getToken() && !!plantId,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/** Rows per request to POST /api/survey — well under Vercel's 4.5 MB body
 *  limit even with per-defect footprint rings (~0.5 KB/row). */
const SURVEY_UPLOAD_CHUNK = 300;

export interface SurveyUploadInput {
  plantId: string;
  inspectionDate: string;
  /** Parsed defect rows (src/lib/survey-import.ts parseDefectFile). */
  rows: import("./api").SurveyDefectRow[];
  /** Composited orthomosaic, if the admin included one. */
  overlay?: { blob: Blob; bounds: { west: number; north: number; east: number; south: number } } | null;
  onProgress?: (stage: string, done: number, total: number) => void;
}

/**
 * Persists a parsed survey: defects in chunks (first chunk replaces the same
 * inspection so a re-upload doesn't double up), then the orthomosaic straight
 * to Supabase Storage via a signed URL, then the survey record. Ordering
 * matters — the survey row is written last, so a survey only "exists" once its
 * data is actually in place.
 */
export function useUploadSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SurveyUploadInput): Promise<PlantSurvey> => {
      const token = getToken()!;
      const { plantId, inspectionDate, rows, overlay, onProgress } = input;
      // Stable inspection id for this survey (date-derived, so re-uploading the
      // same day's corrected file replaces it rather than stacking).
      const inspectionId = `survey-${plantId}-${inspectionDate.replace(/\s+/g, "-").toLowerCase()}`;

      for (let i = 0; i < rows.length; i += SURVEY_UPLOAD_CHUNK) {
        const chunk = rows.slice(i, i + SURVEY_UPLOAD_CHUNK);
        await api.survey.importDefects(
          { plantId, inspectionId, inspectionDate, rows: chunk, replace: i === 0 },
          token,
        );
        onProgress?.("defects", Math.min(i + chunk.length, rows.length), rows.length);
      }
      // A survey with no defect rows still clears the previous upload.
      if (rows.length === 0) {
        await api.survey.importDefects({ plantId, inspectionId, inspectionDate, rows: [], replace: true }, token);
      }

      let overlayRec: PlantSurvey["overlay"] = null;
      if (overlay) {
        onProgress?.("overlay", 0, 1);
        const contentType = overlay.blob.type || "image/webp";
        const { signedUrl, publicUrl } = await api.survey.signOverlay({ plantId, inspectionId, contentType }, token);
        // Straight to Supabase Storage — the file never passes through the API
        // function (Vercel caps request bodies at 4.5 MB; an ortho is bigger).
        const put = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: overlay.blob });
        if (!put.ok) throw new Error(`Uploading the orthomosaic failed (${put.status}).`);
        overlayRec = { url: publicUrl, ...overlay.bounds };
        onProgress?.("overlay", 1, 1);
      }

      const { survey } = await api.survey.saveSurvey(
        { plantId, inspectionId, inspectionDate, defectCount: rows.length, overlay: overlayRec },
        token,
      );
      return survey;
    },
    onSuccess: (_survey, input) => {
      queryClient.invalidateQueries({ queryKey: ["survey", input.plantId] });
      queryClient.invalidateQueries({ queryKey: ["anomalies"] });
      queryClient.invalidateQueries({ queryKey: ["plants"] });
    },
  });
}
