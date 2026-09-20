import type { MapDefinition } from "@conquest/game-core";
import type { Sector } from "@conquest/protocol";
import type { GridMapDefinition, GridTerritoryMetadata, GridSeaRoute } from "../types.js";
import { deriveCoarseTemplateFromMicro } from "../raster.js";
import type { MapBundle, MapRenderProfile } from "../registry.js";
import { EARTH_RASTERS } from "./generated/earth-rasters.js";

const groups = [
  { id: "na", name: "North America", bonus: 5, color: "#53b87a", territories: [
    ["alaska_range", "Alaska Range", -149, 63, "ALASKA"], ["northwest_canada", "Northwest Canada", -120, 65, "NW CANADA"],
    ["greenland", "Greenland", -42, 72, "GREENLAND"], ["prairie_provinces", "Prairie Provinces", -108, 53, "PRAIRIES"],
    ["great_lakes", "Great Lakes", -83, 48, "GREAT LAKES"], ["st_lawrence", "St. Lawrence", -65, 52, "ST. LAWRENCE"],
    ["pacific_states", "Pacific States", -119, 37, "W. STATES"], ["atlantic_states", "Atlantic States", -80, 35, "E. STATES"],
    ["central_america", "Central America", -90, 17, "C. AMERICA"],
  ] },
  { id: "sa", name: "South America", bonus: 2, color: "#d3a44f", territories: [
    ["caribbean_coast", "Caribbean Coast", -69, 7, "CARIBBEAN"], ["andes", "Andes", -75, -15, "ANDES"],
    ["brazilian_highlands", "Brazilian Highlands", -50, -13, "BRAZIL"], ["southern_cone", "Southern Cone", -65, -40, "S. CONE"],
  ] },
  { id: "eu", name: "Europe", bonus: 5, color: "#55a9d1", territories: [
    ["iceland", "Iceland", -19, 65, "ICELAND"], ["british_isles", "British Isles", -4, 54, "BRITAIN"],
    ["scandinavia", "Scandinavia", 18, 63, "SCANDINAVIA"], ["northern_europe", "Northern Europe", 13, 52, "N. EUROPE"],
    ["western_europe", "Western Europe", -2, 45, "W. EUROPE"], ["mediterranean_europe", "Mediterranean Europe", 16, 41, "S. EUROPE"],
    ["eastern_europe", "Eastern Europe", 32, 52, "E. EUROPE"],
  ] },
  { id: "af", name: "Africa", bonus: 3, color: "#d77b59", territories: [
    ["maghreb", "Maghreb", -5, 29, "MAGHREB"], ["nile_valley", "Nile Valley", 30, 25, "NILE"],
    ["east_africa", "East Africa", 38, -3, "E. AFRICA"], ["congo_basin", "Congo Basin", 20, -5, "CONGO"],
    ["southern_africa", "Southern Africa", 25, -25, "S. AFRICA"], ["madagascar", "Madagascar", 47, -19, "MADAGASCAR"],
  ] },
  { id: "as", name: "Asia", bonus: 7, color: "#ac8bd3", territories: [
    ["urals", "Urals", 58, 58, "URALS"], ["siberia", "Siberia", 88, 62, "SIBERIA"],
    ["yakutia", "Yakutia", 128, 67, "YAKUTIA"], ["kamchatka", "Kamchatka", 159, 56, "KAMCHATKA"],
    ["baikal", "Baikal", 110, 55, "BAIKAL"], ["mongolia", "Mongolia", 105, 47, "MONGOLIA"],
    ["japan", "Japan", 138, 37, "JAPAN"], ["central_asia", "Central Asia", 66, 43, "C. ASIA"],
    ["middle_east", "Middle East", 47, 31, "M. EAST"], ["indian_subcontinent", "Indian Subcontinent", 78, 22, "INDIA"],
    ["indochina", "Indochina", 103, 17, "INDOCHINA"], ["north_china", "North China", 117, 38, "N. CHINA"],
  ] },
  { id: "oc", name: "Oceania", bonus: 2, color: "#4bb4af", territories: [
    ["indonesia", "Indonesia", 116, -4, "INDONESIA"], ["new_guinea", "New Guinea", 144, -6, "N. GUINEA"],
    ["western_australia", "Western Australia", 120, -25, "W. AUSTRALIA"],
    ["eastern_australia", "Eastern Australia", 148, -26, "E. AUSTRALIA"],
  ] },
] as const;

