import { createContext, useContext, useState, type ReactNode } from "react";
import { allPlants, type PlantSummary } from "./mock-data";

interface PlantContextValue {
  selectedPlantId: string;
  setSelectedPlantId: (id: string) => void;
  selectedPlant: PlantSummary;
}

const PlantContext = createContext<PlantContextValue | null>(null);

export function PlantProvider({ children }: { children: ReactNode }) {
  const [selectedPlantId, setSelectedPlantId] = useState(allPlants[0].id);
  const selectedPlant = allPlants.find(p => p.id === selectedPlantId) ?? allPlants[0];

  return (
    <PlantContext.Provider value={{ selectedPlantId, setSelectedPlantId, selectedPlant }}>
      {children}
    </PlantContext.Provider>
  );
}

export function usePlantContext() {
  const ctx = useContext(PlantContext);
  if (!ctx) throw new Error("usePlantContext must be used inside PlantProvider");
  return ctx;
}
