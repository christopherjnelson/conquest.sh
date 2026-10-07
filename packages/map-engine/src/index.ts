import { EARTH_42_BUNDLE } from "./maps/earth-42.js";

export * from "./maps/earth-42.js";
export * from "./grid-engine.js";
export * from "./layout.js";
export * from "./navigation.js";
export * from "./raster.js";
export * from "./registry.js";
export * from "./types.js";

export const DEFAULT_MAP = EARTH_42_BUNDLE.definition;
export const DEFAULT_GRID_MAP = EARTH_42_BUNDLE.renderVariants[0].grid;
export default DEFAULT_MAP;