const adjacency: Record<string, string[]> = {
  na_alaska_range: ["na_northwest_canada", "na_prairie_provinces", "as_kamchatka"],
  na_northwest_canada: ["na_alaska_range", "na_prairie_provinces", "na_great_lakes", "na_greenland"],
  na_greenland: ["na_northwest_canada", "na_great_lakes", "na_st_lawrence", "eu_iceland"],
  na_prairie_provinces: ["na_alaska_range", "na_northwest_canada", "na_great_lakes", "na_pacific_states"],
  na_great_lakes: ["na_northwest_canada", "na_greenland", "na_st_lawrence", "na_atlantic_states", "na_pacific_states", "na_prairie_provinces"],
  na_st_lawrence: ["na_great_lakes", "na_greenland", "na_atlantic_states"],
  na_pacific_states: ["na_prairie_provinces", "na_great_lakes", "na_atlantic_states", "na_central_america"],
  na_atlantic_states: ["na_great_lakes", "na_st_lawrence", "na_pacific_states", "na_central_america"],
  na_central_america: ["na_pacific_states", "na_atlantic_states", "sa_caribbean_coast"],
  sa_caribbean_coast: ["na_central_america", "sa_andes", "sa_brazilian_highlands"],
  sa_andes: ["sa_caribbean_coast", "sa_brazilian_highlands", "sa_southern_cone"],
  sa_brazilian_highlands: ["sa_caribbean_coast", "sa_andes", "sa_southern_cone", "af_maghreb"],
  sa_southern_cone: ["sa_andes", "sa_brazilian_highlands"],
  eu_iceland: ["na_greenland", "eu_british_isles", "eu_scandinavia"],
  eu_british_isles: ["eu_iceland", "eu_scandinavia", "eu_northern_europe", "eu_western_europe"],
  eu_scandinavia: ["eu_iceland", "eu_british_isles", "eu_northern_europe", "eu_eastern_europe"],
  eu_northern_europe: ["eu_british_isles", "eu_scandinavia", "eu_eastern_europe", "eu_mediterranean_europe", "eu_western_europe"],
  eu_western_europe: ["eu_british_isles", "eu_northern_europe", "eu_mediterranean_europe", "af_maghreb"],
  eu_mediterranean_europe: ["eu_western_europe", "eu_northern_europe", "eu_eastern_europe", "as_middle_east", "af_nile_valley", "af_maghreb"],
  eu_eastern_europe: ["eu_scandinavia", "eu_northern_europe", "eu_mediterranean_europe", "as_middle_east", "as_central_asia", "as_urals"],
  af_maghreb: ["sa_brazilian_highlands", "eu_western_europe", "eu_mediterranean_europe", "af_nile_valley", "af_east_africa", "af_congo_basin"],
  af_nile_valley: ["af_maghreb", "eu_mediterranean_europe", "as_middle_east", "af_east_africa"],
  af_east_africa: ["af_nile_valley", "af_maghreb", "af_congo_basin", "af_southern_africa", "af_madagascar", "as_middle_east"],
  af_congo_basin: ["af_maghreb", "af_east_africa", "af_southern_africa"],
  af_southern_africa: ["af_congo_basin", "af_east_africa", "af_madagascar"],
  af_madagascar: ["af_southern_africa", "af_east_africa"],
  as_urals: ["eu_eastern_europe", "as_central_asia", "as_north_china", "as_siberia"],
  as_siberia: ["as_urals", "as_north_china", "as_mongolia", "as_baikal", "as_yakutia"],
  as_yakutia: ["as_siberia", "as_baikal", "as_kamchatka"],
  as_kamchatka: ["as_yakutia", "as_baikal", "as_mongolia", "as_japan", "na_alaska_range"],
  as_baikal: ["as_siberia", "as_yakutia", "as_kamchatka", "as_mongolia"],
  as_mongolia: ["as_siberia", "as_baikal", "as_kamchatka", "as_japan", "as_north_china"],
  as_japan: ["as_kamchatka", "as_mongolia"],
  as_central_asia: ["eu_eastern_europe", "as_urals", "as_north_china", "as_indian_subcontinent", "as_middle_east"],
  as_middle_east: ["eu_eastern_europe", "as_central_asia", "as_indian_subcontinent", "af_east_africa", "af_nile_valley", "eu_mediterranean_europe"],
  as_indian_subcontinent: ["as_middle_east", "as_central_asia", "as_north_china", "as_indochina"],
  as_indochina: ["as_indian_subcontinent", "as_north_china", "oc_indonesia"],
  as_north_china: ["as_urals", "as_siberia", "as_mongolia", "as_indochina", "as_indian_subcontinent", "as_central_asia"],
  oc_indonesia: ["as_indochina", "oc_new_guinea", "oc_western_australia"],
  oc_new_guinea: ["oc_indonesia", "oc_western_australia", "oc_eastern_australia"],
  oc_western_australia: ["oc_indonesia", "oc_new_guinea", "oc_eastern_australia"],
  oc_eastern_australia: ["oc_western_australia", "oc_new_guinea"],
};

