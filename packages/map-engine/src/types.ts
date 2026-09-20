import type { MapDefinition, TerritoryDefinition } from "@conquest/game-core";
import type { Sector } from "@conquest/protocol";

export interface GridTerritoryMetadata extends TerritoryDefinition {
  id: string;
  name: string;
  char: string;
  sectorId: string;
  regionId: string;
  regionName: string;
  regionBonus: number;
  regionColor: string;
  neighbors: string[];
  labelPos: { x: number; y: number };
  /**
   * Optional authored start cell for the on-map army marker.  When absent the
   * renderer finds an interior run that does not collide with the territory
   * label, so logical maps never need terminal coordinates.
   */
  unitPos?: { x: number; y: number };
  position: { x: number; y: number };
  icon: string;
  displayCode?: string;
  displayLabel?: string;
  flavor: string;
  render: { width?: number; height?: number; flavor: string };
}

export interface GridSeaRoute {
  from: string;
  to: string;
  path: Array<{ x: number; y: number }>;
}

export interface GridMapDecoration {
  x: number;
  y: number;
  text: string;
}

export interface GridMapDecorations {
  waves: GridMapDecoration[];
  mountains: GridMapDecoration[];
  trees: GridMapDecoration[];
  compass: { x: number; y: number };
  scaleBar: { x: number; y: number };
  oceanLabels?: GridMapDecoration[];
}

/** Legacy raster adapter used by the current half-block renderer. */
export interface GridMapDefinition extends MapDefinition {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  recommendedPlayers: { min: number; max: number };
  template: string[];
  microTemplate: string[];
  charToTerritoryId: Record<string, string>;
  territoryIdToChar: Record<string, string>;
  territories: GridTerritoryMetadata[];
  sectors: Sector[];
  seaRoutes: GridSeaRoute[];
  decorations: GridMapDecorations;
}
