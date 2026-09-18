import type { MapDefinition } from "@conquest/game-core";

export const MAP_SECTOR_07: MapDefinition = {
  id: "sector-07",
  name: "Sector 07 (Cyber Grid)",
  description: "A compact corporate network perimeter with 8 critical network hosts.",
  recommendedPlayers: { min: 2, max: 4 },
  sectors: [
    {
      id: "wan",
      name: "WAN Sector",
      bonusReinforcements: 2,
      territoryIds: ["A1", "A2", "A3"],
      colorHex: "#00d2ff",
    },
    {
      id: "dmz",
      name: "DMZ Sector",
      bonusReinforcements: 2,
      territoryIds: ["B1", "B2"],
      colorHex: "#ffaa00",
    },
    {
      id: "core",
      name: "CORE Sector",
      bonusReinforcements: 3,
      territoryIds: ["C1", "C2", "C3"],
      colorHex: "#ff3399",
    },
  ],
  territories: [
    {
      id: "A1",
      name: "GATEWAY",
      sectorId: "wan",
      neighbors: ["A2", "A3", "B1"],
      position: { x: 16, y: 1 },
    },
    {
      id: "A2",
      name: "FIREWALL",
      sectorId: "wan",
      neighbors: ["A1", "A3", "C1"],
      position: { x: 3, y: 6 },
    },
    {
      id: "A3",
      name: "ROUTER",
      sectorId: "wan",
      neighbors: ["A1", "A2", "B2", "C1"],
      position: { x: 22, y: 6 },
    },
    {
      id: "B1",
      name: "PROXY",
      sectorId: "dmz",
      neighbors: ["A1", "B2", "C2"],
      position: { x: 38, y: 1 },
    },
    {
      id: "B2",
      name: "SUBNET",
      sectorId: "dmz",
      neighbors: ["A3", "B1", "C2"],
      position: { x: 38, y: 7 },
    },
    {
      id: "C1",
      name: "KERNEL",
      sectorId: "core",
      neighbors: ["A2", "A3", "C2"],
      position: { x: 10, y: 12 },
    },
    {
      id: "C2",
      name: "DAEMON",
      sectorId: "core",
      neighbors: ["B1", "B2", "C1", "C3"],
      position: { x: 26, y: 12 },
    },
    {
      id: "C3",
      name: "VAULT",
      sectorId: "core",
      neighbors: ["C2"],
      position: { x: 42, y: 12 },
    },
  ],
};
