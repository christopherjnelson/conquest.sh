import type { MapDefinition } from "@conquest/game-core";

export const MAP_IRONREACH: MapDefinition = {
  id: "ironreach",
  name: "The Ironreach",
  description:
    "A fractured feudal continent of northern peaks, contested river marches, and volcanic coasts.",
  recommendedPlayers: { min: 2, max: 4 },
  sectors: [
    {
      id: "northreach",
      name: "Northreach",
      bonusReinforcements: 3,
      territoryIds: ["frostfell", "highwatch", "iron_hollow"],
      colorHex: "#00d2ff",
    },
    {
      id: "the_marches",
      name: "The Marches",
      bonusReinforcements: 2,
      territoryIds: ["stoneveil", "red_basin", "mossgate", "sunken_pass"],
      colorHex: "#ffaa00",
    },
    {
      id: "emberlands",
      name: "Emberlands",
      bonusReinforcements: 3,
      territoryIds: ["ember_coast", "ashmoor", "hollowmere"],
      colorHex: "#ff3399",
    },
  ],
  territories: [
    // Northreach Region
    {
      id: "frostfell",
      name: "Frostfell",
      sectorId: "northreach",
      position: { x: 2, y: 1 },
      neighbors: ["highwatch", "iron_hollow"],
      render: {
        width: 19,
        height: 5,
        flavor: "Glacial mountain citadel guarding the northern frontier",
      },
    },
    {
      id: "highwatch",
      name: "Highwatch",
      sectorId: "northreach",
      position: { x: 46, y: 1 },
      neighbors: ["frostfell", "iron_hollow", "stoneveil"],
      render: {
        width: 19,
        height: 5,
        flavor: "Windswept aerie overlooking the contested river passes",
      },
    },
    {
      id: "iron_hollow",
      name: "Iron Hollow",
      sectorId: "northreach",
      position: { x: 24, y: 6 },
      neighbors: ["frostfell", "highwatch", "stoneveil", "red_basin"],
      render: {
        width: 19,
        height: 5,
        flavor: "Subterranean stronghold of foundries and ancient mine shafts",
      },
    },

    // The Marches Region
    {
      id: "stoneveil",
      name: "Stoneveil",
      sectorId: "the_marches",
      position: { x: 47, y: 7 },
      neighbors: ["highwatch", "iron_hollow", "mossgate", "red_basin"],
      render: {
        width: 19,
        height: 5,
        flavor: "Fog-shrouded limestone gatehouse flanking the eastern border",
      },
    },
    {
      id: "red_basin",
      name: "Red Basin",
      sectorId: "the_marches",
      position: { x: 2, y: 12 },
      neighbors: ["iron_hollow", "stoneveil", "sunken_pass"],
      render: {
        width: 19,
        height: 5,
        flavor: "Blood-stained clay canyons scarred by centuries of siege",
      },
    },
    {
      id: "mossgate",
      name: "Mossgate",
      sectorId: "the_marches",
      position: { x: 46, y: 12 },
      neighbors: ["stoneveil", "sunken_pass", "ashmoor"],
      render: {
        width: 19,
        height: 5,
        flavor: "Overgrown river fortress controlling the central waterways",
      },
    },
    {
      id: "sunken_pass",
      name: "Sunken Pass",
      sectorId: "the_marches",
      position: { x: 24, y: 16 },
      neighbors: ["red_basin", "mossgate", "ember_coast", "ashmoor"],
      render: {
        width: 19,
        height: 5,
        flavor: "Flooded lowland ravine bridging northern hills and volcanic flats",
      },
    },

    // Emberlands Region
    {
      id: "ember_coast",
      name: "Ember Coast",
      sectorId: "emberlands",
      position: { x: 2, y: 22 },
      neighbors: ["sunken_pass", "hollowmere"],
      render: {
        width: 19,
        height: 5,
        flavor: "Obsidian cliffs battered by churning sulfurous waves",
      },
    },
    {
      id: "ashmoor",
      name: "Ashmoor",
      sectorId: "emberlands",
      position: { x: 46, y: 22 },
      neighbors: ["mossgate", "sunken_pass", "hollowmere"],
      render: {
        width: 19,
        height: 5,
        flavor: "Smoldering peat bogs blanketed in gray volcanic fallout",
      },
    },
    {
      id: "hollowmere",
      name: "Hollowmere",
      sectorId: "emberlands",
      position: { x: 24, y: 25 },
      neighbors: ["ember_coast", "ashmoor"],
      render: {
        width: 19,
        height: 5,
        flavor: "Sunken caldera lake harboring forgotten royal mausoleums",
      },
    },
  ],
};
