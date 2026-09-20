
import type { GridMapDefinition, GridTerritoryMetadata, GridSeaRoute, GridMapDecoration, GridMapDecorations } from "../types.js";
import type { Sector } from "@conquest/protocol";
import { deriveCoarseTemplateFromMicro } from "../raster.js";
import { getMapContentDimensionsForTerminal } from "../layout.js";
export { deriveCoarseTemplateFromMicro } from "../raster.js";
export type { GridMapDefinition, GridTerritoryMetadata, GridSeaRoute, GridMapDecoration, GridMapDecorations } from "../types.js";

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
 * Derives a legacy coarse 2D character template (height/2) from the canonical microcell raster.
 */
export const MICRO_TEMPLATE_COMPACT: string[] = [
  ".........BBB..........AAA...................GG..........................................................", // 0
  ".......BBBBBBB......AAAAAAA...............GGGGGG........................................................", // 1
  ".........BBBBB......AAAAAAAAAGGGGG......GGG.....GG........IIIIII........................................", // 2
  "......BBBBBBBBBA..AAAAAAAAAAAAAGGGG.GGGGGG.........G..GIIIIIIIIIII......................................", // 3
  "........BBBBBBBBAAAAAAAAAAAAAAA..GGGGGGGGGGG........GGIIIIIIIIIIIII.....................................", // 4
  "....BBBBBBBBBBBBBAAAAAAAAAAAAAAA..GGGGGGGGGGGG.......IIIIIIIIIIIIIIII...................................", // 5
  ".....BBBBBBBBBBBBAAAAAAAAAAAAAAAA..GGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIIII...................................", // 6
  "....BBBBBBBBBBBBAAAAAAAAAAAAAAAAAGGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIIIII..................................", // 7
  "....BBBBBBBBBBBAAAAAAAAAAAAAAAA..GGGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIIII..................................", // 8
  "....BBBBBBBBBBAAAAAAAAAAAAAAAA..GGGGGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIII..................................", // 9
  "....BBBBBBBBBAAAAAAAAAAAAAA..GGGGGGGGGGHHHHHHGGGGGGGGGGIIIIIIIIIIIIIII..................................", // 10
  ".....BBBBBBBBAAAAAAAAAAAAAA..GGGGGGGGGGHHHHHHGGGGGIIIIIIIIIIIIIIIIIII...................................", // 11
  "....BBBBBBBBBCCCCCCCCCCCCCCC.HHHHHHHHHHHHHHHHHHHHIIIIIIIIIIIIIIIIIIJJJJJ................................", // 12
  "......BBBBBBBCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHIIIIIIIIIIIIIIIIIIJJJJJJ...............................", // 13
  ".....BBBBBBBCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJ...............................", // 14
  ".......BBBBBCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJ..............................", // 15
  "..........CCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJ..............................", // 16
  "..........CCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJJ.............................", // 17
  "..........CCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJ.............................", // 18
  "............CCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJ..............................", // 19
  "............CCCCCCCCCCCCCCC.HHHHHHHHHHHHHHHHHHH.JJJJJJJJJJJJJJJJJJJJJJJJ................................", // 20
  "..............CCCCCCCCCCC.....HHHHHHHHHHHHHHH.....JJJJJJJJJJJJJJJJJJJJJ.................................", // 21
  "..............CCCCCCCCCCC......HHHHHHHHHHHHHHH....JJJJJJJJJJJJJJJJ......................................", // 22
  "................CCCCCCC..........HHHHHHHHHHH........JJJJJJJJJJJJ........................................", // 23
  "........................................................................................................", // 24
  "........................................................................................................", // 25
  "...................DDDDDDD...DDDDDDDDDDF.....FFFFF...FFFFFFFF.........................SSSSSSSSS.........", // 26
  "...................DDDDD.....EEEEEEEEEEEEEEEEEFFF.....FFFFFFFF.........................SSSSSSSSSSSSS....", // 27
  "..............DDDDDDDDDDDDDEEEEEEEEEEEEEEEEEEFFFFFFFFFFFFFFF................RRRRRRRRRSSSSSSSSSSSSS......", // 28
  "..............DDDDDDDDDDDDDDEEEEEEEEEEEEEEEEEEFFFFFFFFFFFFFFFF............RRRRRRRRRRSSSSSSSSSSSSSSSS....", // 29
  ".......KKK....DDDDDDDDDDDDDDEEEEEEEEEEEEEEEEEEFFFFFFFFFFFFFFFF............RRRRRRRRRSSSSSSSS.............", // 30
  ".....KKKKKKL..DDDDDDDDDDDDDEEEEEEEEEEEEEEEEEEFFFFFFFFFFFFFFFFF..........RRRRRRRRRRSSSSSSSSSS............", // 31
  "......KKKKKKLLLDDDDDDDLLLLLEEEEEEEEEEEEEEEEEFFFFFFFFFFFFFFFFF............RRRRRRRRSSSSSSSSSSSSSSSSS......", // 32
  "....KKKKKKKKKLLDDDDDDDLLLLLEEEEEEEEEEEEEEEEFFFFFFFFFFFFFFFFF............RRRRRRRRSSSSSSSSSSSSSSSSSSS.....", // 33
  "....KKKKKKKKKLLLLLLLLLLLLLLLEEEEEEEEEOOOOFFFFFFFFFFFFFFFFFF.............RRRRRRRSSSSSSSSSSSSSSSSSSS......", // 34
  "...KKKKKKKKKLLLLLLLLLLLLLLLLEEEEEEEEOOOOOFFFFFFFFFFFFFFFFF...............RRRRRRRRRRRSSSSSSSSSSSSSSS.....", // 35
  "...KKKKKKKKLLLLLLLLLLLLLL..EEEEEEEEOOOOOOOOOOOOOOO.......................RRRRRRRRRRRSSSSSSSSSSSSSSS.....", // 36
  "....KKKKKKLLLLLLLLLLLLLLLLLEEEEEEEOOOOOOOOOOOOOOOOOOOOOOOO................RRRRRRRRRRSSSSSSSSSSSSS.......", // 37
  "...KKKKKKLLLLLLLLLLLLLLL...OOOEEEOOOOOOOOOOOOOOO..........................RRRRRRRRRRSSSSSSSSSSSSS.......", // 38
  ".....KKKLLLLLLLLLLLLLLLLLLLOOOOOOOOOOOOOOOOOOOOOOOOOOO...................RRRRRRRRRRSSSSSSSSSSS..........", // 39
  "....KKKKKKKK..LLLLLLLLL....OOOOOOOOOOOOOOOOOOOOOOOOOO..................RRRRRRRRRRRRRSSSSSSSSSSS.........", // 40
  ".....KKKKKK...LLLLLLLLLLLLLOOOOOOOOOOOOOOOOOOOOOOOOOQQQQQQQQ........RRRRRRRRRRRRRRRRSSSSSSSSSS..........", // 41
  ".....MMMMMMMMMMLLLLLLL.....OOOOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQ.......RRRRRRRRRRRRRTTTTTTT..............", // 42
  "....MMMMMMMMMMMLLLLLLLLLLLLOOOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQQQQQ.......RRRRRRRRRTTTTTTTT..............", // 43
  ".....MMMMMMMMMMMMNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQQQQ.............TTTTTTTTTTTTTT.............", // 44
  "....MMMMMMMMMMMMMMNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQQ..............TTTTTTTTTTTTTT..............", // 45
  "....MMMMMMMMMMMMMNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQ................TTTTTTTTTTTTTTTTTTTT........", // 46
  ".....MMMMMMMMMMMNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQ..................TTTTTTTTTTTTTTTTTTTTT.......", // 47
  "....MMMMMMMMMMMNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQ.................TTTTTTTTTTTTTTTTTTTTT.........", // 48
  ".....MMMMMMMMMMNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOPQQQQQQQQQ......................TTTTTTTTTTTTTTTTTTT.......", // 49
  ".....MMMMMMMMMNNNNNNNNPPPPPPPPPPPPPPPPPPPPPPPPQQQQQQQQQ......................TTTTTTTTTTTTTTTTTTTT.......", // 50
  "....MMMMMMMM...NNNNNNNPPPPPPPPPPPPPPPPPPPPPPPQQQQQQQQQ.........................TTTTTTTTTTTTTTTTT........", // 51
  ".....MMMM.....NNNNNNNPPPPPPPPPPPPPPPPPPPPPPPQQQQQQQQQ..........................TTTTTTTTTTTTTTTT.........", // 52
  "....MMM.........NNNNNPPPPPPPPPPPPPPPPPPPPPPQQQQQQQQQ.............................TTTTTTTTTTTT...........", // 53
  "....MMM..............PPPPPPPPPPPPPPPPPPPPPQQQQQQQQQ..............................TTTTTTTTTTT............", // 54
  ".......................PPPPPPPPPPPPPPPPPPQQQQQQQQQ.................................TTTTTTT..............", // 55
  "........................PPPPPPPPPPPPPPPPP..........................................TTTT.................", // 56
  "..........................PPPPPPPPPPPPP............................................TTTT.................", // 57
  "...........................PPPPPPPPPPP..................................................................", // 58
  ".............................PPPPPPP....................................................................", // 59
];

