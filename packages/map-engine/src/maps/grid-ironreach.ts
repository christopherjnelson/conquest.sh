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

export const GRID_CANVAS_COMPACT_WIDTH = 104;
export const GRID_CANVAS_COMPACT_HEIGHT = 30;
export const GRID_CANVAS_WIDE_WIDTH = 136;
export const GRID_CANVAS_WIDE_HEIGHT = 36;

export const GRID_CANVAS_WIDTH = GRID_CANVAS_WIDE_WIDTH;
export const GRID_CANVAS_HEIGHT = GRID_CANVAS_WIDE_HEIGHT;

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

/**
 * 2D ASCII Compact Grid Map Template for Ironreach.
 * Dimensions: 104 columns wide x 30 rows high.
 */
export const GRID_TEMPLATE_COMPACT: string[] = [
  ".......BBBBBB........AAAAA................GGGGGG........................................................", // 0
  "......BBBBBBBBB....AAAAAAAAAAGGGGGGGGGGGGGGGGGGGGGGG...IIIIIIIIII.......................................", // 1
  ".....BBBBBBBBBBBAAAAAAAAAAAAAAAAAAGGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIII....................................", // 2
  "....BBBBBBBBBBBBAAAAAAAAAAAAAAAAAAGGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIIII..................................", // 3
  "....BBBBBBBBBBBBAAAAAAAAAAAAAAAAAAGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIIIII..................................", // 4
  "....BBBBBBBBBBBAAAAAAAAAAAAAGGGGGGGGGGGHHHHHHGGGGGIIIIIIIIIIIIIIIIIII...................................", // 5
  ".....BBBBBBBBCCCCCCCCCCCCCCC.HHHHHHHHHHHHHHHHHHHHIIIIIIIIIIIIIIIIIIJJJJJJ...............................", // 6
  "......BBBBBBCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJ...............................", // 7
  "..........CCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJ.............................", // 8
  "...........CCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJJ.............................", // 9
  ".............CCCCCCCCCCCCC...HHHHHHHHHHHHHHHHH...JJJJJJJJJJJJJJJJJJJJJJ.................................", // 10
  "...............CCCCCCCCC........HHHHHHHHHHHHH......JJJJJJJJJJJJJJ.......................................", // 11
  "........................................................................................................", // 12
  "..............DDDDDDDDDDDDDDDDDDDDDDDFFFFFFFFFFFFFFFFFFFFFF...........................SSSSSSSSSSS.......", // 13
  "..............DDDDDDDDDDDEEEEEEEEEEEEEEEEEEFFFFFFFFFFFFFFFFFF..............RRRRRRRRRRSSSSSSSSSSSSSS.....", // 14
  "......KKKKK...DDDDDDDDDDEEEEEEEEEEEEEEEEEEEFFFFFFFFFFFFFFFFFFF...........RRRRRRRRRRRRSSSSSSSSSSSSSSS....", // 15
  ".....KKKKKKKKLLDDDDDDDLLLLLEEEEEEEEEEEEEEEFFFFFFFFFFFFFFFFFF............RRRRRRRRRRRRRSSSSSSSSSSSSSSS....", // 16
  "...KKKKKKKKKKKLLLLLLLLLLLLLLEEEEEEEEEEEEEFFFFFFFFFFFFFFFFF..............RRRRRRRRRRRRSSSSSSSSSSSSSSS.....", // 17
  "...KKKKKKKKKKKLLLLLLLLLLLLLEEEEEEOOOOOOOOOOOOOOOOOOOOOOOOO................RRRRRRRRRRSSSSSSSSSSSSSS......", // 18
  "....KKKKKKKKKKLLLLLLLLLLLLLOOOOOOOOOOOOOOOOOOOOOOOOOOO....................RRRRRRRRRRSSSSSSSSSSSS........", // 19
  ".....KKKKKK...LLLLLLLLLLLLLOOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQQQ............RRRRRRRRRSSSSSSSSSS..........", // 20
  ".....MMMMMMMMMMLLLLLLLLLLLLOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQQQQQ...........RRRRRRRTTTTTTTTTTTTT.........", // 21
  "....MMMMMMMMMMMNNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQQQQQQQ............TTTTTTTTTTTTTTTTTTT........", // 22
  "....MMMMMMMMMMNNNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQQQQQQQQ...........TTTTTTTTTTTTTTTTTTTTT.......", // 23
  ".....MMMMMMMMMNNNNNNNNNNNNOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQQQQQQQQQ.............TTTTTTTTTTTTTTTTTTTT.......", // 24
  ".....MMMMMMMM.NNNNNNNNPPPPPPPPPPPPPPPPPPPPPPPQQQQQQQQQQQQQQQQQQ...............TTTTTTTTTTTTTTTTTT........", // 25
  "....MMMM.......NNNNNNPPPPPPPPPPPPPPPPPPPPPPPPQQQQQQQQQQQQQQQQ...................TTTTTTTTTTTTTT..........", // 26
  "....MM................PPPPPPPPPPPPPPPPPPPPPQQQQQQQQQQQQQQ.........................TTTTTTTTT.............", // 27
  ".........................PPPPPPPPPPPPPPP................................................................", // 28
  "............................PPPPPPPPP...................................................................", // 29
];

