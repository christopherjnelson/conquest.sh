import { describe, expect, it } from "bun:test";
// @ts-ignore Test renderer is intentionally imported from the client workspace.
import React from "../apps/client/node_modules/react/index.js";
// @ts-ignore Test renderer is intentionally imported from the client workspace.
import { act } from "../apps/client/node_modules/react/index.js";
// @ts-ignore Test renderer is intentionally imported from the client workspace.
import { testRender } from "../apps/client/node_modules/@opentui/react/test-utils.js";
import { createInitialGameState } from "../packages/game-core/src/index.js";
import { MAP_GRID_IRONREACH, getLayoutMode } from "../packages/map-engine/src/index.js";
import type { Player } from "../packages/protocol/src/index.js";
import { EventLog } from "../apps/client/src/ui/EventLog.js";
import { Sidebar } from "../apps/client/src/ui/Sidebar.js";
import { App } from "../apps/client/src/ui/App.js";

const players: Player[] = [
  { id: "p1", name: "Commander Alexandria", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true },
  { id: "p2", name: "Blair", colorIndex: 1, colorHex: "#ff4444", connected: true, isAlive: true, ready: true },
];

function selectedState() {
  const state = createInitialGameState("visual-sidebar", "SIDE", players, MAP_GRID_IRONREACH, 2);
  state.phase = "deployment";
  state.territories.B2.ownerId = "p1";
  state.territories.B2.units = 7;
  return state;
}

function lobbyClient() {
  const state = createInitialGameState("lobby-sidebar", "LOBB", players, MAP_GRID_IRONREACH, 2);
  state.players = [players[0]];
  state.phase = "lobby";
  return {
    state,
    myPlayerId: "p1",
    status: "connected",
    roomCode: "LOBB",
    onSnapshot: () => () => {}, onEvent: () => () => {}, onStatusChange: () => () => {}, onError: () => () => {},
    sendChat: () => {}, deploy: () => {}, attack: () => {}, fortify: () => {}, skipPhase: () => {}, endTurn: () => {}, ready: () => {},
  } as any;
}

function activeClient() {
  const state = createInitialGameState("active-sidebar", "ACTV", players, MAP_GRID_IRONREACH, 2);
  state.phase = "deployment";
  state.activePlayerIndex = 0;
  return {
    state,
    myPlayerId: "p1",
    status: "connected",
    roomCode: "ACTV",
    onSnapshot: () => () => {}, onEvent: () => () => {}, onStatusChange: () => () => {}, onError: () => () => {},
    sendChat: () => {}, deploy: () => {}, attack: () => {}, fortify: () => {}, skipPhase: () => {}, endTurn: () => {}, ready: () => {},
  } as any;
}

