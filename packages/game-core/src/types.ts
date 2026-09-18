import type { Sector, TerritoryState } from "@conquest/protocol";

export interface MapDefinition {
  id: string;
  name: string;
  description: string;
  territories: Omit<TerritoryState, "ownerId" | "units">[];
  sectors: Sector[];
  recommendedPlayers: { min: number; max: number };
}