/**
 * 2D ASCII Wide Grid Map Template for Ironreach.
 * Dimensions: 136 columns wide x 36 rows high.
 */
export const GRID_TEMPLATE_WIDE: string[] = [
  "..........BBBBBBB...........AAAAAA.....................GGGGGGGG.........................................................................", // 0
  "..........BBBBBBB...........AAAAAA.....................GGGGGGGG.........................................................................", // 1
  "........BBBBBBBBBBBB.....AAAAAAAAAAAAAGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG....IIIIIIIIIIIII...................................................", // 2
  ".......BBBBBBBBBBBBBBAAAAAAAAAAAAAAAAAAAAAAAAGGGGGGGGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIIIIII...............................................", // 3
  "......BBBBBBBBBBBBBBBAAAAAAAAAAAAAAAAAAAAAAAAGGGGGGGGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIIIIIIIII............................................", // 4
  "......BBBBBBBBBBBBBBBAAAAAAAAAAAAAAAAAAAAAAAAGGGGGGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIIIIIIIIIII............................................", // 5
  "......BBBBBBBBBBBBBBAAAAAAAAAAAAAAAAAGGGGGGGGGGGGGGHHHHHHHHGGGGGGGIIIIIIIIIIIIIIIIIIIIIIIII.............................................", // 6
  "......BBBBBBBBBBBBBBAAAAAAAAAAAAAAAAAGGGGGGGGGGGGGGHHHHHHHHGGGGGGGIIIIIIIIIIIIIIIIIIIIIIIII.............................................", // 7
  ".......BBBBBBBBBBCCCCCCCCCCCCCCCCCCCC.HHHHHHHHHHHHHHHHHHHHHHHHHHHIIIIIIIIIIIIIIIIIIIIIIIJJJJJJJJ........................................", // 8
  "........BBBBBBBBCCCCCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ........................................", // 9
  "..............CCCCCCCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ.....................................", // 10
  "...............CCCCCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ.....................................", // 11
  ".................CCCCCCCCCCCCCCCCC....HHHHHHHHHHHHHHHHHHHHHHH....JJJJJJJJJJJJJJJJJJJJJJJJJJJJ...........................................", // 12
  ".................CCCCCCCCCCCCCCCCC....HHHHHHHHHHHHHHHHHHHHHHH....JJJJJJJJJJJJJJJJJJJJJJJJJJJJ...........................................", // 13
  "....................CCCCCCCCCCCC..........HHHHHHHHHHHHHHHHH........JJJJJJJJJJJJJJJJJJ...................................................", // 14
  "..................................DDDD..................................................................................................", // 15
  "...................DDDDDDDDDDDDDDDDDDDDDDDDDDDDDFFFFFFFFFFFFFFFFFFFFFFFFFFFFF..........................................SSSSSSSSSSS......", // 16
  "...................DDDDDDDDDDDDDDD.EEEEEEEEEEEEEEEEEEEEEE.FFFFFFFFFFFFFFFFFFF...........................RRRRRRRRRRRRSSSSSSSSSSSSSSSSSS..", // 17
  "........KKKKKKK....DDDDDDDDDDDDD.EEEEEEEEEEEEEEEEEEEEEEEE.FFFFFFFFFFFFFFFFFFFFFF........................RRRRRRRRRRRRRRRRSSSSSSSSSSSSSSSS", // 18
  ".......KKKKKKKKK...DDDDDDDDDDDDDDEEEEEEEEEEEEEEEEEEEEEEE.FFFFFFFFFFFFFFFFFFFFFF........................RRRRRRRRRRRRRRRRRSSSSSSSSSSSSSSSS", // 19
  "......KKKKKKKKKKKLLLLLLLDDDDDDDDDLLLLLEEEEEEEEEEEEEEEEEE.FFFFFFFFFFFFFFFFFFFFF.........................RRRRRRRRRRRRRRRRRSSSSSSSSSSSSSSSS", // 20
  "....KKKKKKKKKKKKKLLLLLLLLLLLLLLLLLLLLLEEEEEEEEEEEEEEEEEEE.FFFFFFFFFFFFFFFFF............................RRRRRRRRRRRRRRRSSSSSSSSSSSSSSSSSS", // 21
  "....KKKKKKKKKKKLLLLLLLLLLLLLLLLLLLLLLLEEEEEEEEOOOOOOOOOOOOOOOOOO.FFFFFFFFFFFF..........................RRRRRRRRRRRRRRRSSSSSSSSSSSSSSSS..", // 22
  "......KKKKKKKKKKKLLLLLLLLLLLLLLLLLLLLLLEEEEEEOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO..........................RRRRRRRRRRRRRSSSSSSSSSSSSSSSSS...", // 23
  ".......KKKKKKKKKKLLLLLLLLLLLLLLLLLLLLOOOOOOOOOOOOOOOOOOOOOOOOOOOO.QQQQQQQQQQQQQ........................RRRRRRRRRRRSSSSSSSSSSSSSS........", // 24
  ".......KKKKKKKKLLLLLLLLLLLLLLLLLLLLLLOOOOOOOOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQQQ........................RRRRRRRRRRRSSSSSSSSSSSSS.........", // 25
  ".......MMMMMMMMMMMLLLLLLLLLLLLLLNNNNOOOOOOOOOOOOOOOOOOOOOOOOOOO.QQQQQQQQQQQQQQQ........................RRRRRRRRRTTTTTTTTTTTTTTTTT.......", // 26
  "......MMMMMMMMMMMMMMNNNNNNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOOOOO...QQQQQQQQQQQQQQQ..........................TTTTTTTTTTTTTTTTTTTTTTTTT......", // 27
  "......MMMMMMMMMMMMMNNNNNNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOOOOOOO...QQQQQQQQQQQQQQQ........................TTTTTTTTTTTTTTTTTTTTTTTTTTT.....", // 28
  ".......MMMMMMMMMMMMNNNNNNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOOOOO...QQQQQQQQQQQQQQQQQ.........................TTTTTTTTTTTTTTTTTTTTTTTTTT.....", // 29
  ".......MMMMMMMMMM..NNNNNNNNNNNNNNNNPPPPPPPPPPPPPPPPPPPPPPPPPQQQQQQQQQQQQQQQQQQQQ..........................TTTTTTTTTTTTTTTTTTTTTTTT......", // 30
  ".......MMMMMMMMMM..NNNNNNNNNNNNNNN.PPPPPPPPPPPPPPPPPPP.......QQQQQQQQQQQQQQQQQQQ..........................TTTTTTTTTTTTTTTTTTTTTTTT......", // 31
  "......MMMMM.........NNNNNNNNNNNNN...PPPPPPPPPPPPPP............QQQQQQQQQQQQQQQQQ.............................TTTTTTTTTTTTTTTTTT..........", // 32
  "......MM..............NNNNNNNNNN.....PPPPPPPPPPPP...............QQQQQQQQQQQQQ...................................TTTTTTTTTTTT............", // 33
  "........................NNNNN..........PPPPPPPP...................QQQQQQQQ...........................................TTTTTTTTT..........", // 34
  ".........................................PPPP...........................................................................................", // 35
];

