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
  position: { x: number; y: number };
  icon: string;
  flavor: string;
  render: {
    width?: number;
    height?: number;
    flavor: string;
  };
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
}

export interface GridMapDefinition extends MapDefinition {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  recommendedPlayers: { min: number; max: number };
  template: string[];
  charToTerritoryId: Record<string, string>;
  territoryIdToChar: Record<string, string>;
  territories: GridTerritoryMetadata[];
  sectors: Sector[];
  seaRoutes: GridSeaRoute[];
  decorations: GridMapDecorations;
}

export const GRID_CANVAS_WIDTH = 76;
export const GRID_CANVAS_HEIGHT = 28;

/**
 * 2D ASCII Grid Map Template for Ironreach.
 * Dimensions: 76 columns wide x 28 rows high.
 *
 * Encoding:
 *   '.' = Open water
 *   'A' = A1 (Highwatch)
 *   'B' = A2 (Whispering Woods)
 *   'C' = A3 (Stoneveil)
 *   'D' = B1 (Sunken Pass)
 *   'E' = B2 (The Marches)
 *   'F' = B3 (Golden Vale)
 *   'G' = C1 (Frostfell)
 *   'H' = C2 (Crown Citadel)
 *   'I' = C3 (Glacier Bay)
 *   'J' = C4 (White Cliff)
 *   'K' = D1 (Ember Coast)
 *   'L' = D2 (Ashmoor)
 *   'M' = D3 (Red Basin)
 *   'N' = D4 (Iron Hollow)
 *   'O' = E1 (Hollowmere)
 *   'P' = E2 (Blackfen)
 *   'Q' = E3 (Duskfall)
 *   'R' = F1 (Mossgate)
 *   'S' = F2 (Verdant Reach)
 *   'T' = F3 (Mist Isle)
 */
export const GRID_TEMPLATE: string[] = [
  "............................................................................", // 0
  "............................................................................", // 1
  ".....AAAAAAA....................DDDDDDDDD...................GGGGGGGG........", // 2
  "...AAAAAAAAAAA.................DDDDDDDDDDD................GGGGGGGGGGG.......", // 3
  "..AAAAAAAAAAAAA...............DDDDDDDDDDDD...............GGGGGGGGGGGGG......", // 4
  "..AAAAAAAAAAAAAA...............DDDDDDDDDDD...............GGGGGGGGGGGG.......", // 5
  "...AAAAAAAAAAAA.................DDDDDDDD..................GGGGGGGGGGG.......", // 6
  "..BBBBBBCCCCCCCC..............EEEEEDDDFFFFFF............HHHHGGGGGGIIII......", // 7
  ".BBBBBBBBCCCCCCCCC...........EEEEEEEEFFFFFFFFF.........HHHHHHHIIIIIIIII.....", // 8
  ".BBBBBBBBCCCCCCCCCC..........EEEEEEEEEFFFFFFFFF.......HHHHHHHHIIIIIIIIII....", // 9
  "..BBBBBBBCCCCCCCCCC..........EEEEEEEEEFFFFFFFFFF......HHHHHHHHIIIIIIIIII....", // 10
  "...BBBBB...CCCCCCCC...........EEEEEEEEEFFFFFFFF........HHHHHHHIIIIIIII......", // 11
  "............CCCCCC.............EEEEEEE...FFFFF.........JJJJJJJJIIIII........", // 12
  "................................EEEEE.................JJJJJJJJJJ............", // 13
  "...KKKKKKK...LLLLLLLL...................................JJJJJJJJ............", // 14
  "..KKKKKKKKKKLLLLLLLLLLL..................................JJJJJJ.............", // 15
  ".KKKKKKKKKKKLLLLLLLLLLLL......OOOOOOOOOO....................................", // 16
  ".KKKKKKKKKKKLLLLLLLLLLLLL....OOOOOOOOOOOO.........RRRRRRRSSSSSSS............", // 17
  "..MMMMMMMMMMLLLLNNNNNNNN....OOOOOOOOOOOOOO.......RRRRRRRRSSSSSSSS...........", // 18
  "..MMMMMMMMMMMNNNNNNNNNNN....OOOOOOOOOOOOOO......RRRRRRRRRSSSSSSSSS..........", // 19
  "..MMMMMMMMMMMNNNNNNNNNNNN..PPPPPPPOOOOOOQQQQQ...RRRRRRRRRSSSSSSSSS..........", // 20
  "...MMMMMMMMM.NNNNNNNNNNNN.PPPPPPPPPPQQQQQQQQQQ...RRRRRRRRSSSSSSSS...........", // 21
  "....MMMMMMM...NNNNNNNNNN..PPPPPPPPPPQQQQQQQQQQ...RRRRRRTTTTTTTTTT...........", // 22
  "...............NNNNNNNN....PPPPPPPP.QQQQQQQQQQ....RRRRTTTTTTTTTTTT..........", // 23
  "................NNNNNN......PPPPPP..QQQQQQQQQ.........TTTTTTTTTTTT..........", // 24
  ".....................................QQQQQQQ...........TTTTTTTTTT...........", // 25
  "............................................................................", // 26
  "............................................................................", // 27
];