export const MICRO_TEMPLATE_WIDE: string[] = [
  "............BBBB.............AAAA........................GGGG...........................................................................", // 0
  "...........BBBBBB...........AAAAAA......................GGGGGG..........................................................................", // 1
  ".............BBBB...........AAAAAA......................GGGGGG..........................................................................", // 2
  "..........BBBBBBBB.........AAAAAAAA....................GGGGGGGG.........................................................................", // 3
  "...........BBBBBBBB..........AAAAAAAAAA.G..........GGGGG.......GGGG..........IIIIIII....................................................", // 4
  ".......BBBBBBBBBBBBBA...AAAAAAAAAAAAAAAAAG.......GGGGGGGG.........GGG........IIIIIIII...................................................", // 5
  "........BBBBBBBBBBBBBAAAAAAAAAAAAAAAAAAAA..GGGGGGGGGGGGGGGG.........GGIIIIIIIIIIIIIIIIII................................................", // 6
  "......BBBBBBBBBBBBBBBBAAAAAAAAAAAAAAAAAAAA..GGGGGGGGGGGGGGGGG........IIIIIIIIIIIIIIIIIIIII..............................................", // 7
  ".......BBBBBBBBBBBBBBBBAAAAAAAAAAAAAAAAAAAA..GGGGGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIIIIIIIIIII.............................................", // 8
  "......BBBBBBBBBBBBBBBBAAAAAAAAAAAAAAAAAAAAAGGGGGGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIIIIIIIIIIIII............................................", // 9
  "......BBBBBBBBBBBBBBBAAAAAAAAAAAAAAAAAAAA..GGGGGGGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIIIIIIIIIIII............................................", // 10
  "......BBBBBBBBBBBBBBAAAAAAAAAAAAAAAAAAAA..GGGGGGGGGGGGGGGGGGGGGGGGGGGIIIIIIIIIIIIIIIIIIIIIII............................................", // 11
  "......BBBBBBBBBBBBBAAAAAAAAAAAAAAAAAAAA..GGGGGGGGGGHHHHHHHHGGGGGGGGGGGGIIIIIIIIIIIIIIIIIIIII............................................", // 12
  "......BBBBBBBBBBBBAAAAAAAAAAAAAAAAAAAA..GGGGGGGGGGGHHHHHHHHGGGGGGGGGGGGGGIIIIIIIIIIIIIIIIII.............................................", // 13
  "......BBBBBBBBBBBAAAAAAAAAAAAAAAAAAA..GGGGGGGGGGGGGHHHHHHHHGGGGGGGIIIIIIIIIIIIIIIIIIIIIIIII.............................................", // 14
  ".......BBBBBBBBBBAAAAAAAAAAAAAAAAAAA..GGGGGGGGGGGGGHHHHHHHHGGGGGGGIIIIIIIIIIIIIIIIIIIIIIIII.............................................", // 15
  "......BBBBBBBBBBBCCCCCCCCCCCCCCCCCCCC.HHHHHHHHHHHHHHHHHHHHHHHHHHHIIIIIIIIIIIIIIIIIIIIIIIJJJJJJJ.........................................", // 16
  "........BBBBBBBBBCCCCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHHHHHHHIIIIIIIIIIIIIIIIIIIIIIIJJJJJJJJ........................................", // 17
  ".......BBBBBBBBBCCCCCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJJJ........................................", // 18
  ".........BBBBBBBCCCCCCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ.......................................", // 19
  "..............CCCCCCCCCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ......................................", // 20
  "..............CCCCCCCCCCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ.....................................", // 21
  "..............CCCCCCCCCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ.....................................", // 22
  "................CCCCCCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHHHHJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ......................................", // 23
  "................CCCCCCCCCCCCCCCCCCC..HHHHHHHHHHHHHHHHHHHHHHHHH..JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ..........................................", // 24
  ".................CCCCCCCCCCCCCCCCC....HHHHHHHHHHHHHHHHHHHHHHH....JJJJJJJJJJJJJJJJJJJJJJJJJJJJ...........................................", // 25
  ".................CCCCCCCCCCCCCCCCC....HHHHHHHHHHHHHHHHHHHHHHH....HJJJJJJJJJJJJJJJJJJJJJJJJJJJ...........................................", // 26
  "..................CCCCCCCCCCCCCCC......HHHHHHHHHHHHHHHHHHHHH......HJJJJJJJJJJJJJJJJJJJJJJJJJ............................................", // 27
  "...................CCCCCCCCCCCCCC........HHHHHHHHHHHHHHHHHHH......JJJJJJJJJJJJJJJJJJJJ..................................................", // 28
  ".....................CCCCCCCCCC............HHHHHHHHHHHHHHH..........JJJJJJJJJJJJJJJJ....................................................", // 29
  "........................................................................................................................................", // 30
  "........................................................................................................................................", // 31
  ".........................D...DDDDDDDDDDDDDDDDDDD......FFFFFFFFFFFFFFFFFFFFF.............................................SSSSSSSSS.......", // 32
  "............................DDDDDDDDDDDDDDDDDDDDF....FFFFFFFFFFFFFFFFFFFFFFF..........................................SSSSSSSSSSSSS.....", // 33
  "........................DDDDDDDDDDEEEEEEEEEEEEEEEEEEEEEEFFFFFFFFFFFFFFFFFFFFF............................RRRRRRRRRRRRSSSSSSSSSSSSS......", // 34
  "...................D....DDDDDDDDDD.EEEEEEEEEEEEEEEEEEEEEE.FFFFFFFFFFFFFFFFFFFF..........................RRRRRRRRRRRRSSSSSSSSSSSSS.......", // 35
  ".........KKKKK.....DDDDDDDDDDDDDDDDDEEEEEEEEEEEEEEEEEEEEE.FFFFFFFFFFFFFFFFFFFFFF........................RRRRRRRRRRRRRSSSSSS.............", // 36
  ".......KKKKKKKKK...DDDDDDDDDDDDD.DDDDEEEEEEEEEEEEEEEEEEE.EEFFFFFFFFFFFFFFFFFFFFF.......................RRRRRRRRRRRRRRRSSSSSS............", // 37
  "........KKKKKKK....DDDDDDDDDDDDDDDDDDDEEEEEEEEEEEEEEEEEEEEEEFFFFFFFFFFFFFFFFFFFF........................RRRRRRRRRRRRRSSSSSSSSS.........S", // 38
  "......KKKKKKKKKKK..DDDDDDDDDDDDDDDDDDEEEEEEEEEEEEEEEEEEE.EEFFFFFFFFFFFFFFFFFFFF........................RRRRRRRRRRRRRSSSSSSSSSSS.......SS", // 39
  ".......KKKKKKKKKKKKLLLLLDDDDDDDDDLLLLLEEEEEEEEEEEEEEEEEE.EFFFFFFFFFFFFFFFFFFFFF........................RRRRRRRRRRRRSSSSSSSSSSSSSSSSSSSS.", // 40
  ".....KKKKKKKKKKKKKLLLLLLDDDDDDDDDLLLLLEEEEEEEEEEEEEEEEEEEFFFFFFFFFFFFFFFFFFFFF.........................RRRRRRRRRRRRRRRRRSSSSSSSSSSSSSSS.", // 41
  ".....KKKKKKKKKKKKLLLLLLLLLLLLLLLLLLLLLEEEEEEEEEEEEEEEEEEFFFFFFFFFFFFFFFFFFFF...........................RRRRRRRRRRRRRRRSSSSSSSSSSSSSSSSSS", // 42
  "....KKKKKKKKKKKKLLLLLLLLLLLLLLLLLLLLLLEEEEEEEEEEEEEEEEEFF.FFFFFFFFFFFFFFFFF............................RRRRRRRRRRRRRRRSSSSSSSSSSSSSSSSSS", // 43
  "....KKKKKKKKKKKLLLLLLLLLLLLLLLLLLLL...EEEEEEEEEOOOOOOOOO........FFFFFFFFFFFFF..........................RRRRRRRRRRRRRRRSSSSSSSSSSSSSSSSS.", // 44
  ".....KKKKKKKKKLLLLLLLLLLLLLLLLLLLLLLLLEEEEEEEEOOOOOOOOOOOOOOOOOO.FFFFFFFFFFFF..........................RRRRRRRRRRRRRRRSSSSSSSSSSSSSSS...", // 45
  ".....KKKKKKKKLLLLLLLLLLLLLLLLLLLLL.....EEEEEOOOOOOOOOOOOOOOOOOOOOO...................................RRRRRRRRRRRRRRRSSSSSSSSSSSSSSSSSS..", // 46
  ".......KKKKKLLLLLLLLLLLLLLLLLLLLLLLLLLLEEEEOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO.....................RRRRRRRRRRRRRRRRRRSSSSSSSSSSSSSSSS....", // 47
  "......KKKKKLLLLLLLLLLLLLLLLLLLLL.....OEEEOOOOOOOOOOOOOOOOOOOOOOOOOOO..........................RRRRRRRRRRRRRRRRRRRRSSSSSSSSSSSSSSS.......", // 48
  ".......KKKKKKKKKKLLLLLLLLLLLLLLLLLLLLOOOOOOOOOOOOOOOOOOOOOOOOOOOO.OQQQQQQQQQQQQ.........RRRRRRRRRRRRRRRRRRRRRRRRRR..SSSSSSSSSSSSS.......", // 49
  ".......KKKKKKKKLLLLLLLLLLLLLLL.....LLOOOOOOOOOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQQQQQ........RRRRRRRRRRRRRRRRRRRRRRRR..SSSSSSSSSSSSSS......", // 50
  ".......KKKKKKKKLLLLLLLLLLLLLLLLLLLLLLOOOOOOOOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQQQQQQQQQQ........RRRRRRRRRRRRRRRRRRRRSSSSSSSSSSSSS.........", // 51
  ".......MMMMMMMMMMMLLLLLLLLLLLLLLNNNNOOOOOOOOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQQQQQQQQQQQQQQQ..........RRRRRRRRRRRRRRTTTTTTTTT...............", // 52
  "......MMMMMMMMMMMMLLLLLLLLLLLLLLNNNNOOOOOOOOOOOOOOOOOOOOOOOOOOO.QQQQQQQQQQQQQQQQQQQQQQ..........RRRRRRRRRRRRRRRR.TTTTTTTTTT.............", // 53
  ".......MMMMMMMMMMMMMMNNNNNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOOOOOO..QQQQQQQQQQQQQQQQQQ.......................TTTTTTTTTTTTTTTTTT.............", // 54
  "......MMMMMMMMMMMMMMMMNNNNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOOOOO...QQQQQQQQQQQQQQQ.........................TTTTTTTTTTTTTTTTTTTT............", // 55
  "......MMMMMMMMMMMMMMMMMNNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOOOOOOO..QQQQQQQQQQQQQ...........................TTTTTTTTTTTTTTTTTTTTTTTTTT......", // 56
  ".......MMMMMMMMMMMMMMMNNNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOOOOOOO...QQQQQQQQQQQ............................TTTTTTTTTTTTTTTTTTTTTTTTTTT.....", // 57
  "......MMMMMMMMMMMMMMMNNNNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOOOOOO...QQQQQQQQQQQ.............................TTTTTTTTTTTTTTTTTTTTTTTTTTT.....", // 58
  ".......MMMMMMMMMMMMMNNNNNNNNNNNNNNNOOOOOOOOOOOOOOOOOOOOOOOOO..QQQQQQQQQQQQQQ..............................TTTTTTTTTTTTTTTTTTTTTTTT......", // 59
  ".......MMMMMMMMMMM.NNNNNNNNNNNNNNNNPPPPPPPPPPPPPPPPPPPPPPPPQQQQQQQQQQQQQQQQQQQQ..........................TTTTTTTTTTTTTTTTTTTTTTTTTT.....", // 60
  ".......MMMMMMMMMM..NNNNNNNNNNNNNNNNPPPPPPPPPPPPPPPPPPPPPPPQQQQQQQQQQQQQQQQQQQQQ...........................TTTTTTTTTTTTTTTTTTTTTTTT......", // 61
  ".......MMMMMMMMMM..NNNNNNNNNNNNNNNNPPPPPPPPPPPPPPPPPPPP.....QQQQQQQQQQQQQQQQQQ............................TTTTTTTTTTTTTTTTTTTTTTTT......", // 62
  "......MMMMMMMMMM....NNNNNNNNNNNNNN.PPPPPPPPPPPPPPPPPP.........QQQQQQQQQQQQQQQ..............................TTTTTTTTTTTTTTTTTTTTTTT......", // 63
  ".......MMMMM.......NNNNNNNNNNNNNNN.PPPPPPPPPPPPPPPP..........QQQQQQQQQQQQQQQ...............................TTTTTTTTTTTTTTTTTTTT.........", // 64
  "......MMMM...........NNNNNNNNNNN.....PPPPPPPPPPPPQQQQQQQQQQQQQQQQQQQQQQQQQQ..................................TTTTTTTTTTTTTTTT...........", // 65
  "......MMM............NNNNNNNNNNNN...PPPPPPPPPPPQQQQQQQQQQQQQQQQQQQQQQQQQQQ.....................................TTTTTTTTTTTTTT...........", // 66
  ".......................NNNNNNNN.......PPPPPPPPQQQQQQQQQQQQQQQQQQQQQQQQQQQ........................................TTTTTTTTTTT............", // 67
  ".......................NNNNNNN........PPPPPPPPPP.................QQQQQQQ............................................TTTTTTTTTT..........", // 68
  ".........................NNN............PPPPPP.....................QQQQ...............................................TTTTTTTT..........", // 69
  "........................................PPPPPP..........................................................................................", // 70
  "..........................................PP............................................................................................", // 71
];