describe("visual sidebar composition", () => {
  for (const columns of [110, 130, 140, 180, 200]) {
    it(`keeps selected-territory lanes distinct at ${columns} columns`, async () => {
      const layoutMode = getLayoutMode(columns, 55);
      const width = Math.floor((columns - 1) * (layoutMode === "wide" ? 1 / 4 : 2 / 7));
      const setup = await testRender(
        React.createElement(Sidebar, {
          state: selectedState(),
          myPlayerId: "p1",
          selectedTerritoryId: "B2",
          targetTerritoryId: "B1",
          onDeploy: () => {},
          onAttack: () => {},
          onFortify: () => {},
          onSkipPhase: () => {},
          onEndTurn: () => {},
          layoutMode,
        }),
        { width, height: 38 }
      );
      await act(async () => { await setup.renderOnce(); });

      const frame = setup.captureCharFrame();
      const lines = frame.split("\n");
      const selectedTitleLine = lines.findIndex((line: string) => line.includes("! SELECTED TERRITORY"));
      expect(frame).toContain("! SELECTED TERRITORY");
      expect(frame).toContain("Owner");
      expect(frame).toContain("Armies");
      expect(frame).toContain("Region");
      expect(frame).toContain("Bonus");
      expect(frame).toContain("[B1*]");
      expect(frame).not.toContain("Bordering");

      const afterSelectedTitle = (text: string) => lines.findIndex((line: string, index: number) => index > selectedTitleLine && line.includes(text));
      const ownerLine = afterSelectedTitle("Owner");
      const armiesLine = afterSelectedTitle("Armies");
      const regionLine = afterSelectedTitle("Region");
      const bonusLine = afterSelectedTitle("Bonus");
      const chipLine = afterSelectedTitle("[B1*]");
      const flavorLine = afterSelectedTitle("Rolling gold");
      const identityLine = afterSelectedTitle("[B2]");
      expect([ownerLine, armiesLine, regionLine, bonusLine].every((line) => line >= 0)).toBe(true);
      expect(ownerLine).toBeLessThan(armiesLine);
      expect(armiesLine).toBeLessThan(regionLine);
      expect(regionLine).toBeLessThan(bonusLine);
      expect(bonusLine).toBeLessThan(chipLine);
      expect(chipLine).toBeLessThan(flavorLine);
      expect(flavorLine - chipLine).toBeGreaterThanOrEqual(1);
      expect(lines[identityLine]).toContain("SEL");
      expect(lines[ownerLine].indexOf("Owner")).toBeLessThan(lines[ownerLine].indexOf("●"));

      await act(async () => { setup.renderer.destroy(); });
    });
  }

  it("keeps an empty event log to the responsive compact heights", async () => {
    const heights = [
      ["wide", 6],
      ["standard", 5],
      ["compact", 4],
    ] as const;
    for (const [layoutMode, expectedHeight] of heights) {
      const setup = await testRender(
        React.createElement(EventLog, {
          events: [], chatOpen: false, players: [], onToggleChat: () => {}, onSendChat: () => {}, layoutMode,
        }),
        { width: 80, height: 12 }
      );
      await act(async () => { await setup.renderOnce(); });
      const logNode = setup.renderer.root.getChildren()[0];
      expect(logNode.height).toBe(expectedHeight);
      expect(setup.captureCharFrame()).toContain("No events yet.");
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  for (const [columns, rows] of [[140, 45], [200, 55]] as const) {
    it(`keeps the actual ${columns}x${rows} App lobby inspector compact`, async () => {
      const setup = await testRender(
        React.createElement(App, { client: lobbyClient(), terminalDimensions: { columns, rows } }),
        { width: columns, height: rows }
      );
      await act(async () => { await setup.renderOnce(); });
      const lines = setup.captureCharFrame().split("\n");
      const selectedLine = lines.findIndex((line: string) => line.includes("! SELECTED TERRITORY"));
      const actionsLine = lines.findIndex((line: string) => line.includes("! ACTIONS"));
      const readyButtonLine = lines.findIndex((line: string) => line.includes("[ Ready ]"));
      expect(selectedLine).toBeGreaterThanOrEqual(0);
      // Seven-row card plus the one-row sidebar gap.
      expect(actionsLine - selectedLine).toBeLessThanOrEqual(8);
      expect(readyButtonLine).toBeGreaterThan(actionsLine);
      expect(readyButtonLine - actionsLine).toBeLessThanOrEqual(2);
      expect(lines.join("\n")).toContain("Map intel will appear here.");
      if (columns >= 180) expect(lines.join("\n")).toContain("! REALM & SESSION INTEL");
      await act(async () => { setup.renderer.destroy(); });
    });
  }

  it("keeps all four active actions inside the 140x45 App sidebar", async () => {
    const setup = await testRender(
      React.createElement(App, { client: activeClient(), terminalDimensions: { columns: 140, rows: 45 } }),
      { width: 140, height: 45 }
    );
    await act(async () => { await setup.renderOnce(); });
    const lines = setup.captureCharFrame().split("\n");
    const actionTitle = lines.findIndex((line: string) => line.includes("! ACTIONS"));
    const deploy = lines.findIndex((line: string) => line.includes("[D] ➜ Deploy"));
    const attack = lines.findIndex((line: string) => line.includes("[A] ⚔ Attack"));
    const fortify = lines.findIndex((line: string) => line.includes("[F] 🛡 Fortify"));
    const endTurn = lines.findIndex((line: string) => line.includes("[E] » End Turn"));
    const eventLog = lines.findIndex((line: string) => line.includes("! EVENT LOG / CHAT"));
    expect([deploy, attack, fortify, endTurn].every((line) => line > actionTitle)).toBe(true);
    expect(deploy).toBeLessThan(attack);
    expect(attack).toBeLessThan(fortify);
    expect(fortify).toBeLessThan(endTurn);
    expect(endTurn).toBeLessThan(eventLog);
    await act(async () => { setup.renderer.destroy(); });
  });
});