export const CHAR_TO_TERRITORY_ID: Record<string, string> = {
  A: "A1",
  B: "A2",
  C: "A3",
  D: "B1",
  E: "B2",
  F: "B3",
  G: "C1",
  H: "C2",
  I: "C3",
  J: "C4",
  K: "D1",
  L: "D2",
  M: "D3",
  N: "D4",
  O: "E1",
  P: "E2",
  Q: "E3",
  R: "F1",
  S: "F2",
  T: "F3",
};

export const TERRITORY_ID_TO_CHAR: Record<string, string> = Object.fromEntries(
  Object.entries(CHAR_TO_TERRITORY_ID).map(([char, id]) => [id, char])
);

export const GRID_SECTORS: Sector[] = [
  {
    id: "nw_green",
    name: "Verdant Fringe",
    bonusReinforcements: 2,
    territoryIds: ["A1", "A2", "A3"],
    colorHex: "#00ff66",
  },
  {
    id: "nc_amber",
    name: "Amber Steppes",
    bonusReinforcements: 2,
    territoryIds: ["B1", "B2", "B3"],
    colorHex: "#ffaa00",
  },
  {
    id: "ne_cyan",
    name: "Northreach",
    bonusReinforcements: 3,
    territoryIds: ["C1", "C2", "C3", "C4"],
    colorHex: "#00d2ff",
  },
  {
    id: "sw_red",
    name: "Crimson Caldera",
    bonusReinforcements: 3,
    territoryIds: ["D1", "D2", "D3", "D4"],
    colorHex: "#ff4444",
  },
  {
    id: "sc_purple",
    name: "The Blackfen",
    bonusReinforcements: 2,
    territoryIds: ["E1", "E2", "E3"],
    colorHex: "#9966ff",
  },
  {
    id: "se_green",
    name: "Emerald Isles",
    bonusReinforcements: 2,
    territoryIds: ["F1", "F2", "F3"],
    colorHex: "#22c55e",
  },
];

