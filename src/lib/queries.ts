import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { getToken } from "./auth";
import type { AnomalyStatusPatch, PlantDTO, AnomalyDTO, PlantLayout, NewPlantLayoutInput } from "./api";
import { plant as mockPlant, anomalies as mockAnomalies, inspectionHistory as mockHistory } from "./mock-data";

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

export function usePlants() {
  return useQuery({
    queryKey: ["plants"],
    queryFn: async () => {
      try {
        return await api.plants.list(getToken()!);
      } catch {
        return [mockPlantDTO()];
      }
    },
    enabled: !!getToken(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useAnomalies(
  plantId = DEFAULT_PLANT_ID,
  inspectionId = DEFAULT_INSPECTION_ID,
) {
  return useQuery({
    queryKey: ["anomalies", plantId, inspectionId],
    queryFn: async () => {
      try {
        return await api.anomalies.list(plantId, inspectionId, getToken()!);
      } catch {
        return mockAnomalies as AnomalyDTO[];
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
          ["anomalies", DEFAULT_PLANT_ID, DEFAULT_INSPECTION_ID],
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
        ["anomalies", DEFAULT_PLANT_ID, DEFAULT_INSPECTION_ID],
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
 * Creates a plant via the real API when Supabase is configured; either way,
 * returns a fully-shaped fleet-view row (Control Center needs fields like
 * `client` and `status` that don't live in the plants table) so it can be
 * added to the on-screen list immediately.
 */
export function useCreatePlant() {
  return useMutation({
    mutationFn: async (input: NewPlantFormInput) => {
      let id = `plant-${Date.now()}`;
      try {
        const dto = await api.plants.create(
          {
            name: input.name,
            location: input.location,
            capacityMW: input.capacityMW,
            totalPanels: input.totalPanels,
            lat: input.lat,
            lng: input.lng,
          },
          getToken()!,
        );
        id = dto.id;
      } catch {
        // Supabase not reachable/configured in this environment — the plant
        // still appears in this session's Control Center view.
      }

      return {
        id,
        name: input.name,
        client: input.client,
        location: input.location,
        capacityMW: input.capacityMW,
        totalPanels: input.totalPanels,
        healthScore: 100,
        lastInspection: "—",
        nextInspection: "Not scheduled",
        assignedInspectorId: null,
        criticalCount: 0,
        mediumCount: 0,
        status: "Operational" as const,
        gps: { lat: input.lat, lng: input.lng },
      };
    },
  });
}

/** Fields collected from the "Add Team Member" form in the Control Center */
export interface NewTeamMemberFormInput {
  name: string;
  email: string;
  phone: string;
  droneModel: string;
}

export function useCreateTeamMember() {
  return useMutation({
    mutationFn: async (input: NewTeamMemberFormInput) => {
      let id = `tm-${Date.now()}`;
      try {
        const dto = await api.teamMembers.create(
          { name: input.name, email: input.email, phone: input.phone, droneModel: input.droneModel },
          getToken()!,
        );
        id = dto.id;
      } catch {
        // Supabase not reachable/configured — member still shows up locally.
      }

      const initials = input.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0].toUpperCase())
        .join("") || "NA";

      return {
        id,
        name: input.name,
        initials,
        email: input.email,
        phone: input.phone,
        droneModel: input.droneModel || "Not specified",
        certifications: [] as string[],
        assignedPlantId: null,
        status: "Off Duty" as const,
        inspectionsCompleted: 0,
        anomaliesFound: 0,
        lastActive: "Just added",
      };
    },
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