export const GRID_TEMPLATE = GRID_TEMPLATE_WIDE;

export const GRID_TERRITORIES_COMPACT: GridTerritoryMetadata[] = [
  // Cluster A (Northwest / Green) - North Continent
  {
    id: "A1",
    name: "Highwatch",
    char: "A",
    sectorId: "nw_green",
    regionId: "nw_green",
    regionName: "Verdant Fringe",
    regionBonus: 2,
    regionColor: "#00ff66",
    neighbors: ["A2", "A3", "C1"],
    labelPos: { x: 24, y: 3 },
    position: { x: 24, y: 3 },
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
    neighbors: ["A1", "A3"],
    labelPos: { x: 9, y: 4 },
    position: { x: 9, y: 4 },
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
    neighbors: ["A1", "A2", "C2", "B1"],
    labelPos: { x: 19, y: 8 },
    position: { x: 19, y: 8 },
    icon: "▲",
    flavor: "Limestone ramparts standing sentinel against eastern marauders.",
    render: {
      flavor: "Limestone ramparts standing sentinel against eastern marauders.",
    },
  },

  // Cluster B (North-Center / Amber-Gold) - Central/South Continent
  {
    id: "B1",
    name: "Sunken Pass",
    char: "D",
    sectorId: "nc_amber",
    regionId: "nc_amber",
    regionName: "Amber Steppes",
    regionBonus: 2,
    regionColor: "#ffaa00",
    neighbors: ["A3", "B2", "B3", "D2"],
    labelPos: { x: 20, y: 14 },
    position: { x: 20, y: 14 },
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
    neighbors: ["B1", "B3", "D2", "E1"],
    labelPos: { x: 34, y: 15 },
    position: { x: 34, y: 15 },
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
    neighbors: ["B1", "B2", "C4", "E1"],
    labelPos: { x: 50, y: 15 },
    position: { x: 50, y: 15 },
    icon: "♦",
    flavor: "Sun-drenched terraces rich in barley, copper mines, and proud cavalry.",
    render: {
      flavor: "Sun-drenched terraces rich in barley, copper mines, and proud cavalry.",
    },
  },

  // Cluster C (Northeast / Ice Cyan) - North Continent
  {
    id: "C1",
    name: "Frostfell",
    char: "G",
    sectorId: "ne_cyan",
    regionId: "ne_cyan",
    regionName: "Northreach",
    regionBonus: 3,
    regionColor: "#00d2ff",
    neighbors: ["A1", "C2", "C3"],
    labelPos: { x: 41, y: 3 },
    position: { x: 41, y: 3 },
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
    neighbors: ["A3", "C1", "C3", "C4"],
    labelPos: { x: 38, y: 8 },
    position: { x: 38, y: 8 },
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
    labelPos: { x: 59, y: 4 },
    position: { x: 59, y: 4 },
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
    neighbors: ["C2", "C3", "B3", "F1"],
    labelPos: { x: 58, y: 9 },
    position: { x: 58, y: 9 },
    icon: "♦",
    flavor: "Sheer chalk precipices dropping hundreds of feet into churning waters.",
    render: {
      flavor: "Sheer chalk precipices dropping hundreds of feet into churning waters.",
    },
  },

  // Cluster D (Southwest / Crimson Red) - Central/South Continent
  {
    id: "D1",
    name: "Ember Coast",
    char: "K",
    sectorId: "sw_red",
    regionId: "sw_red",
    regionName: "Crimson Caldera",
    regionBonus: 3,
    regionColor: "#ff4444",
    neighbors: ["D2", "D3"],
    labelPos: { x: 9, y: 18 },
    position: { x: 9, y: 18 },
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
    neighbors: ["B1", "B2", "D1", "D3", "D4", "E1"],
    labelPos: { x: 20, y: 19 },
    position: { x: 20, y: 19 },
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
    labelPos: { x: 9, y: 23 },
    position: { x: 9, y: 23 },
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
    neighbors: ["D2", "D3", "E1", "E2"],
    labelPos: { x: 20, y: 24 },
    position: { x: 20, y: 24 },
    icon: "■",
    flavor: "Deep underground foundries that forge the realm's sharpest steel.",
    render: {
      flavor: "Deep underground foundries that forge the realm's sharpest steel.",
    },
  },

  // Cluster E (South-Center / Violet Purple) - Central/South Continent
  {
    id: "E1",
    name: "Hollowmere",
    char: "O",
    sectorId: "sc_purple",
    regionId: "sc_purple",
    regionName: "The Blackfen",
    regionBonus: 2,
    regionColor: "#9966ff",
    neighbors: ["B2", "B3", "D2", "D4", "E2", "E3"],
    labelPos: { x: 37, y: 21 },
    position: { x: 37, y: 21 },
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
    neighbors: ["D4", "E1", "E3"],
    labelPos: { x: 32, y: 26 },
    position: { x: 32, y: 26 },
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
    labelPos: { x: 54, y: 24 },
    position: { x: 54, y: 24 },
    icon: "▲",
    flavor: "Gloomy basalt bluffs watching the eastern straits under purple dusk.",
    render: {
      flavor: "Gloomy basalt bluffs watching the eastern straits under purple dusk.",
    },
  },

  // Cluster F (Southeast / Forest Green) - Eastern Archipelago
  {
    id: "F1",
    name: "Mossgate",
    char: "R",
    sectorId: "se_green",
    regionId: "se_green",
    regionName: "Emerald Isles",
    regionBonus: 2,
    regionColor: "#22c55e",
    neighbors: ["C4", "E3", "F2", "F3"],
    labelPos: { x: 78, y: 17 },
    position: { x: 78, y: 17 },
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
    labelPos: { x: 91, y: 16 },
    position: { x: 91, y: 16 },
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
    labelPos: { x: 86, y: 24 },
    position: { x: 86, y: 24 },
    icon: "▲",
    flavor: "An isolated emerald sanctuary veiled by perpetual sea fog.",
    render: {
      flavor: "An isolated emerald sanctuary veiled by perpetual sea fog.",
    },
  },
];