export const GRID_TERRITORIES: GridTerritoryMetadata[] = [
  // Cluster A (Northwest / Green)
  {
    id: "A1",
    name: "Highwatch",
    char: "A",
    sectorId: "nw_green",
    regionId: "nw_green",
    regionName: "Verdant Fringe",
    regionBonus: 2,
    regionColor: "#00ff66",
    neighbors: ["A2", "A3"],
    labelPos: { x: 10, y: 4 },
    position: { x: 10, y: 4 },
    icon: "▲",
    flavor: "Windswept towers overlooking the misty western sea and ancient pine forests.",
    render: {
      flavor: "Windswept towers overlooking the misty western sea and ancient pine forests.",
    },
  },
  {
    id: "A2",
    name: "Whispering Woods",
    char: "B",
    sectorId: "nw_green",
    regionId: "nw_green",
    regionName: "Verdant Fringe",
    regionBonus: 2,
    regionColor: "#00ff66",
    neighbors: ["A1", "A3", "D1"],
    labelPos: { x: 5, y: 9 },
    position: { x: 5, y: 9 },
    icon: "▲",
    flavor: "Canopies of ancient moss where the trees remember forgotten kings.",
    render: {
      flavor: "Canopies of ancient moss where the trees remember forgotten kings.",
    },
  },
  {
    id: "A3",
    name: "Stoneveil",
    char: "C",
    sectorId: "nw_green",
    regionId: "nw_green",
    regionName: "Verdant Fringe",
    regionBonus: 2,
    regionColor: "#00ff66",
    neighbors: ["A1", "A2", "B2", "D2"],
    labelPos: { x: 16, y: 9 },
    position: { x: 16, y: 9 },
    icon: "▲",
    flavor: "Limestone ramparts standing sentinel against eastern marauders.",
    render: {
      flavor: "Limestone ramparts standing sentinel against eastern marauders.",
    },
  },

  // Cluster B (North-Center / Amber-Gold)
  {
    id: "B1",
    name: "Sunken Pass",
    char: "D",
    sectorId: "nc_amber",
    regionId: "nc_amber",
    regionName: "Amber Steppes",
    regionBonus: 2,
    regionColor: "#ffaa00",
    neighbors: ["B2", "B3", "C1"],
    labelPos: { x: 34, y: 4 },
    position: { x: 34, y: 4 },
    icon: "▲",
    flavor: "Carved sandstone ravines that channel howling northern gale winds.",
    render: {
      flavor: "Carved sandstone ravines that channel howling northern gale winds.",
    },
  },
  {
    id: "B2",
    name: "The Marches",
    char: "E",
    sectorId: "nc_amber",
    regionId: "nc_amber",
    regionName: "Amber Steppes",
    regionBonus: 2,
    regionColor: "#ffaa00",
    neighbors: ["B1", "B3", "A3", "E1"],
    labelPos: { x: 31, y: 10 },
    position: { x: 31, y: 10 },
    icon: "●",
    flavor: "Rolling gold grasslands fought over in countless seasonal wars.",
    render: {
      flavor: "Rolling gold grasslands fought over in countless seasonal wars.",
    },
  },
  {
    id: "B3",
    name: "Golden Vale",
    char: "F",
    sectorId: "nc_amber",
    regionId: "nc_amber",
    regionName: "Amber Steppes",
    regionBonus: 2,
    regionColor: "#ffaa00",
    neighbors: ["B1", "B2", "C2"],
    labelPos: { x: 41, y: 10 },
    position: { x: 41, y: 10 },
    icon: "♦",
    flavor: "Sun-drenched terraces rich in barley, copper mines, and proud cavalry.",
    render: {
      flavor: "Sun-drenched terraces rich in barley, copper mines, and proud cavalry.",
    },
  },

  // Cluster C (Northeast / Ice Cyan)
  {
    id: "C1",
    name: "Frostfell",
    char: "G",
    sectorId: "ne_cyan",
    regionId: "ne_cyan",
    regionName: "Northreach",
    regionBonus: 3,
    regionColor: "#00d2ff",
    neighbors: ["C2", "C3", "B1"],
    labelPos: { x: 58, y: 4 },
    position: { x: 58, y: 4 },
    icon: "♦",
    flavor: "Frozen tundras swept by unending blizzards under the aurora.",
    render: {
      flavor: "Frozen tundras swept by unending blizzards under the aurora.",
    },
  },
  {
    id: "C2",
    name: "Crown Citadel",
    char: "H",
    sectorId: "ne_cyan",
    regionId: "ne_cyan",
    regionName: "Northreach",
    regionBonus: 3,
    regionColor: "#00d2ff",
    neighbors: ["C1", "C3", "C4", "B3"],
    labelPos: { x: 56, y: 9 },
    position: { x: 56, y: 9 },
    icon: "●",
    flavor: "An impregnable mountain redoubt carved straight out of glacial bedrock.",
    render: {
      flavor: "An impregnable mountain redoubt carved straight out of glacial bedrock.",
    },
  },
  {
    id: "C3",
    name: "Glacier Bay",
    char: "I",
    sectorId: "ne_cyan",
    regionId: "ne_cyan",
    regionName: "Northreach",
    regionBonus: 3,
    regionColor: "#00d2ff",
    neighbors: ["C1", "C2", "C4"],
    labelPos: { x: 64, y: 10 },
    position: { x: 64, y: 10 },
    icon: "■",
    flavor: "Deep sea fjords where ice floes crush unwary longships.",
    render: {
      flavor: "Deep sea fjords where ice floes crush unwary longships.",
    },
  },
  {
    id: "C4",
    name: "White Cliff",
    char: "J",
    sectorId: "ne_cyan",
    regionId: "ne_cyan",
    regionName: "Northreach",
    regionBonus: 3,
    regionColor: "#00d2ff",
    neighbors: ["C2", "C3", "F1"],
    labelPos: { x: 54, y: 13 },
    position: { x: 54, y: 13 },
    icon: "♦",
    flavor: "Sheer chalk precipices dropping hundreds of feet into churning waters.",
    render: {
      flavor: "Sheer chalk precipices dropping hundreds of feet into churning waters.",
    },
  },

  // Cluster D (Southwest / Crimson Red)
  {
    id: "D1",
    name: "Ember Coast",
    char: "K",
    sectorId: "sw_red",
    regionId: "sw_red",
    regionName: "Crimson Caldera",
    regionBonus: 3,
    regionColor: "#ff4444",
    neighbors: ["D2", "D3", "A2"],
    labelPos: { x: 7, y: 16 },
    position: { x: 7, y: 16 },
    icon: "▲",
    flavor: "Black sand shores warmed by subterranean magma vents.",
    render: {
      flavor: "Black sand shores warmed by subterranean magma vents.",
    },
  },
  {
    id: "D2",
    name: "Ashmoor",
    char: "L",
    sectorId: "sw_red",
    regionId: "sw_red",
    regionName: "Crimson Caldera",
    regionBonus: 3,
    regionColor: "#ff4444",
    neighbors: ["D1", "D3", "D4", "A3", "E1"],
    labelPos: { x: 18, y: 16 },
    position: { x: 18, y: 16 },
    icon: "▲",
    flavor: "Smoldering peat bogs blanketed in dense volcanic ash and sulfur.",
    render: {
      flavor: "Smoldering peat bogs blanketed in dense volcanic ash and sulfur.",
    },
  },
  {
    id: "D3",
    name: "Red Basin",
    char: "M",
    sectorId: "sw_red",
    regionId: "sw_red",
    regionName: "Crimson Caldera",
    regionBonus: 3,
    regionColor: "#ff4444",
    neighbors: ["D1", "D2", "D4"],
    labelPos: { x: 7, y: 20 },
    position: { x: 7, y: 20 },
    icon: "▲",
    flavor: "Blood-red clay canyons scarred by centuries of continuous warfare.",
    render: {
      flavor: "Blood-red clay canyons scarred by centuries of continuous warfare.",
    },
  },
  {
    id: "D4",
    name: "Iron Hollow",
    char: "N",
    sectorId: "sw_red",
    regionId: "sw_red",
    regionName: "Crimson Caldera",
    regionBonus: 3,
    regionColor: "#ff4444",
    neighbors: ["D2", "D3"],
    labelPos: { x: 19, y: 21 },
    position: { x: 19, y: 21 },
    icon: "■",
    flavor: "Deep underground foundries that forge the realm's sharpest steel.",
    render: {
      flavor: "Deep underground foundries that forge the realm's sharpest steel.",
    },
  },

  // Cluster E (South-Center / Violet Purple)
  {
    id: "E1",
    name: "Hollowmere",
    char: "O",
    sectorId: "sc_purple",
    regionId: "sc_purple",
    regionName: "The Blackfen",
    regionBonus: 2,
    regionColor: "#9966ff",
    neighbors: ["E2", "E3", "B2", "D2"],
    labelPos: { x: 35, y: 18 },
    position: { x: 35, y: 18 },
    icon: "●",
    flavor: "A sunken caldera lake shrouded in violet mists and ancient ruins.",
    render: {
      flavor: "A sunken caldera lake shrouded in violet mists and ancient ruins.",
    },
  },
  {
    id: "E2",
    name: "Blackfen",
    char: "P",
    sectorId: "sc_purple",
    regionId: "sc_purple",
    regionName: "The Blackfen",
    regionBonus: 2,
    regionColor: "#9966ff",
    neighbors: ["E1", "E3"],
    labelPos: { x: 31, y: 22 },
    position: { x: 31, y: 22 },
    icon: "▲",
    flavor: "Treacherous quickmire where unwary warbands vanish without a trace.",
    render: {
      flavor: "Treacherous quickmire where unwary warbands vanish without a trace.",
    },
  },
  {
    id: "E3",
    name: "Duskfall",
    char: "Q",
    sectorId: "sc_purple",
    regionId: "sc_purple",
    regionName: "The Blackfen",
    regionBonus: 2,
    regionColor: "#9966ff",
    neighbors: ["E1", "E2", "F1"],
    labelPos: { x: 42, y: 22 },
    position: { x: 42, y: 22 },
    icon: "▲",
    flavor: "Gloomy basalt bluffs watching the eastern straits under purple dusk.",
    render: {
      flavor: "Gloomy basalt bluffs watching the eastern straits under purple dusk.",
    },
  },

  // Cluster F (Southeast / Forest Green)
  {
    id: "F1",
    name: "Mossgate",
    char: "R",
    sectorId: "se_green",
    regionId: "se_green",
    regionName: "Emerald Isles",
    regionBonus: 2,
    regionColor: "#22c55e",
    neighbors: ["F2", "F3", "C4", "E3"],
    labelPos: { x: 54, y: 19 },
    position: { x: 54, y: 19 },
    icon: "▲",
    flavor: "An overgrown harbor fort commanding the southern trade channels.",
    render: {
      flavor: "An overgrown harbor fort commanding the southern trade channels.",
    },
  },
  {
    id: "F2",
    name: "Verdant Reach",
    char: "S",
    sectorId: "se_green",
    regionId: "se_green",
    regionName: "Emerald Isles",
    regionBonus: 2,
    regionColor: "#22c55e",
    neighbors: ["F1", "F3"],
    labelPos: { x: 63, y: 19 },
    position: { x: 63, y: 19 },
    icon: "▲",
    flavor: "Lush tropical headlands blessed with fertile soil and gentle trade winds.",
    render: {
      flavor: "Lush tropical headlands blessed with fertile soil and gentle trade winds.",
    },
  },
  {
    id: "F3",
    name: "Mist Isle",
    char: "T",
    sectorId: "se_green",
    regionId: "se_green",
    regionName: "Emerald Isles",
    regionBonus: 2,
    regionColor: "#22c55e",
    neighbors: ["F1", "F2"],
    labelPos: { x: 62, y: 23 },
    position: { x: 62, y: 23 },
    icon: "▲",
    flavor: "An isolated emerald sanctuary veiled by perpetual sea fog.",
    render: {
      flavor: "An isolated emerald sanctuary veiled by perpetual sea fog.",
    },
  },
];

