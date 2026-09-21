import { getMap } from "../packages/map-engine/src/registry.js";
const ironreachBundle = getMap("ironreach")!;
import { describe, expect, it } from "bun:test";
// @ts-ignore Test renderer is intentionally imported from the client workspace.
import React from "../apps/client/node_modules/react/index.js";
// @ts-ignore Test renderer is intentionally imported from the client workspace.
import { act } from "../apps/client/node_modules/react/index.js";
// @ts-ignore Test renderer is intentionally imported from the client workspace.
import { testRender } from "../apps/client/node_modules/@opentui/react/test-utils.js";
import { createInitialGameState } from "../packages/game-core/src/index.js";
import {
  MAP_GRID_IRONREACH,
  MAP_GRID_IRONREACH_COMPACT,
  MAP_GRID_IRONREACH_WIDE,
  getLayoutMode,
  getSidebarWidthForTerminal,
} from "../packages/map-engine/src/index.js";
import { getMapRenderLayout } from "../apps/client/src/ui/MapCanvas.js";
import type { GameEvent, Player } from "../packages/protocol/src/index.js";
import { EventLog } from "../apps/client/src/ui/EventLog.js";
import { Sidebar } from "../apps/client/src/ui/Sidebar.js";
import { CompactInspector } from "../apps/client/src/ui/CompactInspector.js";
import { App } from "../apps/client/src/ui/App.js";
import { Header } from "../apps/client/src/ui/Header.js";

const earthBundle = getMap("earth-42")!;

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

function earthInspectorClient(selectedTerritoryId = "af_nile_valley") {
  const earthPlayers: Player[] = [
    { ...players[0], name: "Redwurm" },
    { ...players[1], name: "Sable" },
  ];
  const state = createInitialGameState("earth-inspector", "NILE", earthPlayers, earthBundle.definition);
  state.phase = "attack";
  state.activePlayerIndex = 0;
  state.territories[selectedTerritoryId] = { ...state.territories[selectedTerritoryId]!, ownerId: "p1", units: 7 };
  return {
    state,
    myPlayerId: "p1",
    status: "connected",
    roomCode: "NILE",
    onSnapshot: () => () => {}, onEvent: () => () => {}, onStatusChange: () => () => {}, onError: () => () => {},
    sendChat: () => {}, deploy: () => {}, attack: () => {}, fortify: () => {}, skipPhase: () => {}, endTurn: () => {}, ready: () => {},
  } as any;
}

function findNodeWithSize(node: any, width: number, height: number): any | null {
  if (node?.width === width && node?.height === height) return node;
  for (const child of node?.getChildren?.() ?? []) {
    const found = findNodeWithSize(child, width, height);
    if (found) return found;
  }
  return null;
}

function findTextNode(node: any, text: string): any | null {
  if (node == null) return null;
  if (typeof node === "string") return node.includes(text) ? node : null;
  const children = node?.props?.children instanceof Array ? node.props.children : [node?.props?.children];
  if (children.some((child: any) => typeof child === "string" && child.includes(text))) return node;
  for (const child of children) {
    const found = findTextNode(child, text);
    if (found) return found;
  }
  return null;
}

