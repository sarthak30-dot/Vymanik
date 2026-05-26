import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { getToken } from "./auth";
import type { AnomalyStatusPatch, PlantDTO, AnomalyDTO } from "./api";
import { plant as mockPlant, anomalies as mockAnomalies, inspectionHistory as mockHistory } from "./mock-data";

const DEFAULT_PLANT_ID = "plant-rajpur-1";
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
    queryFn: async () => {
      try {
        return await api.anomalies.get(id, getToken()!);
      } catch {
        const found = mockAnomalies.find(a => a.id === id);
        if (!found) throw new Error("Anomaly not found");
        return found as AnomalyDTO;
      }
    },
    enabled: !!id && !!getToken(),
    retry: 1,
  });
}

export function usePatchAnomaly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AnomalyStatusPatch["status"] }) => {
      try {
        return await api.anomalies.patch(id, { status }, getToken()!);
      } catch {
        // API unavailable — apply change locally using cached data
        const cached = queryClient.getQueryData<AnomalyDTO[]>(
          ["anomalies", DEFAULT_PLANT_ID, DEFAULT_INSPECTION_ID],
        ) ?? (mockAnomalies as AnomalyDTO[]);
        const found = cached.find(a => a.id === id);
        if (!found) throw new Error("Anomaly not found");
        return { ...found, status } as AnomalyDTO;
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
  deltaT: number | null;
  notes: string;
  inspectorName: string;
  gps: { lat: number; lng: number };
}

/**
 * Adds a new anomaly to the React Query cache so every subscriber
 * (dashboard, anomalies list, map) sees it immediately without a refetch.
 * When the real API is available, it will POST there first.
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

      const newAnomaly: AnomalyDTO = {
        id: `insp-${Date.now()}`,
        inspectionId: DEFAULT_INSPECTION_ID,
        plantId: input.plantId,
        panelId: input.panelId.toUpperCase(),
        row,
        col,
        type: input.type,
        deltaT: input.deltaT,
        severity,
        string: "Inspector Report",
        inverter: "—",
        status: "New",
        date: dateStr,
        inspectionTime: timeStr,
        rgbNote: input.notes.trim()
          || `Reported by ${input.inspectorName} during field inspection.`,
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