export const GRID_SEA_ROUTES: GridSeaRoute[] = [
  // A3 <-> B2 (Stoneveil to The Marches)
  {
    from: "A3",
    to: "B2",
    path: [
      { x: 18, y: 9 },
      { x: 19, y: 9 },
      { x: 20, y: 9 },
      { x: 21, y: 9 },
      { x: 22, y: 9 },
      { x: 23, y: 9 },
      { x: 24, y: 9 },
      { x: 25, y: 9 },
      { x: 26, y: 9 },
      { x: 27, y: 9 },
      { x: 28, y: 9 },
      { x: 29, y: 9 },
    ],
  },
  // A2 <-> D1 (Whispering Woods to Ember Coast)
  {
    from: "A2",
    to: "D1",
    path: [
      { x: 5, y: 11 },
      { x: 5, y: 12 },
      { x: 5, y: 13 },
      { x: 5, y: 14 },
    ],
  },
  // A3 <-> D2 (Stoneveil to Ashmoor)
  {
    from: "A3",
    to: "D2",
    path: [
      { x: 17, y: 12 },
      { x: 17, y: 13 },
      { x: 17, y: 14 },
    ],
  },
  // B1 <-> C1 (Sunken Pass to Frostfell)
  {
    from: "B1",
    to: "C1",
    path: [
      { x: 41, y: 3 },
      { x: 42, y: 3 },
      { x: 43, y: 3 },
      { x: 44, y: 3 },
      { x: 45, y: 3 },
      { x: 46, y: 3 },
      { x: 47, y: 3 },
      { x: 48, y: 3 },
      { x: 49, y: 3 },
      { x: 50, y: 3 },
      { x: 51, y: 3 },
      { x: 52, y: 3 },
      { x: 53, y: 3 },
      { x: 54, y: 3 },
      { x: 55, y: 3 },
      { x: 56, y: 3 },
      { x: 57, y: 3 },
      { x: 58, y: 3 },
    ],
  },
  // B3 <-> C2 (Golden Vale to Crown Citadel)
  {
    from: "B3",
    to: "C2",
    path: [
      { x: 46, y: 10 },
      { x: 47, y: 10 },
      { x: 48, y: 10 },
      { x: 49, y: 10 },
      { x: 50, y: 10 },
      { x: 51, y: 10 },
      { x: 52, y: 10 },
      { x: 53, y: 10 },
      { x: 54, y: 10 },
    ],
  },
  // B2 <-> E1 (The Marches to Hollowmere)
  {
    from: "B2",
    to: "E1",
    path: [
      { x: 33, y: 13 },
      { x: 33, y: 14 },
      { x: 33, y: 15 },
      { x: 33, y: 16 },
    ],
  },
  // D2 <-> E1 (Ashmoor to Hollowmere)
  {
    from: "D2",
    to: "E1",
    path: [
      { x: 24, y: 17 },
      { x: 25, y: 17 },
      { x: 26, y: 17 },
      { x: 27, y: 17 },
      { x: 28, y: 17 },
      { x: 29, y: 17 },
    ],
  },
  // C4 <-> F1 (White Cliff to Mossgate)
  {
    from: "C4",
    to: "F1",
    path: [
      { x: 57, y: 15 },
      { x: 56, y: 16 },
      { x: 56, y: 17 },
    ],
  },
  // E3 <-> F1 (Duskfall to Mossgate)
  {
    from: "E3",
    to: "F1",
    path: [
      { x: 45, y: 21 },
      { x: 46, y: 21 },
      { x: 47, y: 21 },
      { x: 48, y: 21 },
      { x: 49, y: 21 },
      { x: 50, y: 21 },
    ],
  },
];