describe("visual sidebar composition", () => {
  it("keeps long territory and owner names in their own inspector lanes at every responsive width", async () => {
    const mapBundle = structuredClone(ironreachBundle);
    const territory = mapBundle.definition.territories.find((entry) => entry.id === "B2")!;
    territory.name = "The Extremely Long Territory Name That Must Stay Above Owner";
    const state = selectedState();
    state.players[0].name = "Commander Alexandria With An Extremely Long Name";

    for (const [layoutMode, width] of [["standard", 32], ["wide", 42]] as const) {
      const setup = await testRender(
        React.createElement(Sidebar, {
          mapBundle, state, myPlayerId: "p1", selectedTerritoryId: "B2", targetTerritoryId: null,
          onDeploy: () => {}, onAttack: () => {}, onFortify: () => {}, onSkipPhase: () => {}, onEndTurn: () => {}, layoutMode,
        }),
        { width, height: 38 }
      );
      await act(async () => { await setup.renderOnce(); });
      const lines = setup.captureCharFrame().split("\n");
      const ownerLine = lines.find((line: string) => line.includes("Owner"))!;
      expect(ownerLine).toContain("●");
      expect(ownerLine).toContain("Commander");
      expect(ownerLine).toContain("…");
      expect(ownerLine).not.toContain("Territory Name");
      expect(ownerLine).not.toContain("Alexandria With");
      await act(async () => { setup.renderer.destroy(); });
    }

    const compact = await testRender(
      React.createElement(CompactInspector, {
        mapBundle, state, myPlayerId: "p1", selectedTerritoryId: "B2", targetTerritoryId: null, phase: "deployment",
        onDeploy: () => {}, onAttack: () => {}, onFortify: () => {}, onSkipPhase: () => {}, onEndTurn: () => {},
      }),
      { width: 100, height: 4 }
    );
    await act(async () => { await compact.renderOnce(); });
    const compactFrame = compact.captureCharFrame();
    expect(compactFrame).toContain("The Extremely");
    expect(compactFrame).toContain("Commander Ale…");
    expect(compactFrame).not.toContain("Territory Name That");
    await act(async () => { compact.renderer.destroy(); });
  });

  it("does not turn a hovered territory's neighbors into targets for the selected source", () => {
    const state = selectedState();
    let selectedTarget: string | undefined;
    const hovered = "B1";
    const hoveredNeighbor = state.territories[hovered]!.neighbors[0]!;
    const inspector: any = Sidebar({
      mapBundle: ironreachBundle, state, myPlayerId: "p1", selectedTerritoryId: "B2", hoveredTerritoryId: hovered,
      targetTerritoryId: null, onDeploy: () => {}, onAttack: () => {}, onFortify: () => {}, onSkipPhase: () => {}, onEndTurn: () => {},
      onSelectTarget: (id) => { selectedTarget = id; }, layoutMode: "wide",
    });
    const hoveredChip = findTextNode(inspector, `[${ironreachBundle.metadata.displayCodes[hoveredNeighbor] ?? hoveredNeighbor}]`);
    expect(hoveredChip?.props?.onMouseDown).toBeUndefined();
    expect(selectedTarget).toBeUndefined();
  });

  it("labels the current player separately from the active turn and omits the header quote", async () => {
    const header: any = Header({
      roomCode: "SIDE", turnNumber: 3, activePlayer: players[1], currentPlayer: players[0], phase: "attack",
      pendingReinforcements: 2, connectionStatus: "connected", isMyTurn: false, layoutMode: "wide",
    });
    const serialized = JSON.stringify(header);
    expect(serialized).toContain("YOU: ");
    expect(serialized).toContain("Commander Alexandria");
    expect(serialized).toContain("Blair");
    expect(serialized).not.toContain("Same map.");
    expect(serialized).not.toContain("Different stories.");
  });

  for (const [layoutMode, width] of [["compact", 105], ["standard", 140], ["wide", 180]] as const) {
    it(`keeps current-player identity and the active player readable in the ${layoutMode} header`, async () => {
      const currentPlayer = { ...players[0], name: "Commander Alexandria of the Long Northern Marches" };
      const activePlayer = { ...players[1], name: "Baron Redwurm of the Eastern Dominion" };
      const setup = await testRender(
        React.createElement(Header, {
          roomCode: "HEAD", turnNumber: 4, currentPlayer, activePlayer, phase: "attack",
          pendingReinforcements: 5, connectionStatus: "connected", isMyTurn: false, layoutMode,
        }),
        { width, height: 8 },
      );
      await act(async () => { await setup.renderOnce(); });
      const lines = setup.captureCharFrame().split("\n");
      if (layoutMode === "wide") expect(lines.join("\n")).toContain("v0.3.0");
      const youLine = lines.find((line: string) => line.includes("YOU:"));
      expect(youLine).toBeDefined();
      expect(youLine).toContain("YOU:");
      expect(youLine).toContain("Commander");
      expect(youLine!.length).toBeLessThanOrEqual(width);
      const activeLine = lines.find((line: string) => line.includes("Baron") || line.includes("Active:"));
      expect(activeLine).toBeDefined();
      expect(activeLine!.length).toBeLessThanOrEqual(width);
      await act(async () => { setup.renderer.destroy(); });
    });
  }

  it("keeps Nile Valley's owner row separate and hides raw Earth target IDs in a 42-column sidebar", async () => {
    const earthPlayers: Player[] = [
      { ...players[0], name: "Redwurm" },
      { ...players[1], name: "Sable" },
    ];
    const state = createInitialGameState("earth-sidebar", "NILE", earthPlayers, earthBundle.definition);
    state.phase = "attack";
    state.activePlayerIndex = 0;
    state.territories.af_nile_valley = { ...state.territories.af_nile_valley!, ownerId: "p1", units: 7 };
    const setup = await testRender(
      React.createElement(Sidebar, {
        mapBundle: earthBundle, state, myPlayerId: "p1", selectedTerritoryId: "af_nile_valley", targetTerritoryId: "na_atlantic_states",
        onDeploy: () => {}, onAttack: () => {}, onFortify: () => {}, onSkipPhase: () => {}, onEndTurn: () => {}, layoutMode: "wide",
      }),
      { width: 42, height: 38 },
    );
    await act(async () => { await setup.renderOnce(); });
    const lines = setup.captureCharFrame().split("\n");
    const ownerLine = lines.find((line: string) => line.includes("Owner"))!;
    const territoryLine = lines.find((line: string) => line.includes("[AF2]"))!;
    const territoryNameLine = lines.find((line: string) => line.includes("Nile Valley"))!;
    expect(ownerLine).toContain("Redwurm");
    expect(ownerLine).not.toContain("Nile Valley");
    expect(territoryNameLine).toContain("Nile Valley");
    expect(territoryNameLine).not.toContain("Owner");
    expect(territoryLine).not.toContain("Owner");
    expect(lines.some((line: string) => line.includes("na_atlantic_states"))).toBe(false);
    expect(lines.some((line: string) => line.includes("NA8"))).toBe(true);
    await act(async () => { setup.renderer.destroy(); });
  });

  it("keeps AS10 Indian Subcontinent on its own row in the 42-column sidebar", async () => {
    const state = earthInspectorClient("as_indian_subcontinent").state;
    const setup = await testRender(
      React.createElement(Sidebar, {
        mapBundle: earthBundle, state, myPlayerId: "p1", selectedTerritoryId: "as_indian_subcontinent", targetTerritoryId: null,
        onDeploy: () => {}, onAttack: () => {}, onFortify: () => {}, onSkipPhase: () => {}, onEndTurn: () => {}, layoutMode: "wide",
      }),
      { width: 42, height: 38 },
    );
    await act(async () => { await setup.renderOnce(); });
    const lines = setup.captureCharFrame().split("\n");
    const identityLine = lines.findIndex((line: string) => line.includes("[AS10]") && line.includes("SEL"));
    const nameLine = lines.findIndex((line: string) => line.includes("Indian Subcontinent"));
    const ownerLine = lines.findIndex((line: string) => line.includes("Owner"));
    expect(identityLine).toBeGreaterThanOrEqual(0);
    expect(nameLine).toBeGreaterThan(identityLine);
    expect(nameLine).toBeLessThan(ownerLine);
    expect(lines[nameLine]).not.toContain("Owner");
    await act(async () => { setup.renderer.destroy(); });
  });

  for (const [columns, rows] of [[140, 45], [180, 51]] as const) {
    it(`keeps the full App Earth inspector lanes clear at ${columns}x${rows}`, async () => {
      const setup = await testRender(
        React.createElement(App, {
          client: earthInspectorClient(), terminalDimensions: { columns, rows },
          initialSelectedTerritoryId: "af_nile_valley", initialHoveredTerritoryId: "af_nile_valley",
          initialTargetTerritoryId: "na_atlantic_states",
        }),
        { width: columns, height: rows },
      );
      await act(async () => { await setup.renderOnce(); });
      const lines = setup.captureCharFrame().split("\n");
      const frame = lines.join("\n");
      expect(frame).toContain("Nile Valley");
      expect(frame).toContain("Redwurm");
      expect(frame).not.toContain("na_atlantic_states");
      if (columns >= 140) {
        const ownerLine = lines.find((line: string) => line.includes("Owner"))!;
        const nameLine = lines.find((line: string) => line.includes("Nile Valley"))!;
        expect(ownerLine).toContain("Redwurm");
        expect(ownerLine).not.toContain("Nile Valley");
        expect(nameLine).not.toContain("Owner");
        expect(frame).toContain("NA8");
      } else {
        const inspectorLine = lines.find((line: string) => line.includes("[AF2]"))!;
        expect(inspectorLine).toContain("Nile Valley");
        expect(inspectorLine).toContain("Redwurm");
      }
      await act(async () => { setup.renderer.destroy(); });
    });
  }

  for (const [columns, rows] of [[180, 51], [200, 55]] as const) {
    it(`keeps AS10 Indian Subcontinent between its identity and owner rows in the ${columns}x${rows} App`, async () => {
      const setup = await testRender(
        React.createElement(App, {
          client: earthInspectorClient("as_indian_subcontinent"), terminalDimensions: { columns, rows },
          initialSelectedTerritoryId: "as_indian_subcontinent", initialHoveredTerritoryId: "as_indian_subcontinent",
        }),
        { width: columns, height: rows },
      );
      await act(async () => { await setup.renderOnce(); });
      const lines = setup.captureCharFrame().split("\n");
      const identityLine = lines.findIndex((line: string) => line.includes("[AS10]") && line.includes("SEL"));
      const nameLine = lines.findIndex((line: string) => line.includes("Indian Subcontinent"));
      const ownerLine = lines.findIndex((line: string) => line.includes("Owner"));
      expect(identityLine).toBeGreaterThanOrEqual(0);
      expect(nameLine).toBeGreaterThan(identityLine);
      expect(nameLine).toBeLessThan(ownerLine);
      expect(lines[nameLine]).not.toContain("Owner");
      await act(async () => { setup.renderer.destroy(); });
    });
  }

  it("routes post-conquest troop selection to the map without inline amount controls", async () => {
    const state = selectedState();
    state.phase = "attack";
    state.pendingConquestMove = { sourceTerritoryId: "B2", targetTerritoryId: "B1", defenderId: "p2", minimumUnits: 3, maximumUnits: 7 };
    for (const [Component, width, props] of [
      [Sidebar, 42, { layoutMode: "wide" }],
      [CompactInspector, 100, {}],
    ] as const) {
      const setup = await testRender(
        React.createElement(Component, {
          mapBundle: ironreachBundle, state, myPlayerId: "p1", selectedTerritoryId: "B2", targetTerritoryId: "B1", phase: "attack",
          pendingConquestMove: state.pendingConquestMove,
          onDeploy: () => {}, onAttack: () => {}, onFortify: () => {}, onSkipPhase: () => {}, onEndTurn: () => {}, ...props,
        }),
        { width, height: 38 }
      );
      await act(async () => { await setup.renderOnce(); });
      const frame = setup.captureCharFrame();
      expect(frame).toContain("MOVE TROOPS…");
      expect(frame).not.toContain("Move 5 / 7");
      expect(frame).not.toContain("$");
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("keeps the compact inspector readable at 105 columns", async () => {
    const state = selectedState();
    state.players[0].name = "Commander Alexandria With An Extremely Long Name";
    const setup = await testRender(
      React.createElement(CompactInspector, {
        state, myPlayerId: "p1", selectedTerritoryId: "B2", targetTerritoryId: null, phase: "deployment",
        onDeploy: () => {}, onAttack: () => {}, onFortify: () => {}, onSkipPhase: () => {}, onEndTurn: () => {},
      }),
      { width: 105, height: 38 }
    );
    await act(async () => { await setup.renderOnce(); });
    const frame = setup.captureCharFrame();
    const inspectorLine = frame.split("\n").find((line: string) => line.includes("[B2]"))!;
    expect(inspectorLine).toContain("Commander Ale…");
    expect(inspectorLine).toContain("(7)");
    expect(inspectorLine).toContain("+");
    expect(inspectorLine).not.toContain("$ ");
    await act(async () => { setup.renderer.destroy(); });
  });

  for (const columns of [130, 140, 180, 200, 220, 240]) {
    it(`keeps selected-territory lanes distinct at ${columns} columns`, async () => {
      const layoutMode = getLayoutMode(columns, 55);
      const width = getSidebarWidthForTerminal(columns, 55);
      const setup = await testRender(
        React.createElement(Sidebar, {
          mapBundle: ironreachBundle,
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
          mapBundle: ironreachBundle,
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

  it("renders sender names once and intact in every sender-bearing chronicle event", async () => {
    const events: Array<{ event: GameEvent; expected: string }> = [
      { event: { type: "units_deployed", playerId: "p1", territoryId: "B2", count: 3, remainingReinforcements: 2, timestamp: 1 }, expected: "Commander Alexandria reinforced The Marches" },
      { event: { type: "attack_resolved", attackerId: "p1", defenderId: "p2", sourceTerritoryId: "B2", targetTerritoryId: "B1", attackerRolls: [6], defenderRolls: [1], attackerLosses: 0, defenderLosses: 1, conquered: true, unitsMoved: 2, timestamp: 2 }, expected: "Commander Alexandria captured Sunken Pass from Blair!" },
      { event: { type: "units_fortified", playerId: "p1", sourceTerritoryId: "B2", targetTerritoryId: "B1", units: 2, timestamp: 3 }, expected: "Commander Alexandria fortified 2 armies to Sunken Pass" },
      { event: { type: "player_eliminated", playerId: "p1", eliminatedBy: "p2", timestamp: 4 }, expected: "Commander Alexandria has fallen in battle!" },
      { event: { type: "chat_message", senderId: "p1", senderName: "Commander Alexandria", channel: "game", text: "The line holds.", timestamp: 5 }, expected: "Commander Alexandria: \"The line holds.\"" },
    ];

    for (const { event, expected } of events) {
      const setup = await testRender(
        React.createElement(EventLog, {
          mapBundle: ironreachBundle,
          events: [event], chatOpen: false, players, onToggleChat: () => {}, onSendChat: () => {}, layoutMode: "wide",
        }),
        { width: 120, height: 10 }
      );
      await act(async () => { await setup.renderOnce(); });
      const frame = setup.captureCharFrame();
      const occurrences = frame.split("Commander Alexandria").length - 1;
      expect(occurrences).toBe(1);
      expect(frame).toContain(expected);
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("keeps departed players named throughout the historical chronicle", async () => {
    const departedPlayer: Player = {
      id: "usr_departed",
      name: "Baroness Ilyra",
      colorIndex: 2,
      colorHex: "#9966ff",
      connected: false,
      isAlive: false,
      ready: false,
    };
    const events: GameEvent[] = [
      { type: "player_joined", player: departedPlayer, timestamp: 1 },
      { type: "units_deployed", playerId: departedPlayer.id, territoryId: "B2", count: 3, remainingReinforcements: 2, timestamp: 2 },
      { type: "player_left", playerId: departedPlayer.id, timestamp: 3 },
    ];
    const setup = await testRender(
      React.createElement(EventLog, {
          mapBundle: ironreachBundle,
        events, chatOpen: false, players: [players[0]], onToggleChat: () => {}, onSendChat: () => {}, layoutMode: "wide",
      }),
      { width: 120, height: 10 }
    );
    await act(async () => { await setup.renderOnce(); });
    const frame = setup.captureCharFrame();
    expect(frame).toContain("Baroness Ilyra reinforced The Marches");
    expect(frame).toContain("Lord Baroness Ilyra retreated from the council");
    expect(frame).not.toContain("usr_departed");
    await act(async () => { setup.renderer.destroy(); });
  });

  for (const [columns, rows] of [[140, 45], [200, 55]] as const) {
    it(`opens chat in the actual ${columns}x${rows} App without stealing map rows`, async () => {
      const map = columns === 140 ? MAP_GRID_IRONREACH_COMPACT : MAP_GRID_IRONREACH_WIDE;
      const raster = getMapRenderLayout(map);
      expect(raster.height).toBe(columns === 140 ? 30 : 36);
      const setup = await testRender(
        React.createElement(App, { client: activeClient(), terminalDimensions: { columns, rows } }),
        { width: columns, height: rows }
      );
      await act(async () => { await setup.renderOnce(); });
      // Every test renderer has one parser listener. Wait for App's
      // useKeyboard effect to register its second listener before dispatching
      // the shortcut; React can defer that effect during a full-suite run.
      await setup.waitFor(() => (setup.renderer.keyInput as any).listenerCount("keypress") >= 2);
      const closedFrame = setup.captureCharFrame();
      const closedLogLine = closedFrame.split("\n").findIndex((line: string) => line.includes("! EVENT LOG / CHAT"));
      expect(closedLogLine).toBeGreaterThan(0);
      const closedRaster = findNodeWithSize(setup.renderer.root, raster.width, raster.height);
      expect(closedRaster).not.toBeNull();
      // The raster's bordered World Map parent provides the real App pane,
      // rather than a synthetic test rectangle. Two rows/columns are border.
      expect(closedRaster.parent.width - 2).toBeGreaterThanOrEqual(raster.width);
      expect(closedRaster.parent.height - 2).toBeGreaterThanOrEqual(raster.height);
      const closedPane = { width: closedRaster.parent.width, height: closedRaster.parent.height };

      await act(async () => {
        // Exercise App's registered useKeyboard callback directly. Mock raw
        // input is global across OpenTUI test renderers and flakes when the
        // full suite has several renderer lifecycles in flight.
        (setup.renderer.keyInput as any).emit("keypress", { name: "c" });
        await setup.renderOnce();
      });
      const openFrame = await setup.waitForFrame((frame: string) => frame.includes("Chat:"));
      const openLines = openFrame.split("\n");
      const openLogLine = openLines.findIndex((line: string) => line.includes("! EVENT LOG / CHAT"));
      expect(openFrame).toContain("Chat:");
      expect(openFrame).toContain("WORLD MAP");
      const openRaster = findNodeWithSize(setup.renderer.root, raster.width, raster.height);
      expect(openRaster).not.toBeNull();
      expect(openRaster.parent.width - 2).toBeGreaterThanOrEqual(raster.width);
      expect(openRaster.parent.height - 2).toBeGreaterThanOrEqual(raster.height);
      expect({ width: openRaster.parent.width, height: openRaster.parent.height }).toEqual(closedPane);
      // The EventLog keeps its outer height, so its top edge and the map pane
      // immediately above it remain fixed when the input is focused.
      expect(openLogLine).toBe(closedLogLine);
      // captureCharFrame terminates with one final newline.
      expect(openLines).toHaveLength(rows + 1);
      // Army badges stay visible even when the compact raster drops a name.
      expect(openLines.slice(0, openLogLine).some((line: string) => /\[\d+\]/.test(line))).toBe(true);
      await act(async () => { setup.renderer.destroy(); });
    });
  }

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
