import type { MapDefinition } from "@conquest/game-core";
import type { GridMapDefinition } from "./types.js";
import { getGeographyBoundingBox } from "./grid-engine.js";
import { MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE } from "./maps/grid-ironreach.js";
import { EARTH_42_BUNDLE } from "./maps/earth-42.js";
import { MAP_SECTOR_07 } from "./maps/sector-07.js";
import { deriveCoarseTemplateFromMicro } from "./raster.js";

/** Map-authored render key. Maps may provide any number of density steps. */
export type MapRenderProfile = string;

export interface MapRenderVariant {
  profile: MapRenderProfile;
  grid: GridMapDefinition;
}

export interface MapMetadata {
  regionSingular: string;
  regionPlural: string;
  navigationAnchorTerritoryId: string;
  displayCodes: Record<string, string>;
}

export interface MapBundle {
  definition: MapDefinition;
  renderVariants: MapRenderVariant[];
  metadata: MapMetadata;
}

const registry = new Map<string, MapBundle>();
const aliases = new Map<string, string>();

export function registerMap(bundle: MapBundle, mapAliases: string[] = []): void {
  if (registry.has(bundle.definition.id)) throw new Error(`Duplicate map: ${bundle.definition.id}`);
  if (!bundle.renderVariants.length) throw new Error(`Map ${bundle.definition.id} has no render variants`);
  registry.set(bundle.definition.id, bundle);
  for (const alias of mapAliases) aliases.set(alias, bundle.definition.id);
}

export function getMap(id: string): MapBundle | undefined {
  return registry.get(aliases.get(id) ?? id);
}

export function getDefaultMap(): MapBundle {
  return registry.get("earth-42")!;
}

export function listMaps(): MapBundle[] {
  return [...registry.values()];
}

export function getRenderVariant(mapId: string, pane: { width: number; height: number }): MapRenderVariant {
  const bundle = getMap(mapId);
  if (!bundle) throw new Error(`Unknown map: ${mapId}`);
  return selectRenderVariant(bundle, pane);
}

export function selectRenderVariant(bundle: MapBundle, pane: { width: number; height: number }): MapRenderVariant {
  const variants = [...bundle.renderVariants].sort((a, b) => a.grid.width * a.grid.height - b.grid.width * b.grid.height);
  return [...variants].reverse().find(({ grid }) => {
    const land = getGeographyBoundingBox(grid);
    return land.width <= pane.width && land.height <= pane.height;
  }) ?? variants[0];
}

function logicalIronreach(): MapDefinition {
  const grid = MAP_GRID_IRONREACH_WIDE;
  return {
    id: grid.id,
    name: grid.name,
    description: grid.description,
    recommendedPlayers: grid.recommendedPlayers,
    sectors: grid.sectors,
    territories: grid.territories.map(({ id, name, sectorId, neighbors, flavor }) => ({
      id, name, sectorId, neighbors, description: flavor,
    })),
  };
}

registerMap(EARTH_42_BUNDLE);
registerMap({
  definition: logicalIronreach(),
  renderVariants: [
    { profile: "compact", grid: MAP_GRID_IRONREACH_COMPACT },
    { profile: "wide", grid: MAP_GRID_IRONREACH_WIDE },
  ],
  metadata: {
    regionSingular: "Region",
    regionPlural: "Regions",
    navigationAnchorTerritoryId: "C2",
    displayCodes: Object.fromEntries(MAP_GRID_IRONREACH_WIDE.territories.map(t => [t.id, t.id])),
  },
}, ["grid-ironreach", "ironreach-legacy"]);

// Preserve the pre-existing CLI map as a small built-in bundle. Its legacy
// coordinates are translated at registration time; the renderer stays generic.
const sectorSymbols = "ABCDEFGH";
const sectorPositions: Record<string, { x: number; y: number }> = {
  A1: { x: 16, y: 1 }, A2: { x: 3, y: 6 }, A3: { x: 22, y: 6 },
  B1: { x: 38, y: 1 }, B2: { x: 38, y: 7 },
  C1: { x: 10, y: 12 }, C2: { x: 26, y: 12 }, C3: { x: 42, y: 12 },
};
const sectorCharToId = Object.fromEntries(MAP_SECTOR_07.territories.map((t, i) => [sectorSymbols[i], t.id]));
const sectorIdToChar = Object.fromEntries(MAP_SECTOR_07.territories.map((t, i) => [t.id, sectorSymbols[i]]));
const sectorCells = Array.from({ length: 40 }, () => Array.from({ length: 64 }, () => "."));
for (const territory of MAP_SECTOR_07.territories) {
  const char = sectorIdToChar[territory.id];
  const p = sectorPositions[territory.id];
  for (let y = p.y * 2; y < p.y * 2 + 6; y++) for (let x = p.x; x < p.x + 8; x++) sectorCells[y][x] = char;
}
const sectorMicroTemplate = sectorCells.map(row => row.join(""));
const sectorGrid: GridMapDefinition = {
  ...MAP_SECTOR_07,
  width: 64, height: 20,
  microTemplate: sectorMicroTemplate,
  template: deriveCoarseTemplateFromMicro(sectorMicroTemplate),
  charToTerritoryId: sectorCharToId,
  territoryIdToChar: sectorIdToChar,
  territories: MAP_SECTOR_07.territories.map(t => {
    const region = MAP_SECTOR_07.sectors.find(s => s.id === t.sectorId)!;
    return { ...t, char: sectorIdToChar[t.id], position: sectorPositions[t.id], labelPos: sectorPositions[t.id],
      regionId: region.id, regionName: region.name, regionBonus: region.bonusReinforcements,
      regionColor: region.colorHex, icon: "●", flavor: "Network stronghold.", render: { flavor: "Network stronghold." } };
  }),
  seaRoutes: MAP_SECTOR_07.territories.flatMap(t => t.neighbors.filter(id => t.id < id).map(id => ({
    from: t.id, to: id,
    path: [{ x: Math.round((sectorPositions[t.id].x + sectorPositions[id].x) / 2),
      y: Math.round((sectorPositions[t.id].y + sectorPositions[id].y) / 2) }],
  }))),
  decorations: { waves: [], mountains: [], trees: [], compass: { x: 1, y: 1 }, scaleBar: { x: 1, y: 18 } },
};
registerMap({ definition: MAP_SECTOR_07, renderVariants: [{ profile: "compact", grid: sectorGrid }],
  metadata: { regionSingular: "Sector", regionPlural: "Sectors", navigationAnchorTerritoryId: "C2",
    displayCodes: Object.fromEntries(MAP_SECTOR_07.territories.map(t => [t.id, t.id])) } });