export const GRID_DECORATIONS: GridMapDecorations = {
  waves: [
    { x: 21, y: 1, text: "~ ~ ~" },
    { x: 43, y: 2, text: "~ ~ ~" },
    { x: 67, y: 2, text: "~ ~" },
    { x: 67, y: 3, text: "~ ~ ~" },
    { x: 23, y: 14, text: "~ ~ ~" },
    { x: 43, y: 14, text: "~ ~ ~" },
    { x: 46, y: 16, text: "~ ~" },
    { x: 15, y: 26, text: "~ ~ ~" },
    { x: 24, y: 26, text: "~ ~" },
    { x: 23, y: 27, text: "~ ~ ~" },
  ],
  mountains: [
    { x: 6, y: 7, text: "▲▲" },
    { x: 52, y: 11, text: "▲▲" },
    { x: 16, y: 17, text: "▲▲" },
    { x: 28, y: 20, text: "▲" },
    { x: 16, y: 22, text: "▲▲" },
  ],
  trees: [
    { x: 13, y: 3, text: "🌲" },
    { x: 14, y: 10, text: "🌲" },
    { x: 14, y: 13, text: "🌲🌲" },
    { x: 40, y: 6, text: "🌲" },
    { x: 67, y: 14, text: "🌲🌲" },
    { x: 39, y: 17, text: "🌲🌲" },
    { x: 61, y: 17, text: "🌲" },
    { x: 11, y: 24, text: "🌲🌲" },
    { x: 44, y: 24, text: "🌲🌲" },
  ],
  compass: { x: 2, y: 22 },
  scaleBar: { x: 50, y: 26 },
};

export const MAP_GRID_IRONREACH: GridMapDefinition = {
  id: "ironreach",
  name: "The Ironreach",
  description:
    "A fractured feudal realm of 6 continental clusters and coastal sea routes across 20 contested territories.",
  recommendedPlayers: { min: 2, max: 6 },
  width: GRID_CANVAS_WIDTH,
  height: GRID_CANVAS_HEIGHT,
  template: GRID_TEMPLATE,
  charToTerritoryId: CHAR_TO_TERRITORY_ID,
  territoryIdToChar: TERRITORY_ID_TO_CHAR,
  territories: GRID_TERRITORIES,
  sectors: GRID_SECTORS,
  seaRoutes: GRID_SEA_ROUTES,
  decorations: GRID_DECORATIONS,
};

export default MAP_GRID_IRONREACH;