export const GRID_TERRITORIES_WIDE: GridTerritoryMetadata[] = GRID_TERRITORIES_COMPACT.map((t) => {
  const widePositions: Record<string, { x: number; y: number }> = {
    A1: { x: 31, y: 4 },
    A2: { x: 13, y: 5 },
    A3: { x: 25, y: 11 },
    B1: { x: 29, y: 17 },
    B2: { x: 45, y: 19 },
    B3: { x: 67, y: 19 },
    C1: { x: 54, y: 4 },
    C2: { x: 50, y: 10 },
    C3: { x: 78, y: 5 },
    C4: { x: 80, y: 11 },
    D1: { x: 11, y: 22 },
    D2: { x: 26, y: 23 },
    D3: { x: 12, y: 29 },
    D4: { x: 27, y: 30 },
    E1: { x: 50, y: 26 },
    E2: { x: 44, y: 32 },
    E3: { x: 71, y: 29 },
    F1: { x: 110, y: 21 },
    F2: { x: 125, y: 20 },
    F3: { x: 118, y: 30 },
  };
  const pos = widePositions[t.id] ?? t.labelPos;
  return {
    ...t,
    labelPos: { ...pos },
    position: { ...pos },
  };
});

export const GRID_TERRITORIES: GridTerritoryMetadata[] = GRID_TERRITORIES_WIDE;

