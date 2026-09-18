import { describe, expect, it } from "bun:test";
import {
  attackTerritory,
  calculateReinforcements,
  createInitialGameState,
  deployUnits,
  endTurn,
  fortifyUnits,
  resolveCombat,
  skipPhase,
} from "../packages/game-core/src/index.js";
import { MAP_SECTOR_07 } from "../packages/map-engine/src/index.js";
import type { Player } from "../packages/protocol/src/index.js";

describe("game-core: combat resolution", () => {
  it("resolves single combat round with deterministic dice rolls", () => {
    // Attacker rolls [6, 4, 2], defender rolls [5, 4]
    // Dice 1: 6 vs 5 -> defender loss
    // Dice 2: 4 vs 4 -> tie! defender wins tie -> attacker loss
    const sequence = [0.99, 0.65, 0.3, 0.8, 0.65]; // rolls: 6, 4, 2, 5, 4
    let i = 0;
    const mockRandom = () => sequence[i++];

    const result = resolveCombat(3, 2, mockRandom);
    expect(result.attackerRolls).toEqual([6, 4, 2]);
    expect(result.defenderRolls).toEqual([5, 4]);
    expect(result.defenderLosses).toBe(1);
    expect(result.attackerLosses).toBe(1);
  });

  it("handles defender winning both dice on ties or higher rolls", () => {
    // Attacker rolls [3, 2], defender rolls [3, 2] -> ties go to defender!
    const sequence = [0.4, 0.2, 0.4, 0.2]; // rolls: 3, 2, 3, 2
    let i = 0;
    const mockRandom = () => sequence[i++];

    const result = resolveCombat(2, 2, mockRandom);
    expect(result.attackerLosses).toBe(2);
    expect(result.defenderLosses).toBe(0);
  });
});

describe("game-core: state initialization", () => {
  const players: Player[] = [
    { id: "p1", name: "Alice", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true },
    { id: "p2", name: "Bob", colorIndex: 1, colorHex: "#ffaa00", connected: true, isAlive: true, ready: true },
  ];

  it("distributes 8 territories evenly between 2 players", () => {
    const state = createInitialGameState("g1", "TEST", players, MAP_SECTOR_07, 3);
    expect(state.players.length).toBe(2);
    expect(Object.keys(state.territories).length).toBe(8);

    const p1Territories = Object.values(state.territories).filter((t) => t.ownerId === "p1");
    const p2Territories = Object.values(state.territories).filter((t) => t.ownerId === "p2");

    expect(p1Territories.length).toBe(4);
    expect(p2Territories.length).toBe(4);

    expect(state.phase).toBe("deployment");
    expect(state.pendingReinforcements).toBeGreaterThanOrEqual(3);
    expect(state.activePlayerIndex).toBe(0);
  });
});

describe("game-core: deployment rules", () => {
  const players: Player[] = [
    { id: "p1", name: "Alice", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true },
    { id: "p2", name: "Bob", colorIndex: 1, colorHex: "#ffaa00", connected: true, isAlive: true, ready: true },
  ];

  it("allows valid deployment and transitions phase when all units deployed", () => {
    const state = createInitialGameState("g1", "TEST", players, MAP_SECTOR_07, 3);
    const p1Territory = Object.values(state.territories).find((t) => t.ownerId === "p1")!;
    const initialUnits = p1Territory.units;
    const totalPending = state.pendingReinforcements;

    // Deploy all units
    const result = deployUnits(state, "p1", p1Territory.id, totalPending);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.territories[p1Territory.id].units).toBe(initialUnits + totalPending);
    expect(result.state.pendingReinforcements).toBe(0);
    expect(result.state.phase).toBe("attack");
  });

  it("rejects deployment from wrong player or to enemy territory", () => {
    const state = createInitialGameState("g1", "TEST", players, MAP_SECTOR_07, 3);
    const p2Territory = Object.values(state.territories).find((t) => t.ownerId === "p2")!;

    // Bob trying to deploy during Alice's turn
    const res1 = deployUnits(state, "p2", p2Territory.id, 1);
    expect(res1.ok).toBe(false);

    // Alice trying to deploy to Bob's territory
    const res2 = deployUnits(state, "p1", p2Territory.id, 1);
    expect(res2.ok).toBe(false);
  });
});

