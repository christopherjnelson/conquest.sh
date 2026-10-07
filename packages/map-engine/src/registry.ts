import { EARTH_42_BUNDLE } from "./maps/earth-42.js";
import { getGeographyBoundingBox } from "./grid-engine.js";

/** Map-authored render key. Maps may provide any number of density steps. */
export type MapRenderProfile = string;

export interface MapRenderVariant {
  profile: MapRenderProfile;
  grid: import("./types.js").GridMapDefinition;
}

export interface MapMetadata {
  regionSingular: string;
  regionPlural: string;
  navigationAnchorTerritoryId: string;
  displayCodes: Record<string, string>;
}

export interface MapBundle {
  definition: import("@conquest/game-core").MapDefinition;
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

registerMap(EARTH_42_BUNDLE);