export const GRID_SEA_ROUTES_COMPACT: GridSeaRoute[] = [
  // A3 <-> B1 (Northern Isthmus strait)
  {
    from: "A3",
    to: "B1",
    path: [
      { x: 19, y: 11 },
      { x: 19, y: 12 },
      { x: 19, y: 13 },
    ],
  },
  // C4 <-> B3 (Eastern Sound strait)
  {
    from: "C4",
    to: "B3",
    path: [
      { x: 55, y: 11 },
      { x: 55, y: 12 },
      { x: 55, y: 13 },
    ],
  },
  // C4 <-> F1 (North Sea crossing)
  {
    from: "C4",
    to: "F1",
    path: [
      { x: 64, y: 10 },
      { x: 66, y: 11 },
      { x: 69, y: 12 },
      { x: 72, y: 13 },
      { x: 75, y: 14 },
    ],
  },
  // E3 <-> F1 (Mist Strait)
  {
    from: "E3",
    to: "F1",
    path: [
      { x: 62, y: 20 },
      { x: 65, y: 20 },
      { x: 69, y: 19 },
      { x: 72, y: 18 },
      { x: 75, y: 18 },
    ],
  },
];

export const GRID_SEA_ROUTES_WIDE: GridSeaRoute[] = [
  // A3 <-> B1 (Northern Isthmus strait)
  {
    from: "A3",
    to: "B1",
    path: [
      { x: 25, y: 14 },
      { x: 25, y: 15 },
      { x: 25, y: 16 },
    ],
  },
  // C4 <-> B3 (Eastern Sound strait)
  {
    from: "C4",
    to: "B3",
    path: [
      { x: 76, y: 14 },
      { x: 75, y: 15 },
      { x: 74, y: 16 },
    ],
  },
  // C4 <-> F1 (North Sea crossing)
  {
    from: "C4",
    to: "F1",
    path: [
      { x: 88, y: 13 },
      { x: 92, y: 14 },
      { x: 96, y: 15 },
      { x: 100, y: 16 },
      { x: 105, y: 17 },
    ],
  },
  // E3 <-> F1 (Mist Strait)
  {
    from: "E3",
    to: "F1",
    path: [
      { x: 78, y: 24 },
      { x: 83, y: 24 },
      { x: 88, y: 23 },
      { x: 94, y: 23 },
      { x: 99, y: 22 },
      { x: 105, y: 22 },
    ],
  },
];

