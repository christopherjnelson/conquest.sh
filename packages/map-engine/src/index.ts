import { MAP_GRID_IRONREACH } from "./maps/grid-ironreach.js";
import { getDefaultMap } from "./registry.js";

export * from "./maps/sector-07.js";
export * from "./maps/grid-ironreach.js";
export * from "./grid-engine.js";
export * from "./layout.js";
export * from "./navigation.js";
export * from "./registry.js";

export {
  MAP_GRID_IRONREACH_COMPACT,
  MAP_GRID_IRONREACH_WIDE,
  getMapForDimensions,
  getMapForTerminalDimensions,
} from "./maps/grid-ironreach.js";
export {
  getTerritoryFillRatio,
  getGeographyBoundingBox,
} from "./grid-engine.js";

// Unified Ironreach map model: MAP_IRONREACH is consolidated onto MAP_GRID_IRONREACH
export const MAP_IRONREACH = MAP_GRID_IRONREACH;
export const DEFAULT_MAP = getDefaultMap().definition;
export const DEFAULT_GRID_MAP = getDefaultMap().renderVariants[0].grid;
export default DEFAULT_MAP;