describe("game-core: attack & conquest", () => {
  it("resolves attack and conquers enemy territory on elimination", () => {
    const players: Player[] = [
      { id: "p1", name: "Alice", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true },
      { id: "p2", name: "Bob", colorIndex: 1, colorHex: "#ffaa00", connected: true, isAlive: true, ready: true },
    ];

    let state = createInitialGameState("g1", "TEST", players, MAP_SECTOR_07, 3);
    state.phase = "attack";
    state.pendingReinforcements = 0;

    // Set A1 to Alice with 10 units, A2 to Bob with 1 unit
    state.territories["A1"] = { ...state.territories["A1"], ownerId: "p1", units: 10 };
    state.territories["A2"] = { ...state.territories["A2"], ownerId: "p2", units: 1 };

    // Attacker rolls [6, 6, 6], defender rolls [1] -> Bob loses 1 unit, down to 0
    const sequence = [0.99, 0.99, 0.99, 0.1];
    let i = 0;
    const mockRandom = () => sequence[i++];

    const attackRes = attackTerritory(state, "p1", "A1", "A2", 3, mockRandom);
    expect(attackRes.ok).toBe(true);
    if (!attackRes.ok) return;

    expect(attackRes.data?.conquered).toBe(true);
    expect(attackRes.state.territories["A2"].ownerId).toBe("p1");
    expect(attackRes.state.territories["A2"].units).toBe(3); // 3 dice moved in
    expect(attackRes.state.territories["A1"].units).toBe(7); // 10 - 3 = 7
  });

  it("detects game victory when attacker captures all territories", () => {
    const players: Player[] = [
      { id: "p1", name: "Alice", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true },
      { id: "p2", name: "Bob", colorIndex: 1, colorHex: "#ffaa00", connected: true, isAlive: true, ready: true },
    ];

    let state = createInitialGameState("g1", "TEST", players, MAP_SECTOR_07, 3);
    state.phase = "attack";
    // Make Alice own 7 territories, Bob own only A2
    for (const tid of Object.keys(state.territories)) {
      state.territories[tid] = { ...state.territories[tid], ownerId: "p1", units: 5 };
    }
    state.territories["A2"] = { ...state.territories["A2"], ownerId: "p2", units: 1 };

    // Attack A2 from A1
    const mockRandom = () => 0.99; // Attacker rolls 6, defender rolls 6 -> wait, tie!
    // Let's ensure attacker wins: attacker rolls 6, defender rolls 1
    const sequence = [0.99, 0.99, 0.99, 0.1];
    let i = 0;
    const riggedRandom = () => sequence[i++];

    const res = attackTerritory(state, "p1", "A1", "A2", 3, riggedRandom);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.state.winnerId).toBe("p1");
    expect(res.state.phase).toBe("game_over");
  });
});

describe("game-core: turn cycle & skip", () => {
  const players: Player[] = [
    { id: "p1", name: "Alice", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true },
    { id: "p2", name: "Bob", colorIndex: 1, colorHex: "#ffaa00", connected: true, isAlive: true, ready: true },
  ];

  it("skips from attack to fortify, and ends turn to pass to Bob", () => {
    let state = createInitialGameState("g1", "TEST", players, MAP_SECTOR_07, 3);
    state.phase = "attack";
    state.pendingReinforcements = 0;

    // Skip attack phase -> fortify
    const skip1 = skipPhase(state, "p1");
    expect(skip1.ok).toBe(true);
    if (!skip1.ok) return;
    expect(skip1.state.phase).toBe("fortify");

    // End turn -> passes to Bob
    const endRes = endTurn(skip1.state, "p1");
    expect(endRes.ok).toBe(true);
    if (!endRes.ok) return;

    expect(endRes.state.activePlayerIndex).toBe(1);
    expect(endRes.state.players[endRes.state.activePlayerIndex].id).toBe("p2");
    expect(endRes.state.phase).toBe("deployment");
    expect(endRes.state.pendingReinforcements).toBeGreaterThanOrEqual(3);
  });
});
