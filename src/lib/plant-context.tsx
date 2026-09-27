import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { allPlants, type PlantSummary } from "./mock-data";
import { getUser, type StoredUser } from "./auth";
import { useFleetPlants } from "./queries";

interface PlantContextValue {
  selectedPlantId: string;
  setSelectedPlantId: (id: string) => void;
  selectedPlant: PlantSummary;
  /** The plants this user may switch between — every plant for team/admin,
   *  only the ones on their login (StoredUser.plantIds) for a plant owner. */
  plants: PlantSummary[];
}

const PlantContext = createContext<PlantContextValue | null>(null);

/**
 * A plant owner only ever sees the plants their login was granted
 * (user_metadata.plantIds, set by Control Center's Invite Client). If none
 * of those ids match a known plant — e.g. the demo owner account, whose
 * login falls back to a placeholder id — they get the first plant, which is
 * exactly what the static header chip showed them before, rather than every
 * plant in the fleet.
 */
function plantsForUser(user: StoredUser | null, fleet: PlantSummary[]): PlantSummary[] {
  if (!user || user.role !== "client") return fleet;
  const mine = fleet.filter((p) => user.plantIds?.includes(p.id));
  return mine.length > 0 ? mine : allPlants.slice(0, 1);
}

export function PlantProvider({ children }: { children: ReactNode }) {
  // Mock plants plus every plant saved through Add Plant — see useFleetPlants.
  const fleet = useFleetPlants();
  const [user] = useState(getUser);
  const plants = useMemo(() => plantsForUser(user, fleet), [user, fleet]);
  const [requestedId, setSelectedPlantId] = useState(plants[0].id);
  // Falls back to the user's own first plant, never allPlants[0] — so an id
  // outside a plant owner's access can't be selected into view. The fleet
  // list can also change under us (it loads after the mock plants render),
  // so the selected id is always read back off the resolved plant.
  const selectedPlant = plants.find((p) => p.id === requestedId) ?? plants[0];

  return (
    <PlantContext.Provider
      value={{ selectedPlantId: selectedPlant.id, setSelectedPlantId, selectedPlant, plants }}
    >
      {children}
    </PlantContext.Provider>
  );
}

export function usePlantContext() {
  const ctx = useContext(PlantContext);
  if (!ctx) throw new Error("usePlantContext must be used inside PlantProvider");
  return ctx;
}
