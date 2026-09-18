import { MAP_GRID_IRONREACH } from "./maps/grid-ironreach.js";

export * from "./maps/sector-07.js";
export * from "./maps/grid-ironreach.js";
export * from "./grid-engine.js";
export * from "./layout.js";

export {
  MAP_GRID_IRONREACH_COMPACT,
  MAP_GRID_IRONREACH_WIDE,
  getMapForDimensions,
  getMapContentDimensionsForTerminal,
  getMapForTerminalDimensions,
} from "./maps/grid-ironreach.js";
export {
  getTerritoryFillRatio,
  getGeographyBoundingBox,
} from "./grid-engine.js";

// Unified Ironreach map model: MAP_IRONREACH is consolidated onto MAP_GRID_IRONREACH
export const MAP_IRONREACH = MAP_GRID_IRONREACH;
export const DEFAULT_MAP = MAP_GRID_IRONREACH;
export const DEFAULT_GRID_MAP = MAP_GRID_IRONREACH;
export default MAP_GRID_IRONREACH;

