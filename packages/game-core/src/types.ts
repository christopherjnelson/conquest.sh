import type { Sector, TerritoryRender, TerritoryState } from "@conquest/protocol";

export type TerritoryDefinition = Omit<TerritoryState, "ownerId" | "units" | "position" | "render"> & {
  description?: string;
};

export interface MapDefinition {
  id: string;
  name: string;
  description: string;
  territories: TerritoryDefinition[];
  sectors: Sector[];
  recommendedPlayers: { min: number; max: number };
}