export const GRID_SEA_ROUTES: GridSeaRoute[] = GRID_SEA_ROUTES_WIDE;

export const GRID_DECORATIONS_COMPACT: GridMapDecorations = {
  waves: [
    { x: 3, y: 1, text: "~ ~ ~" },
    { x: 80, y: 2, text: "~ ~ ~" },
    { x: 92, y: 3, text: "~ ~" },
    { x: 75, y: 6, text: "~ ~ ~" },
    { x: 86, y: 7, text: "~ ~" },
    { x: 2, y: 12, text: "~ ~ ~" },
    { x: 68, y: 12, text: "~ ~ ~" },
    { x: 2, y: 15, text: "~ ~ ~" },
    { x: 67, y: 24, text: "~ ~ ~" },
    { x: 10, y: 28, text: "~ ~ ~" },
    { x: 60, y: 28, text: "~ ~ ~" },
    { x: 95, y: 28, text: "~ ~" },
  ],
  mountains: [
    { x: 20, y: 2, text: "▲▲" },
    { x: 34, y: 9, text: "▲▲" },
    { x: 22, y: 9, text: "▲▲" },
    { x: 25, y: 14, text: "▲" },
    { x: 18, y: 25, text: "▲▲" },
  ],
  trees: [
    { x: 10, y: 2, text: "🌲" },
    { x: 7, y: 5, text: "🌲" },
    { x: 46, y: 2, text: "🌲" },
    { x: 30, y: 15, text: "🌲" },
    { x: 55, y: 16, text: "🌲" },
    { x: 42, y: 19, text: "🌲" },
    { x: 90, y: 14, text: "🌲" },
    { x: 88, y: 25, text: "🌲" },
  ],
  compass: { x: 2, y: 22 },
  scaleBar: { x: 50, y: 28 },
};

export const GRID_DECORATIONS_WIDE: GridMapDecorations = {
  waves: [
    { x: 3, y: 1, text: "~ ~ ~" },
    { x: 105, y: 2, text: "~ ~ ~" },
    { x: 120, y: 3, text: "~ ~" },
    { x: 98, y: 6, text: "~ ~ ~" },
    { x: 112, y: 7, text: "~ ~" },
    { x: 2, y: 15, text: "~ ~ ~" },
    { x: 88, y: 16, text: "~ ~ ~" },
    { x: 2, y: 20, text: "~ ~ ~" },
    { x: 88, y: 30, text: "~ ~ ~" },
    { x: 12, y: 34, text: "~ ~ ~" },
    { x: 53, y: 33, text: "~ ~ ~" },
    { x: 128, y: 34, text: "~ ~" },
  ],
  mountains: [
    { x: 26, y: 3, text: "▲▲" },
    { x: 44, y: 11, text: "▲▲" },
    { x: 28, y: 11, text: "▲▲" },
    { x: 28, y: 18, text: "▲" },
    { x: 24, y: 31, text: "▲▲" },
  ],
  trees: [
    { x: 13, y: 3, text: "🌲" },
    { x: 9, y: 6, text: "🌲" },
    { x: 60, y: 3, text: "🌲" },
    { x: 39, y: 19, text: "🌲" },
    { x: 72, y: 20, text: "🌲" },
    { x: 55, y: 24, text: "🌲" },
    { x: 118, y: 18, text: "🌲" },
    { x: 115, y: 31, text: "🌲" },
  ],
  compass: { x: 1, y: 26 },
  scaleBar: { x: 82, y: 34 },
};

