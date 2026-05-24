import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { getToken } from "./auth";
import type { AnomalyStatusPatch } from "./api";

const DEFAULT_PLANT_ID = "plant-rajpur-1";
const DEFAULT_INSPECTION_ID = "insp-may-2026";

export function usePlant(id = DEFAULT_PLANT_ID) {
  return useQuery({
    queryKey: ["plant", id],
    queryFn: () => api.plants.get(id, getToken()!),
    enabled: !!getToken(),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePlants() {
  return useQuery({
    queryKey: ["plants"],
    queryFn: () => api.plants.list(getToken()!),
    enabled: !!getToken(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAnomalies(
  plantId = DEFAULT_PLANT_ID,
  inspectionId = DEFAULT_INSPECTION_ID,
) {
  return useQuery({
    queryKey: ["anomalies", plantId, inspectionId],
    queryFn: () => api.anomalies.list(plantId, inspectionId, getToken()!),
    enabled: !!getToken(),
  });
}

export function useAnomaly(id: string) {
  return useQuery({
    queryKey: ["anomaly", id],
    queryFn: () => api.anomalies.get(id, getToken()!),
    enabled: !!id && !!getToken(),
  });
}

export function usePatchAnomaly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AnomalyStatusPatch["status"] }) =>
      api.anomalies.patch(id, { status }, getToken()!),
    onSuccess: (updated) => {
      queryClient.setQueryData(["anomaly", updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ["anomalies"] });
    },
  });
}

export function useInspectionHistory() {
  return useQuery({
    queryKey: ["inspectionHistory"],
    queryFn: async () => {
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
    },
    enabled: !!getToken(),
    staleTime: 5 * 60 * 1000,
  });
}