const descriptions: Record<string, string> = {
  na_alaska_range: "Northwestern mountains facing the Bering Strait.",
  na_northwest_canada: "Northern forests between Alaska and Hudson Bay.",
  na_greenland: "Arctic island linking North America and Iceland.",
  na_prairie_provinces: "Open plains across central Canada.",
  na_great_lakes: "Inland lakes and industrial heartland.",
  na_st_lawrence: "Eastern Canadian corridor to the Atlantic.",
  na_pacific_states: "Western coast and inland mountain passes.",
  na_atlantic_states: "Eastern seaboard of North America.",
  na_central_america: "Narrow land bridge to South America.",
  sa_caribbean_coast: "Northern South American coast and river gateways.",
  sa_andes: "Mountain spine along the Pacific coast.",
  sa_brazilian_highlands: "Eastern uplands reaching toward the Atlantic.",
  sa_southern_cone: "Temperate southern plains and Patagonian coast.",
  eu_iceland: "North Atlantic island between Greenland and Europe.",
  eu_british_isles: "Atlantic islands off the European coast.",
  eu_scandinavia: "Northern peninsula of fjords and forests.",
  eu_northern_europe: "Central plains linking western and eastern Europe.",
  eu_western_europe: "Atlantic-facing heartland of the continent.",
  eu_mediterranean_europe: "Southern peninsulas and Mediterranean shores.",
  eu_eastern_europe: "Eastern plains opening toward the Urals.",
  af_maghreb: "Northwest African coast and Saharan approaches.",
  af_nile_valley: "Northeast African corridor along the Nile.",
  af_east_africa: "Eastern highlands facing the Indian Ocean.",
  af_congo_basin: "Central rainforest and river basin.",
  af_southern_africa: "Southern plateau between two oceans.",
  af_madagascar: "Large island off Africa's southeast coast.",
  as_urals: "Mountain gateway between Europe and Siberia.",
  as_siberia: "Broad northern Asian forests and plains.",
  as_yakutia: "Remote northeast Asian interior.",
  as_kamchatka: "Pacific peninsula facing Alaska and Japan.",
  as_baikal: "Interior highlands around Lake Baikal.",
  as_mongolia: "Steppe between Siberia and North China.",
  as_japan: "Pacific island chain east of Asia.",
  as_central_asia: "Interior crossroads of steppe and desert.",
  as_middle_east: "Western Asian passage between three continents.",
  as_indian_subcontinent: "South Asian peninsula and its northern plains.",
  as_indochina: "Southeast Asian mainland reaching the islands.",
  as_north_china: "Northern Chinese plains and neighboring uplands.",
  oc_indonesia: "Equatorial islands between Asia and Australia.",
  oc_new_guinea: "Mountainous island north of Australia.",
  oc_western_australia: "Dry western half of the Australian landmass.",
  oc_eastern_australia: "Eastern Australian coast and interior.",
};

export const EARTH_42_SECTORS: Sector[] = groups.map(g => ({
  id: g.id, name: g.name, bonusReinforcements: g.bonus,
  colorHex: g.color, territoryIds: g.territories.map(t => `${g.id}_${t[0]}`),
}));

const records = groups.flatMap(g => g.territories.map((t, index) => ({
  id: `${g.id}_${t[0]}`, name: t[1], sectorId: g.id, longitude: t[2], latitude: t[3],
  label: t[4], code: `${g.id.toUpperCase()}${index + 1}`,
  neighbors: adjacency[`${g.id}_${t[0]}`],
  regionName: g.name, regionBonus: g.bonus, regionColor: g.color,
})));