export const GRID_DECORATIONS: GridMapDecorations = GRID_DECORATIONS_WIDE;

export const MAP_GRID_IRONREACH_COMPACT: GridMapDefinition = {
  id: "ironreach",
  name: "The Ironreach",
  description:
    "A fractured feudal realm of 2 major continents, 1 archipelago, and coastal sea routes across 20 contested territories.",
  recommendedPlayers: { min: 2, max: 6 },
  width: GRID_CANVAS_COMPACT_WIDTH,
  height: GRID_CANVAS_COMPACT_HEIGHT,
  template: GRID_TEMPLATE_COMPACT,
  charToTerritoryId: CHAR_TO_TERRITORY_ID,
  territoryIdToChar: TERRITORY_ID_TO_CHAR,
  territories: GRID_TERRITORIES_COMPACT,
  sectors: GRID_SECTORS,
  seaRoutes: GRID_SEA_ROUTES_COMPACT,
  decorations: GRID_DECORATIONS_COMPACT,
};

export const MAP_GRID_IRONREACH_WIDE: GridMapDefinition = {
  id: "ironreach",
  name: "The Ironreach",
  description:
    "A fractured feudal realm of 2 major continents, 1 archipelago, and coastal sea routes across 20 contested territories.",
  recommendedPlayers: { min: 2, max: 6 },
  width: GRID_CANVAS_WIDE_WIDTH,
  height: GRID_CANVAS_WIDE_HEIGHT,
  template: GRID_TEMPLATE_WIDE,
  charToTerritoryId: CHAR_TO_TERRITORY_ID,
  territoryIdToChar: TERRITORY_ID_TO_CHAR,
  territories: GRID_TERRITORIES_WIDE,
  sectors: GRID_SECTORS,
  seaRoutes: GRID_SEA_ROUTES_WIDE,
  decorations: GRID_DECORATIONS_WIDE,
};

/**
 * Calculates the available content width and height inside the World Map pane
 * from the total terminal dimensions, taking into account layout chrome
 * (Header: 6 rows, EventLog: 8 rows, Footer: 3 rows, Tactical gap: 1 col, 75% flex width, 1-char borders).
 */
export function getMapContentDimensionsForTerminal(
  terminalCols: number,
  terminalRows: number
): { width: number; height: number } {
  const paneWidth = Math.floor(Math.max(0, terminalCols - 1) * 0.75);
  const paneHeight = Math.max(0, terminalRows - 17);
  return {
    width: Math.max(0, paneWidth - 2),
    height: Math.max(0, paneHeight - 2),
  };
}

/**
 * Returns the appropriate map definition based on available WORLD MAP content dimensions.
 * Returns wide template if contentWidth >= 136 and contentHeight >= 36, otherwise compact template.
 */
export function getMapForDimensions(contentWidth: number, contentHeight: number): GridMapDefinition {
  if (contentWidth >= GRID_CANVAS_WIDE_WIDTH && contentHeight >= GRID_CANVAS_WIDE_HEIGHT) {
    return MAP_GRID_IRONREACH_WIDE;
  }
  return MAP_GRID_IRONREACH_COMPACT;
}

/**
 * Convenience helper that evaluates total terminal dimensions directly to select the canonical map.
 */
export function getMapForTerminalDimensions(
  terminalCols: number,
  terminalRows: number
): GridMapDefinition {
  const { width, height } = getMapContentDimensionsForTerminal(terminalCols, terminalRows);
  return getMapForDimensions(width, height);
}

export const MAP_GRID_IRONREACH: GridMapDefinition = MAP_GRID_IRONREACH_WIDE;
export const MAP_IRONREACH: GridMapDefinition = MAP_GRID_IRONREACH;

export default MAP_GRID_IRONREACH;