export const GRID_TEMPLATE_COMPACT: string[] = deriveCoarseTemplateFromMicro(MICRO_TEMPLATE_COMPACT);
export const GRID_TEMPLATE_WIDE: string[] = deriveCoarseTemplateFromMicro(MICRO_TEMPLATE_WIDE);
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
      { x: 65, y: 11 },
      { x: 68, y: 12 },
      { x: 71, y: 13 },
      { x: 74, y: 14 },
    ],
  },
  // E3 <-> F1 (Mist Strait)
  {
    from: "E3",
    to: "F1",
    path: [
      { x: 59, y: 20 },
      { x: 62, y: 20 },
      { x: 65, y: 20 },
      { x: 68, y: 20 },
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
      { x: 81, y: 24 },
      { x: 84, y: 24 },
      { x: 88, y: 24 },
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
  oceanLabels: [
    { x: 38, y: 3, text: "~ ~   THE GREY SEA   ~ ~" },
    { x: 36, y: 14, text: "~ ~   IRON STRAIT   ~ ~" },
    { x: 68, y: 27, text: "~ ~   EMERALD SEA   ~ ~" },
  ],
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
  oceanLabels: [
    { x: 52, y: 4, text: "~ ~ ~   THE GREY SEA   ~ ~ ~" },
    { x: 50, y: 17, text: "~ ~ ~   THE IRON STRAIT   ~ ~ ~" },
    { x: 12, y: 3, text: "~ ~   VERDANT SOUND   ~ ~" },
    { x: 92, y: 32, text: "~ ~ ~   EMERALD SEA   ~ ~ ~" },
    { x: 8, y: 32, text: "~ ~   CALDERA GULF   ~ ~" },
  ],
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
  microTemplate: MICRO_TEMPLATE_COMPACT,
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
  microTemplate: MICRO_TEMPLATE_WIDE,
  template: GRID_TEMPLATE_WIDE,
  charToTerritoryId: CHAR_TO_TERRITORY_ID,
  territoryIdToChar: TERRITORY_ID_TO_CHAR,
  territories: GRID_TERRITORIES_WIDE,
  sectors: GRID_SECTORS,
  seaRoutes: GRID_SEA_ROUTES_WIDE,
  decorations: GRID_DECORATIONS_WIDE,
};

export { getMapContentDimensionsForTerminal } from "../layout.js";

/**
 * Returns dimensions occupied by authored land, excluding ocean margin.
 */
function getLandDimensions(microTemplate: readonly string[]): { width: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < microTemplate.length; y++) {
    for (let x = 0; x < microTemplate[y].length; x++) {
      if (microTemplate[y][x] === ".") continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return minX === Infinity
    ? { width: 0, height: 0 }
    : { width: maxX - minX + 1, height: Math.floor(maxY / 2) - Math.floor(minY / 2) + 1 };
}

const WIDE_LAND_DIMENSIONS = getLandDimensions(MICRO_TEMPLATE_WIDE);

/**
 * Selects wide whenever its rendered land crop fits the WORLD MAP pane. The
 * full canonical canvas includes disposable ocean margins and must not force a
 * smaller map into a pane that can already display the wide geography.
 */
export function getMapForDimensions(contentWidth: number, contentHeight: number): GridMapDefinition {
  if (contentWidth >= WIDE_LAND_DIMENSIONS.width && contentHeight >= WIDE_LAND_DIMENSIONS.height) {
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
  // App forces its compact viewport at these responsive breakpoints. Keep
  // keyboard navigation and direct callers on that same map even when the
  // raw terminal rectangle happens to contain the wide land crop.
  if (terminalCols < 130 || terminalRows < 38) {
    return MAP_GRID_IRONREACH_COMPACT;
  }
  const { width, height } = getMapContentDimensionsForTerminal(terminalCols, terminalRows);
  return getMapForDimensions(width, height);
}

export const MAP_GRID_IRONREACH: GridMapDefinition = MAP_GRID_IRONREACH_WIDE;
export const MAP_IRONREACH: GridMapDefinition = MAP_GRID_IRONREACH;

export default MAP_GRID_IRONREACH;