export const EARTH_42: MapDefinition = {
  id: "earth-42", name: "Earth — Global Front",
  description: "A terminal world map spanning six continents and 42 strategic territories.",
  recommendedPlayers: { min: 2, max: 6 }, sectors: EARTH_42_SECTORS,
  territories: records.map(t => ({ id: t.id, name: t.name, sectorId: t.sectorId,
    neighbors: t.neighbors, description: descriptions[t.id] })),
};

const symbols = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!$%&*+=?@^~";
const charToTerritoryId = Object.fromEntries(records.map((t, i) => [symbols[i], t.id]));
const territoryIdToChar = Object.fromEntries(records.map((t, i) => [t.id, symbols[i]]));

// Short labels are authored for this profile, rather than abbreviated by the renderer.
const compactLabels: Record<string, string> = {
  na_alaska_range: "ALASKA", na_northwest_canada: "NW CAN.", na_greenland: "GREENLAND",
  na_prairie_provinces: "PRAIRIES", na_great_lakes: "LAKES", na_st_lawrence: "ST. LAW.",
  na_pacific_states: "W. STATES", na_atlantic_states: "E. STATES", na_central_america: "C. AMER.",
  sa_caribbean_coast: "CARIB.", sa_andes: "ANDES", sa_brazilian_highlands: "BRAZIL", sa_southern_cone: "S. CONE",
  eu_iceland: "ICELAND", eu_british_isles: "BRITAIN", eu_scandinavia: "SCAND.",
  eu_northern_europe: "N. EUROPE", eu_western_europe: "W. EUROPE",
  eu_mediterranean_europe: "S. EUROPE", eu_eastern_europe: "E. EUROPE",
  af_maghreb: "MAGHREB", af_nile_valley: "NILE", af_east_africa: "E. AFRICA",
  af_congo_basin: "CONGO", af_southern_africa: "S. AFRICA", af_madagascar: "MADAG.",
  as_urals: "URALS", as_siberia: "SIBERIA", as_yakutia: "YAKUTIA", as_kamchatka: "KAMCHATKA",
  as_baikal: "BAIKAL", as_mongolia: "MONGOLIA", as_japan: "JAPAN",
  as_central_asia: "C. ASIA", as_middle_east: "M. EAST", as_indian_subcontinent: "INDIA",
  as_indochina: "INDOCHINA", as_north_china: "N. CHINA",
  oc_indonesia: "INDONESIA", oc_new_guinea: "N. GUINEA",
  oc_western_australia: "W. AUST.", oc_eastern_australia: "E. AUST.",
};
const wideLabels: Record<string, string> = {
  na_northwest_canada: "NORTHWEST CANADA", na_central_america: "CENTRAL AMERICA",
  sa_brazilian_highlands: "BRAZILIAN HIGHLANDS", eu_mediterranean_europe: "MEDITERRANEAN EUROPE",
  as_indian_subcontinent: "INDIAN SUBCONTINENT", oc_western_australia: "WESTERN AUSTRALIA",
  oc_eastern_australia: "EASTERN AUSTRALIA",
};

const emphasizedSeaLinks = new Set([
  "as_kamchatka|na_alaska_range", "eu_iceland|na_greenland",
  "af_maghreb|sa_brazilian_highlands", "af_maghreb|eu_western_europe",
  "af_maghreb|eu_mediterranean_europe", "af_nile_valley|eu_mediterranean_europe",
  "af_east_africa|as_middle_east", "as_japan|as_kamchatka",
  "as_japan|as_mongolia", "as_indochina|oc_indonesia",
  "af_east_africa|af_madagascar", "af_madagascar|af_southern_africa",
  "oc_indonesia|oc_new_guinea", "oc_indonesia|oc_western_australia",
  "oc_new_guinea|oc_eastern_australia", "oc_new_guinea|oc_western_australia",
]);

function routeAcrossWater(a: { x: number; y: number }, b: { x: number; y: number }, raster: string[]): Array<{ x: number; y: number }> {
  const count = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const path: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= count; i++) {
    const x = Math.round(a.x + (b.x - a.x) * i / Math.max(1, count));
    const y = Math.round(a.y + (b.y - a.y) * i / Math.max(1, count));
    if (raster[y * 2]?.[x] === "." && raster[y * 2 + 1]?.[x] === "." &&
      !path.some(p => p.x === x && p.y === y)) path.push({ x, y });
  }
  return path;
}

function nearestWaterPoint(x: number, y: number, raster: string[]): { x: number; y: number } {
  const width = raster[0].length;
  const height = raster.length / 2;
  for (let radius = 0; radius <= 10; radius++) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.abs(dx) + Math.abs(dy) !== radius) continue;
      const px = x + dx;
      const py = y + dy;
      if (px >= 0 && px < width && py >= 0 && py < height &&
        raster[py * 2][px] === "." && raster[py * 2 + 1][px] === ".") return { x: px, y: py };
    }
  }
  return { x, y };
}

function createVariant(profile: MapRenderProfile): GridMapDefinition {
  const raster = EARTH_RASTERS[profile];
  const width = raster[0].length;
  const height = raster.length / 2;
  const territories: GridTerritoryMetadata[] = records.map(t => {
    const char = territoryIdToChar[t.id];
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < raster.length; y++) for (let x = 0; x < width; x++) {
      if (raster[y][x] === char) cells.push({ x, y: Math.floor(y / 2) });
    }
    const mid = cells[Math.floor(cells.length / 2)] ?? { x: 0, y: 0 };
    const targetX = Math.round((t.longitude + 180) / 360 * (width - 1));
    const targetY = Math.round((82 - t.latitude) / 142 * (height - 1));
    const anchor = [...cells].sort((a, b) =>
      (Math.abs(a.x - targetX) + Math.abs(a.y - targetY)) - (Math.abs(b.x - targetX) + Math.abs(b.y - targetY)))[0] ?? mid;
    return { id: t.id, name: t.name, char, sectorId: t.sectorId, regionId: t.sectorId,
      regionName: t.regionName, regionBonus: t.regionBonus, regionColor: t.regionColor,
      neighbors: t.neighbors, labelPos: anchor, position: anchor, icon: "●",
      flavor: descriptions[t.id], render: { flavor: descriptions[t.id] },
      displayCode: t.code,
      displayLabel: profile.startsWith("compact") ? compactLabels[t.id] : profile === "wide" ? wideLabels[t.id] ?? t.label : t.label,
    };
  });
  const routes: GridSeaRoute[] = [];
  // All non-contact links are explicitly represented by a route. Short island and
  // strait routes are drawn at their midpoint; the Pacific wrap is an edge route.
  for (const t of territories) for (const id of t.neighbors) {
    if (t.id >= id) continue;
    const other = territories.find(v => v.id === id)!;
    let touching = false;
    for (let y = 0; y < raster.length && !touching; y++) for (let x = 0; x < width && !touching; x++) {
      if (raster[y][x] !== t.char) continue;
      if (raster[y]?.[x + 1] === other.char || raster[y]?.[x - 1] === other.char || raster[y + 1]?.[x] === other.char || raster[y - 1]?.[x] === other.char) touching = true;
    }
    const pair = [t.id, id].sort().join("|");
    if (!touching || emphasizedSeaLinks.has(pair)) {
      const wrap = pair === "as_kamchatka|na_alaska_range";
      const x = Math.round((t.labelPos.x + other.labelPos.x) / 2);
      const y = Math.round((t.labelPos.y + other.labelPos.y) / 2);
      const fullPath = wrap
        ? [{ x: 0, y: t.labelPos.y }, { x: width - 1, y: other.labelPos.y }]
        : routeAcrossWater(t.labelPos, other.labelPos, raster);
      const path = emphasizedSeaLinks.has(pair) && fullPath.length > 0 ? fullPath : [nearestWaterPoint(x, y, raster)];
      routes.push({ from: t.id, to: id, path });
    }
  }
  return { ...EARTH_42, width, height, template: deriveCoarseTemplateFromMicro(raster), microTemplate: raster,
    charToTerritoryId, territoryIdToChar, territories, seaRoutes: routes,
    decorations: { waves: [], mountains: [], trees: [], compass: { x: 1, y: 1 }, scaleBar: { x: 1, y: height - 2 }, oceanLabels: [] },
  };
}

export const EARTH_42_BUNDLE: MapBundle = {
  definition: EARTH_42,
  renderVariants: ["compact", "compact-tall", "standard", "wide", "large", "ultra"].map(profile => ({ profile, grid: createVariant(profile) })),
  metadata: { regionSingular: "Continent", regionPlural: "Continents", navigationAnchorTerritoryId: "eu_northern_europe",
    displayCodes: Object.fromEntries(records.map(t => [t.id, t.code])) },
};
