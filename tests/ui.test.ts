import { getMap } from "../packages/map-engine/src/registry.js";
const ironreachBundle = getMap("ironreach")!;
import { describe, expect, it } from "bun:test";
import { formatEvent } from "../apps/client/src/ui/EventLog.js";
import {
  MAP_IRONREACH,
  MAP_GRID_IRONREACH,
  MAP_GRID_IRONREACH_COMPACT,
  MAP_GRID_IRONREACH_WIDE,
  getGeographyBoundingBox,
  getTerritoryAt,
} from "../packages/map-engine/src/index.js";
import { createInitialGameState, finalizeMatch } from "../packages/game-core/src/index.js";
import type { GameEvent, GameState, Player } from "../packages/protocol/src/index.js";

function renderedMapBounds(map: typeof MAP_GRID_IRONREACH_COMPACT | typeof MAP_GRID_IRONREACH_WIDE) {
  const bbox = getGeographyBoundingBox(map);
  return { width: bbox.width, height: bbox.height, sourceX: bbox.minX, sourceY: bbox.minY };
}

function isRenderedMapRaster(node: any): boolean {
  return [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE].some((map) => {
    const bounds = renderedMapBounds(map);
    return node && node.width === bounds.width && node.height === bounds.height;
  });
}

function createFinishedGameState(): GameState {
  const players: Player[] = [
    { id: "p1", name: "Alice", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true },
    { id: "p2", name: "Bob", colorIndex: 1, colorHex: "#ff4444", connected: true, isAlive: true, ready: true },
  ];
  const state = createInitialGameState("finished-game", "DONE", players, MAP_GRID_IRONREACH, 3);
  for (const territory of Object.values(state.territories)) {
    territory.ownerId = "p1";
  }
  return finalizeMatch(state, "p1", "conquest", 60000).state;
}

describe("ui: EventLog historical military chronicles", () => {
  const testPlayers: Player[] = [
    {
      id: "p1",
      name: "Alice",
      colorIndex: 0,
      colorHex: "#00d2ff",
      connected: true,
      isAlive: true,
      ready: true,
    },
    {
      id: "p2",
      name: "Bob",
      colorIndex: 1,
      colorHex: "#ff4444",
      connected: true,
      isAlive: true,
      ready: true,
    },
  ];

  it("formats territory capture as a triumphal military chronicle", () => {
    const event: GameEvent = {
      type: "attack_resolved",
      attackerId: "p1",
      defenderId: "p2",
      sourceTerritoryId: "frostfell",
      targetTerritoryId: "highwatch",
      attackerRolls: [6, 5],
      defenderRolls: [3],
      attackerLosses: 0,
      defenderLosses: 1,
      conquered: true,
      unitsMoved: 2,
      timestamp: Date.now(),
    };

    const formatted = formatEvent(event, testPlayers, new Map(), ironreachBundle);
    expect(formatted.text).toBe("⚔ Alice captured Highwatch from Bob!");
    expect(formatted.color).toBe("#ff3399");
  });

  it("formats combat defense as a tactical battle chronicle", () => {
    const event: GameEvent = {
      type: "attack_resolved",
      attackerId: "p1",
      defenderId: "p2",
      sourceTerritoryId: "frostfell",
      targetTerritoryId: "highwatch",
      attackerRolls: [4, 2],
      defenderRolls: [5],
      attackerLosses: 1,
      defenderLosses: 0,
      conquered: false,
      timestamp: Date.now(),
    };

    const formatted = formatEvent(event, testPlayers, new Map(), ironreachBundle);
    expect(formatted.text).toBe("🎲 Battle at Highwatch: Alice vs Bob (-1 att, -0 def)");
    expect(formatted.color).toBe("#f97316");
  });

  it("formats troop deployment as reinforcements chronicle", () => {
    const event: GameEvent = {
      type: "units_deployed",
      playerId: "p1",
      territoryId: "frostfell",
      count: 3,
      remainingReinforcements: 0,
      timestamp: Date.now(),
    };

    const formatted = formatEvent(event, testPlayers, new Map(), ironreachBundle);
    expect(formatted.text).toBe("🛡 Alice reinforced Frostfell (+3 armies)");
    expect(formatted.color).toBe("#00ff66");
  });

  it("formats fortification as strategic troop movement chronicle", () => {
    const event: GameEvent = {
      type: "units_fortified",
      playerId: "p1",
      sourceTerritoryId: "frostfell",
      targetTerritoryId: "iron_hollow",
      units: 2,
      timestamp: Date.now(),
    };

    const formatted = formatEvent(event, testPlayers, new Map(), ironreachBundle);
    expect(formatted.text).toBe("🛡 Alice fortified 2 armies to Iron Hollow");
    expect(formatted.color).toBe("#9966ff");
  });

  it("formats player elimination as a solemn death chronicle", () => {
    const event: GameEvent = {
      type: "player_eliminated",
      playerId: "p2",
      eliminatedBy: "p1",
      timestamp: Date.now(),
    };

    const formatted = formatEvent(event, testPlayers, new Map(), ironreachBundle);
    expect(formatted.text).toBe("💀 Bob has fallen in battle!");
    expect(formatted.color).toBe("#ff4444");
  });

  it("formats victory as realm conquest chronicle", () => {
    const event: GameEvent = {
      type: "game_won",
      winnerId: "p1",
      winnerName: "Alice",
      timestamp: Date.now(),
    };

    const formatted = formatEvent(event, testPlayers, new Map(), ironreachBundle);
    expect(formatted.text).toBe("👑 Alice has conquered the entire realm!");
    expect(formatted.color).toBe("#ffaa00");
  });
});

describe("ui: Ironreach realm map schema & layout", () => {
  it("contains all 20 canonical Ironreach territories across 6 sectors", () => {
    expect(MAP_IRONREACH.sectors.length).toBe(6);
    expect(MAP_IRONREACH.territories.length).toBe(20);

    const territoryIds = MAP_IRONREACH.territories.map((t) => t.id);
    const expected = [
      "A1", "A2", "A3",
      "B1", "B2", "B3",
      "C1", "C2", "C3", "C4",
      "D1", "D2", "D3", "D4",
      "E1", "E2", "E3",
      "F1", "F2", "F3",
    ];
    for (const id of expected) {
      expect(territoryIds).toContain(id);
    }
  });

  it("ensures all territory label positions sit nicely within canvas dimensions", () => {
    for (const t of MAP_IRONREACH.territories) {
      expect(t.labelPos.x).toBeGreaterThanOrEqual(0);
      expect(t.labelPos.x).toBeLessThan(MAP_IRONREACH.width);
      expect(t.labelPos.y).toBeGreaterThanOrEqual(0);
      expect(t.labelPos.y).toBeLessThan(MAP_IRONREACH.height);
    }
  });
});

describe("ui: Cellular MapCanvas & Refitted UI components", () => {
  const testPlayers: Player[] = [
    {
      id: "p1",
      name: "Alex",
      colorIndex: 0,
      colorHex: "#00ff66",
      connected: true,
      isAlive: true,
      ready: true,
    },
    {
      id: "p2",
      name: "Blair",
      colorIndex: 1,
      colorHex: "#00d2ff",
      connected: true,
      isAlive: true,
      ready: true,
    },
    {
      id: "p3",
      name: "Casey",
      colorIndex: 2,
      colorHex: "#38bdf8",
      connected: true,
      isAlive: true,
      ready: true,
    },
    {
      id: "p4",
      name: "Drew",
      colorIndex: 3,
      colorHex: "#ff4444",
      connected: true,
      isAlive: true,
      ready: true,
    },
  ];

  it("keeps an owned attack source selected when an enemy is not adjacent", async () => {
    const { resolveTerritoryClick } = await import("../apps/client/src/ui/MapCanvas.js");
    const territories: any = {
      congo: { id: "congo", ownerId: "p1", neighbors: ["east_africa"], units: 4 },
      east_africa: { id: "east_africa", ownerId: "p2", neighbors: ["congo", "nile"], units: 2 },
      nile: { id: "nile", ownerId: "p2", neighbors: ["east_africa"], units: 2 },
    };

    expect(resolveTerritoryClick("attack", "congo", null, "nile", territories, "p1", ["east_africa"]))
      .toBe("invalid-attack-target");
    expect(resolveTerritoryClick("attack", "congo", null, "east_africa", territories, "p1", ["east_africa"]))
      .toBe("target");
  });

  it("explains how to choose an attack source when the selected territory is enemy-owned", async () => {
    const { getAttackSourceError } = await import("../apps/client/src/ui/App.js");
    expect(getAttackSourceError("Nile Valley"))
      .toBe("You don't control Nile Valley. Select a territory you own to attack from.");
  });

  it("makes phase confirmation explicit for both keyboard and repeated action clicks", async () => {
    const { getPhaseActionConfirmationMessage } = await import("../apps/client/src/ui/App.js");
    expect(getPhaseActionConfirmationMessage("skip-attack"))
      .toBe("Skip attack? Enter confirms; Esc cancels.");
    expect(getPhaseActionConfirmationMessage("end-turn"))
      .toBe("End turn? Enter confirms; Esc cancels.");
  });

  it("requires Enter after E before skipping or ending a phase, and Esc or another action cancels", async () => {
    // @ts-ignore runtime-only OpenTUI modules
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore runtime-only OpenTUI modules
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore runtime-only OpenTUI modules
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { App } = await import("../apps/client/src/ui/App.js");
    const players: Player[] = testPlayers.slice(0, 2);

    const exercise = async (phase: "attack" | "fortify") => {
      const state = createInitialGameState("confirm", "CONF", players, MAP_GRID_IRONREACH, 2);
      state.phase = phase;
      state.activePlayerIndex = 0;
      let skipped = 0;
      let ended = 0;
      const client: any = {
        state, myPlayerId: "p1", status: "connected", roomCode: "CONF",
        onSnapshot: () => () => {}, onEvent: () => () => {}, onStatusChange: () => () => {}, onError: () => () => {},
        sendChat: () => {}, deploy: () => {}, attack: () => {}, fortify: () => {}, ready: () => {},
        skipPhase: () => { skipped++; }, endTurn: () => { ended++; },
      };
      const setup = await testRender(
        React.createElement(App, { client, terminalDimensions: { columns: 105, rows: 38 } }),
        { width: 105, height: 38 },
      );
      await act(async () => { await setup.renderOnce(); });
      await setup.waitFor(() => (setup.renderer.keyInput as any).listenerCount("keypress") >= 2);
      const key = async (name: string) => {
        await act(async () => {
          (setup.renderer.keyInput as any).emit("keypress", { name: name === "enter" ? "return" : name });
          await setup.renderOnce();
        });
      };

      await key("e");
      expect(skipped + ended).toBe(0);
      await key("a");
      await key("e");
      expect(skipped + ended).toBe(0);
      await key("escape");
      await key("e");
      expect(skipped + ended).toBe(0);
      await key("enter");
      expect(phase === "attack" ? skipped : ended).toBe(1);
      await act(async () => { setup.renderer.destroy(); });
    };

    await exercise("attack");
    await exercise("fortify");
  });

  it("makes an owned territory the attack source after an enemy-first click and preserves fortify targets", async () => {
    const { resolveTerritoryClick } = await import("../apps/client/src/ui/MapCanvas.js");
    const territories: any = {
      source: { id: "source", ownerId: "p1", neighbors: ["friendly", "enemy"], units: 4 },
      friendly: { id: "friendly", ownerId: "p1", neighbors: ["source"], units: 2 },
      enemy: { id: "enemy", ownerId: "p2", neighbors: ["source"], units: 2 },
    };

    expect(resolveTerritoryClick("attack", "enemy", null, "source", territories, "p1", ["source"]))
      .toBe("select");
    expect(resolveTerritoryClick("fortify", "source", null, "friendly", territories, "p1", ["friendly", "enemy"]))
      .toBe("target");
  });

  it("renders MapCanvas as a 2D cellular grid without rectangular territory boxes", async () => {
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");
    const el: any = MapCanvas({
      mapBundle: ironreachBundle,
      territories: {},
      players: testPlayers,
      myPlayerId: "p1",
      phase: "deployment",
      selectedTerritoryId: "C2",
      targetTerritoryId: null,
      onSelectTerritory: () => {},
      onSelectTarget: () => {},
      onDeselect: () => {},
    });

    expect(el.type).toBe("box");
    expect(el.props.title).toContain("WORLD MAP");
    expect(el.props.title).toContain("Territories • Connections • Empires");
    expect(el.props.style.width).toBe("100%");
    expect(el.props.style.height).toBe("100%");

    // Inner container holds the lines
    const innerBox = el.props.children;
    expect(innerBox.type).toBe("box");
    const lines = innerBox.props.children;
    expect(lines.length).toBe(renderedMapBounds(MAP_GRID_IRONREACH_COMPACT).height);

    // Each line is a <text> element with styled <span> runs
    for (const line of lines) {
      expect(line.type).toBe("text");
    }
  });

  it("renders muted terrain styling in lobby phase and vibrant owner colors in active game", async () => {
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");

    // 1. Lobby phase: unclaimed interiors retain a subdued regional wash.
    const lobbyEl: any = MapCanvas({
      mapBundle: ironreachBundle,
      territories: {},
      players: testPlayers,
      myPlayerId: "p1",
      phase: "lobby",
      selectedTerritoryId: null,
      targetTerritoryId: null,
      onSelectTerritory: () => {},
      onSelectTarget: () => {},
      onDeselect: () => {},
    });

    const lobbyInnerBox = lobbyEl.props.children;
    const lobbyLines = lobbyInnerBox.props.children;
    let foundLobbyMuted = false;
    for (const line of lobbyLines) {
      for (const span of line.props.children) {
        if (span.props.bg && span.props.bg !== "#080f1a" && span.props.bg !== "#0f172a") {
          foundLobbyMuted = true;
          break;
        }
      }
      if (foundLobbyMuted) break;
    }
    expect(foundLobbyMuted).toBe(true);

    // 2. Active game phase: territory owned by p1 uses its configured color.
    const activeEl: any = MapCanvas({
      mapBundle: ironreachBundle,
      territories: {
        A1: {
          id: "A1",
          name: "Ironwatch",
          sectorId: "nw_green",
          ownerId: "p1",
          units: 3,
          neighbors: ["A2"],
          position: { x: 0, y: 0 },
        },
      },
      players: testPlayers,
      myPlayerId: "p1",
      phase: "deployment",
      selectedTerritoryId: null,
      targetTerritoryId: null,
      onSelectTerritory: () => {},
      onSelectTarget: () => {},
      onDeselect: () => {},
    });

    const activeInnerBox = activeEl.props.children;
    const activeLines = activeInnerBox.props.children;
    let foundActiveVibrant = false;
    for (const line of activeLines) {
      for (const span of line.props.children) {
        if (span.props.fg === testPlayers[0].colorHex) {
          foundActiveVibrant = true;
          break;
        }
      }
      if (foundActiveVibrant) break;
    }
    expect(foundActiveVibrant).toBe(true);
  });

  it("renders Sidebar with 4 cards matching ref.png", async () => {
    const { Sidebar } = await import("../apps/client/src/ui/Sidebar.js");
    const el: any = Sidebar({
      mapBundle: ironreachBundle,
      state: null,
      myPlayerId: "p1",
      selectedTerritoryId: "C2",
      targetTerritoryId: null,
      onDeploy: () => {},
      onAttack: () => {},
      onFortify: () => {},
      onSkipPhase: () => {},
      onEndTurn: () => {},
    });

    expect(el.type).toBe("box");
    expect(el.props.style.width).toBe("100%");
    expect(el.props.style.height).toBe("100%");

    const cards = el.props.children;
    expect(cards.length).toBe(4);

    // Card 1: ! PLAYERS
    expect(cards[0].props.title).toBe("! PLAYERS");
    // Card 2: ! SELECTED TERRITORY
    expect(cards[1].props.title).toBe("! SELECTED TERRITORY");
    // Card 3: ! ACTIONS
    expect(cards[2].props.title).toBe("! ACTIONS");
    // Card 4: ! REALM & SESSION INTEL
    expect(cards[3].props.title).toBe("! REALM & SESSION INTEL");
  });

  it("renders Header with conquest.sh banner, turn, active player and quote", async () => {
    const { Header } = await import("../apps/client/src/ui/Header.js");
    const el: any = Header({
      roomCode: "H5CM",
      turnNumber: 3,
      activePlayer: testPlayers[0],
      phase: "deployment",
      pendingReinforcements: 5,
      connectionStatus: "connected",
      isMyTurn: true,
    });

    expect(el.type).toBe("box");
    const [topBar, mainBox] = el.props.children;
    expect(topBar).toBeDefined();
    expect(mainBox).toBeDefined();
    expect(mainBox.props.border).toBe(true);
  });

  it("renders Footer with pills and slogan", async () => {
    const { Footer } = await import("../apps/client/src/ui/Footer.js");
    const el: any = Footer({
      toastMessage: null,
      toastType: "info",
      activeTab: 1,
    });

    expect(el.type).toBe("box");
    const [leftPills, rightSlogan] = el.props.children;
    expect(leftPills.props.children.length).toBe(5);
    expect(rightSlogan).toBeDefined();
  });

  it("renders TerminalSizeWarning with double amber border, header, subtitle, and current dimensions", async () => {
    const { TerminalSizeWarning } = await import("../apps/client/src/ui/App.js");
    const el: any = TerminalSizeWarning({
      columns: 80,
      rows: 24,
    });

    expect(el.type).toBe("box");
    const innerBox = el.props.children;
    expect(innerBox.type).toBe("box");
    expect(innerBox.props.border).toBe(true);
    expect(innerBox.props.borderStyle).toBe("double");
    expect(innerBox.props.borderColor).toBe("#f59e0b");

    const [header, subtitle, dimensions, prompt, overrideBox] = innerBox.props.children;
    expect(header.type).toBe("text");
    expect(header.props.children.props.children).toBe("⚠️  TERMINAL WINDOW TOO SMALL");
    expect(subtitle.type).toBe("text");
    expect(subtitle.props.children).toBe(
      "This map requires at least 98 columns × 38 rows for its smallest authored render."
    );
    expect(dimensions.type).toBe("text");
    expect(dimensions.props.children).toBe("Current: 80 cols × 24 rows");
    expect(prompt.type).toBe("text");
    expect(prompt.props.children).toBe(
      "Please expand or zoom out your terminal window to resume play."
    );
    expect(overrideBox.type).toBe("box");
  });

  it("App displays size warning on small terminal and renders game when overridden or sufficiently sized", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { App } = await import("../apps/client/src/ui/App.js");

    let exited = false;
    const mockClient: any = {
      state: null,
      myPlayerId: "p1",
      status: "connected",
      roomCode: "H5CM",
      onSnapshot: () => () => {},
      onEvent: () => () => {},
      onStatusChange: () => () => {},
      onError: () => () => {},
    };

    // 1. Small dimensions (80x24) -> Shows warning
    const setupSmall = await testRender(
      React.createElement(App, {
        client: mockClient,
        onExit: () => {
          exited = true;
        },
        terminalDimensions: { columns: 80, rows: 24 },
      }),
      {}
    );
    await act(async () => {
      await setupSmall.renderOnce();
    });
    const frameSmall = setupSmall.captureCharFrame();
    expect(frameSmall).toContain("TERMINAL WINDOW TOO SMALL");
    expect(frameSmall).toContain("80 cols × 24 rows");

    // 2. Press 'i' / any key -> Overrides warning and renders main game UI
    await act(async () => {
      setupSmall.mockInput.pressKey("i");
    });
    await act(async () => {
      await setupSmall.renderOnce();
    });
    const frameOverridden = setupSmall.captureCharFrame();
    expect(frameOverridden).toContain("CONQUEST.SH");
    expect(frameOverridden).not.toContain("IRON FRONT");
    expect(frameOverridden).not.toContain("TERMINAL WINDOW TOO SMALL");
    await act(async () => {
      setupSmall.renderer.destroy();
    });

    // 3. Non-TTY / undefined / 0 dimensions -> Renders normal game UI directly without warning
    const setupZero = await testRender(
      React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: 0, rows: 0 },
      }),
      {}
    );
    await act(async () => {
      await setupZero.renderOnce();
    });
    const frameZero = setupZero.captureCharFrame();
    expect(frameZero).toContain("CONQUEST.SH");
    expect(frameZero).not.toContain("IRON FRONT");
    expect(frameZero).not.toContain("TERMINAL WINDOW TOO SMALL");
    await act(async () => {
      setupZero.renderer.destroy();
    });

    // 4. Large dimensions (120x40) -> Renders normal game UI directly
    const setupLarge = await testRender(
      React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: 120, rows: 40 },
      }),
      {}
    );
    await act(async () => {
      await setupLarge.renderOnce();
    });
    const frameLarge = setupLarge.captureCharFrame();
    expect(frameLarge).toContain("CONQUEST.SH");
    expect(frameLarge).not.toContain("IRON FRONT");
    expect(frameLarge).not.toContain("TERMINAL WINDOW TOO SMALL");
    await act(async () => {
      setupLarge.renderer.destroy();
    });
  });

  it("renders Results before the 85x34 tactical-map size warning for a finished game", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { App } = await import("../apps/client/src/ui/App.js");
    const state = createFinishedGameState();
    const client: any = {
      state,
      myPlayerId: "p1",
      status: "connected",
      roomCode: state.roomCode,
      onSnapshot: () => () => {},
      onEvent: () => () => {},
      onStatusChange: () => () => {},
      onError: () => () => {},
      requestRematch: () => {},
      sendChat: () => {},
    };

    const setup = await testRender(
      React.createElement(App, {
        client,
        terminalDimensions: { columns: 85, rows: 34 },
      }),
      { width: 85, height: 34 }
    );
    await act(async () => { await setup.renderOnce(); });

    const frame = setup.captureCharFrame();
    expect(frame).toContain("VICTORY ACHIEVED");
    expect(frame).toContain("FINAL STANDINGS");
    expect(frame).not.toContain("TERMINAL WINDOW TOO SMALL");
    await act(async () => { setup.renderer.destroy(); });
  });

  it("routes finished-match H and Q actions correctly from interactive and direct-entry shells", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { ClientShell } = await import("../apps/client/src/ui/ClientShell.js");

    const makeClient = () => {
      const state = createFinishedGameState();
      const client: any = {
        state,
        myPlayerId: "p1",
        status: "connected",
        roomCode: state.roomCode,
        playerName: "Alice",
        serverName: "Test Server",
        wsUrl: "ws://localhost:4000",
        getCachedSession: () => null,
        onSnapshot: () => () => {},
        onStatusChange: () => () => {},
        onError: () => () => {},
        onEvent: () => () => {},
        leaveRoomCalls: 0,
        leaveRoom() { this.leaveRoomCalls += 1; },
        quickMatch: () => {},
        requestRematch: () => {},
        sendChat: () => {},
      };
      return client;
    };

    const renderShell = async (client: any, directEntry: boolean, onExit: () => void) => {
      const setup = await testRender(
        React.createElement(ClientShell, {
          client,
          ...(directEntry ? { initialRoomCode: "DONE" } : {}),
          onExit,
          terminalDimensions: { columns: 120, rows: 40 },
        }),
        { width: 120, height: 40 }
      );
      await act(async () => { await setup.renderOnce(); });
      return setup;
    };

    for (const directEntry of [false, true]) {
      const homeClient = makeClient();
      let homeExitCalls = 0;
      const homeSetup = await renderShell(homeClient, directEntry, () => { homeExitCalls += 1; });
      if (!directEntry) {
        await act(async () => { homeSetup.mockInput.pressKey("1"); });
        await act(async () => { await homeSetup.renderOnce(); });
      }
      expect(homeSetup.captureCharFrame()).toContain("VICTORY ACHIEVED");
      await act(async () => { homeSetup.mockInput.pressKey("h"); });
      await act(async () => { await homeSetup.renderOnce(); });
      expect(homeClient.leaveRoomCalls).toBe(1);
      expect(homeExitCalls).toBe(0);
      expect(homeSetup.captureCharFrame()).toContain("CONQUEST.SH");
      await act(async () => { homeSetup.renderer.destroy(); });

      const quitClient = makeClient();
      let quitExitCalls = 0;
      const quitSetup = await renderShell(quitClient, directEntry, () => { quitExitCalls += 1; });
      if (!directEntry) {
        await act(async () => { quitSetup.mockInput.pressKey("1"); });
        await act(async () => { await quitSetup.renderOnce(); });
      }
      expect(quitSetup.captureCharFrame()).toContain("VICTORY ACHIEVED");
      await act(async () => { quitSetup.mockInput.pressKey("q"); });
      await act(async () => { await quitSetup.renderOnce(); });
      expect(quitExitCalls).toBe(1);
      expect(quitClient.leaveRoomCalls).toBe(0);
      await act(async () => { quitSetup.renderer.destroy(); });
    }
  });

  it("mouseEventToMapCell accurately extracts target coordinates and computes map relative offsets", async () => {
    const { mouseEventToMapCell } = await import("../apps/client/src/ui/MapCanvas.js");

    expect(mouseEventToMapCell(null)).toBeNull();
    expect(mouseEventToMapCell({})).toBeNull();

    // Coordinate conversion with target.x / target.y
    const eventWithX = {
      x: 18,
      y: 25,
      currentTarget: { x: 10, y: 20 },
    };
    expect(mouseEventToMapCell(eventWithX)).toEqual({ x: 8, y: 5 });

    // Fallback to screenX / screenY
    const eventWithScreenX = {
      x: 25,
      y: 35,
      currentTarget: { screenX: 5, screenY: 15 },
    };
    expect(mouseEventToMapCell(eventWithScreenX)).toEqual({ x: 20, y: 20 });
  });

  it("MapCanvas mouse regression: correctly maps global screen hover and click coordinates to map cells when offset below a header", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");

    let hoveredTerritoryId: string | null = null;
    let selectedTerritoryId: string | null = null;

    const headerHeight = 5;

    // Locate the inner map content box to determine screen origins
    function findInnerMapBox(node: any): any {
      if (isRenderedMapRaster(node)) {
        return node;
      }
      for (const child of node?.getChildren?.() || []) {
        const found = findInnerMapBox(child);
        if (found) return found;
      }
      return null;
    }

    // --- 1. Compact Viewport Regression ---
    const setupCompact = await testRender(
      React.createElement(
        "box",
        { flexDirection: "column", style: { width: 150, height: 45 } },
        React.createElement("box", { style: { width: 150, height: headerHeight } }),
        React.createElement(MapCanvas, {
          mapBundle: ironreachBundle,
          territories: {},
          players: testPlayers,
          myPlayerId: "p1",
          phase: "deployment",
          renderProfile: "compact",
          selectedTerritoryId: null,
          targetTerritoryId: null,
          onHoverTerritory: (tid: string | null) => {
            hoveredTerritoryId = tid;
          },
          onSelectTerritory: (tid: string) => {
            selectedTerritoryId = tid;
          },
          onSelectTarget: () => {},
          onDeselect: () => {},
        })
      ),
      { width: 150, height: 45 }
    );

    await act(async () => {
      await setupCompact.renderOnce();
    });

    const innerMapCompact = findInnerMapBox(setupCompact.renderer.root);
    expect(innerMapCompact).not.toBeNull();
    const compactOriginX = typeof innerMapCompact?.screenX === "number" ? innerMapCompact.screenX : 1;
    const compactOriginY = typeof innerMapCompact?.screenY === "number" ? innerMapCompact.screenY : headerHeight + 1;
    expect(compactOriginY).toBeGreaterThanOrEqual(headerHeight);

    // 1a. Compact: Hover A1
    const a1Compact = MAP_GRID_IRONREACH_COMPACT.territories.find((t) => t.id === "A1")!;
    const compactBounds = renderedMapBounds(MAP_GRID_IRONREACH_COMPACT);
    const cellA1Compact = { x: a1Compact.labelPos.x - compactBounds.sourceX, y: a1Compact.labelPos.y - compactBounds.sourceY };
    expect(getTerritoryAt(cellA1Compact.x, cellA1Compact.y, MAP_GRID_IRONREACH_COMPACT)).toBe("A1");
    await act(async () => {
      await setupCompact.mockMouse.moveTo(cellA1Compact.x + compactOriginX, cellA1Compact.y + compactOriginY);
    });
    expect(hoveredTerritoryId as string | null).toBe("A1");

    // 1b. Compact: Hover & Click D2
    const d2Compact = MAP_GRID_IRONREACH_COMPACT.territories.find((t) => t.id === "D2")!;
    const cellD2Compact = { x: d2Compact.labelPos.x - compactBounds.sourceX, y: d2Compact.labelPos.y - compactBounds.sourceY };
    expect(getTerritoryAt(d2Compact.labelPos.x, d2Compact.labelPos.y, MAP_GRID_IRONREACH_COMPACT)).toBe("D2");
    await act(async () => {
      await setupCompact.mockMouse.moveTo(cellD2Compact.x + compactOriginX, cellD2Compact.y + compactOriginY);
    });
    expect(hoveredTerritoryId as string | null).toBe("D2");
    await act(async () => {
      await setupCompact.mockMouse.click(cellD2Compact.x + compactOriginX, cellD2Compact.y + compactOriginY);
    });
    expect(selectedTerritoryId as string | null).toBe("D2");

    // 1c. Compact: Water
    expect(getTerritoryAt(0, 0, MAP_GRID_IRONREACH_COMPACT)).toBeNull();
    await act(async () => {
      await setupCompact.mockMouse.moveTo(0 + compactOriginX, 0 + compactOriginY);
    });
    expect(hoveredTerritoryId as string | null).toBeNull();

    await act(async () => {
      setupCompact.renderer.destroy();
    });

    // --- 2. Wide Viewport Regression ---
    hoveredTerritoryId = null;
    selectedTerritoryId = null;

    const setupWide = await testRender(
      React.createElement(
        "box",
        { flexDirection: "column", style: { width: 160, height: 50 } },
        React.createElement("box", { style: { width: 160, height: headerHeight } }),
        React.createElement(MapCanvas, {
          mapBundle: ironreachBundle,
          territories: {},
          players: testPlayers,
          myPlayerId: "p1",
          phase: "deployment",
          renderProfile: "wide",
          selectedTerritoryId: null,
          targetTerritoryId: null,
          onHoverTerritory: (tid: string | null) => {
            hoveredTerritoryId = tid;
          },
          onSelectTerritory: (tid: string) => {
            selectedTerritoryId = tid;
          },
          onSelectTarget: () => {},
          onDeselect: () => {},
        })
      ),
      { width: 160, height: 50 }
    );

    await act(async () => {
      await setupWide.renderOnce();
    });

    const innerMapWide = findInnerMapBox(setupWide.renderer.root);
    expect(innerMapWide).not.toBeNull();
    const wideOriginX = typeof innerMapWide?.screenX === "number" ? innerMapWide.screenX : 1;
    const wideOriginY = typeof innerMapWide?.screenY === "number" ? innerMapWide.screenY : headerHeight + 1;
    expect(wideOriginY).toBeGreaterThanOrEqual(headerHeight);

    // 2a. Wide: Hover A1
    const a1Wide = MAP_GRID_IRONREACH_WIDE.territories.find((t) => t.id === "A1")!;
    const cellA1Wide = { x: a1Wide.labelPos.x, y: a1Wide.labelPos.y };
    expect(getTerritoryAt(cellA1Wide.x, cellA1Wide.y, MAP_GRID_IRONREACH_WIDE)).toBe("A1");
    await act(async () => {
      await setupWide.mockMouse.moveTo(cellA1Wide.x + wideOriginX, cellA1Wide.y + wideOriginY);
    });
    expect(hoveredTerritoryId as string | null).toBe("A1");

    // 2b. Wide: Hover & Click D2
    const d2Wide = MAP_GRID_IRONREACH_WIDE.territories.find((t) => t.id === "D2")!;
    const cellD2Wide = { x: d2Wide.labelPos.x, y: d2Wide.labelPos.y };
    expect(getTerritoryAt(cellD2Wide.x, cellD2Wide.y, MAP_GRID_IRONREACH_WIDE)).toBe("D2");
    await act(async () => {
      await setupWide.mockMouse.moveTo(cellD2Wide.x + wideOriginX, cellD2Wide.y + wideOriginY);
    });
    expect(hoveredTerritoryId as string | null).toBe("D2");
    await act(async () => {
      await setupWide.mockMouse.click(cellD2Wide.x + wideOriginX, cellD2Wide.y + wideOriginY);
    });
    expect(selectedTerritoryId as string | null).toBe("D2");

    // 2c. Wide: Water
    expect(getTerritoryAt(0, 0, MAP_GRID_IRONREACH_WIDE)).toBeNull();
    await act(async () => {
      await setupWide.mockMouse.moveTo(0 + wideOriginX, 0 + wideOriginY);
    });
    expect(hoveredTerritoryId as string | null).toBeNull();

    await act(async () => {
      setupWide.renderer.destroy();
    });
  });
});

describe("ui: De-mocking and conquest.sh branding verification", () => {
  const samplePlayers: Player[] = [
    {
      id: "p1",
      name: "Commander_Val",
      colorIndex: 0,
      colorHex: "#00d2ff",
      connected: true,
      isAlive: true,
      ready: true,
    },
    {
      id: "p2",
      name: "Warden_Kael",
      colorIndex: 1,
      colorHex: "#ff4444",
      connected: true,
      isAlive: true,
      ready: false,
    },
  ];

  it("Header renders honest lobby status in lobby phase and real data in active phase without mock fallbacks", async () => {
    const { Header } = await import("../apps/client/src/ui/Header.js");

    // 1. Lobby phase: displays room code and waiting status, no Alex/3/5
    const lobbyEl: any = Header({
      roomCode: "W9KZ",
      phase: "lobby",
      connectionStatus: "connected",
      isMyTurn: false,
    });
    const lobbyString = JSON.stringify(lobbyEl);
    expect(lobbyString).toContain("Lobby: Waiting for players...");
    expect(lobbyString).toContain("W9KZ");
    expect(lobbyString).toContain("conquest.sh");
    expect(lobbyString).not.toContain("Alex");
    expect(lobbyString).not.toContain("IRON FRONT");

    // 2. Active game phase: renders real turn, active player or 'None', real reinforcements
    const activeEl: any = Header({
      roomCode: "W9KZ",
      turnNumber: 7,
      activePlayer: samplePlayers[0],
      phase: "attack",
      pendingReinforcements: 0,
      connectionStatus: "connected",
      isMyTurn: true,
    });
    const activeString = JSON.stringify(activeEl);
    expect(activeString).toContain("Turn");
    expect(activeString).toContain("7");
    expect(activeString).toContain("/∞");
    expect(activeString).toContain("Commander_Val");
    expect(activeString).toContain("(You)");
    expect(activeString).toContain("0");
    expect(activeString).toContain("remaining");
    expect(activeString).not.toContain("Alex");
    expect(activeString).not.toContain("IRON FRONT");

    // 3. Active game with undefined activePlayer renders 'None'
    const noneEl: any = Header({
      roomCode: "W9KZ",
      turnNumber: 1,
      activePlayer: undefined,
      phase: "deployment",
      pendingReinforcements: 2,
      connectionStatus: "connected",
      isMyTurn: false,
    });
    const noneString = JSON.stringify(noneEl);
    expect(noneString).toContain("None");
    expect(noneString).not.toContain("Alex");
  });

  it("Sidebar renders honest empty prompt when no territory is selected, real info when selected, and lobby ready button", async () => {
    const { Sidebar } = await import("../apps/client/src/ui/Sidebar.js");

    let readyTriggered = false;

    // 1. No territory selected: honest prompt, no fake Casey or Frostfell defaults
    const unselectedEl: any = Sidebar({
      mapBundle: ironreachBundle,
      state: null,
      myPlayerId: "p1",
      selectedTerritoryId: null,
      targetTerritoryId: null,
      onDeploy: () => {},
      onAttack: () => {},
      onFortify: () => {},
      onSkipPhase: () => {},
      onEndTurn: () => {},
    });
    const unselectedString = JSON.stringify(unselectedEl);
    expect(unselectedString).toContain("Move over or click a territory to inspect.");
    expect(unselectedString).not.toContain("Casey");

    // 2. Territory selected (e.g. A1): shows real name, sector, owner 'Unclaimed'
    const selectedEl: any = Sidebar({
      mapBundle: ironreachBundle,
      state: null,
      myPlayerId: "p1",
      selectedTerritoryId: "A1",
      targetTerritoryId: null,
      onDeploy: () => {},
      onAttack: () => {},
      onFortify: () => {},
      onSkipPhase: () => {},
      onEndTurn: () => {},
    });
    const selectedString = JSON.stringify(selectedEl);
    expect(selectedString).toContain("Highwatch");
    expect(selectedString).toContain("Verdant Fringe");
    expect(selectedString).toContain("Unclaimed");
    expect(selectedString).not.toContain("Casey");

    // 3. Lobby phase: renders ready button and player status
    const lobbyState: any = {
      phase: "lobby",
      turnNumber: 0,
      activePlayerIndex: 0,
      players: samplePlayers,
      territories: {},
      pendingReinforcements: 0,
    };
    const lobbySidebar: any = Sidebar({
      mapBundle: ironreachBundle,
      state: lobbyState,
      myPlayerId: "p1",
      selectedTerritoryId: null,
      targetTerritoryId: null,
      onDeploy: () => {},
      onAttack: () => {},
      onFortify: () => {},
      onSkipPhase: () => {},
      onEndTurn: () => {},
      onReady: () => {
        readyTriggered = true;
      },
    });
    const lobbySidebarString = JSON.stringify(lobbySidebar);
    expect(lobbySidebarString).toContain("Status");
    expect(lobbySidebarString).toContain("Ready");
    expect(lobbySidebarString).toContain("Connected");
    expect(lobbySidebarString).toContain("[ Ready ]");

    // Test onReady click handler on ready button
    const actionsBox = lobbySidebar.props.children[2];
    const readyButtonBox = actionsBox.props.children.props.children[0];
    readyButtonBox.props.onMouseDown();
    expect(readyTriggered).toBe(true);
  });

  it("EventLog renders 'No events yet.' when empty and removes all fake SAMPLE_EVENTS", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { EventLog } = await import("../apps/client/src/ui/EventLog.js");

    const setup = await testRender(
      React.createElement(EventLog, {
          mapBundle: ironreachBundle,
        events: [],
        chatOpen: false,
        players: samplePlayers,
        onToggleChat: () => {},
        onSendChat: () => {},
      }),
      { width: 80, height: 12 }
    );

    await act(async () => {
      await setup.renderOnce();
    });

    const frame = setup.captureCharFrame();
    expect(frame).toContain("No events yet.");
    expect(frame).not.toContain("Casey captured A3");
    expect(frame).not.toContain("Alex received 5 reinforcements");
    expect(frame).not.toContain("Drew: nice move!");

    await act(async () => {
      setup.renderer.destroy();
    });
  });

  it("Footer slogan consistently displays CONQUEST.SH branding without IRON FRONT", async () => {
    const { Footer } = await import("../apps/client/src/ui/Footer.js");

    const el: any = Footer({
      toastMessage: null,
      toastType: "info",
      activeTab: 1,
    });

    const footerString = JSON.stringify(el);
    expect(footerString).toContain("Play fair. Play bold.");
    expect(footerString).toContain("CONQUEST.SH");
    expect(footerString).not.toContain("IRON FRONT");
  });

  it("MapCanvas hides army badges for unassigned territories", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");

    const setup = await testRender(
      React.createElement(MapCanvas, {
          mapBundle: ironreachBundle,
        territories: {},
        players: [],
        myPlayerId: "p1",
        phase: "deployment",
        selectedTerritoryId: null,
        targetTerritoryId: null,
        onSelectTerritory: () => {},
        onSelectTarget: () => {},
        onDeselect: () => {},
      }),
      { width: 80, height: 32 }
    );

    await act(async () => {
      await setup.renderOnce();
    });

    const frame = setup.captureCharFrame();
    // A lobby/unassigned territory has no army, so its map badge is omitted.
    expect(frame).not.toContain("▲ 0");
    expect(frame).not.toContain("▲ 2");

    await act(async () => {
      setup.renderer.destroy();
    });
  });
});

describe("ui: Responsive fullscreen layout & terminal size tests", () => {
  const mockClient: any = {
    state: { mapId: "ironreach", phase: "lobby", players: [], territories: {}, sectors: {}, history: [], turnNumber: 0, activePlayerIndex: 0, pendingReinforcements: 0 },
    myPlayerId: "p1",
    status: "connected",
    roomCode: "H5CM",
    onSnapshot: () => () => {},
    onEvent: () => () => {},
    onStatusChange: () => () => {},
    onError: () => () => {},
    sendChat: () => {},
    deploy: () => {},
    attack: () => {},
    fortify: () => {},
    skipPhase: () => {},
    endTurn: () => {},
    ready: () => {},
  };

  it("responsive layout: map-aware minimum warns when Ironreach's authored raster cannot fit", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { App } = await import("../apps/client/src/ui/App.js");

    const setupMin = await testRender(
      React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: 110, rows: 38 },
      }),
      { width: 110, height: 38 }
    );
    await act(async () => {
      await setupMin.renderOnce();
    });

    const frame = setupMin.captureCharFrame();
    expect(frame).toContain("TERMINAL WINDOW TOO SMALL");
    expect(frame).toContain("This map requires at least 99 columns × 45 rows");
    expect(frame).toContain("Current: 110 cols × 38 rows");

    await act(async () => {
      setupMin.renderer.destroy();
    });
  });

  it("responsive layout: typical (140x45) renders map and sidebar side-by-side with EventLog spanning width", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { App } = await import("../apps/client/src/ui/App.js");

    const setupTyp = await testRender(
      React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: 140, rows: 45 },
      }),
      { width: 140, height: 45 }
    );
    await act(async () => {
      await setupTyp.renderOnce();
    });

    const frame = setupTyp.captureCharFrame();
    expect(frame).toContain("CONQUEST.SH");
    expect(frame).toContain("WORLD MAP");
    expect(frame).toContain("! PLAYERS");
    expect(frame).toContain("! SELECTED TERRITORY");
    expect(frame).toContain("! ACTIONS");
    expect(frame).toContain("! EVENT LOG / CHAT");

    // EventLog spans width across the bottom
    const lines = frame.split("\n");
    const eventLogLine = lines.find((l: string) => l.includes("! EVENT LOG / CHAT"));
    expect(eventLogLine).toBeDefined();
    // In a 140 width terminal, EventLog title/border line spans across the screen
    expect(eventLogLine!.length).toBeGreaterThanOrEqual(130);

    // Measure the raster against the pane App actually laid out. The map's
    // land crop deliberately excludes ocean decorations from this occupancy.
    const rootNode = setupTyp.renderer.root;
    const appContainer = rootNode.getChildren?.()[0]?.getChildren?.().length === 4
      ? rootNode.getChildren()[0]
      : rootNode;
    const [leftCol] = appContainer.getChildren()[1].getChildren();
    const compactRaster = renderedMapBounds(MAP_GRID_IRONREACH_COMPACT);
    expect(leftCol.width).toBe(101);
    expect(leftCol.height).toBe(34);
    expect(compactRaster.width).toBeLessThanOrEqual(leftCol.width);
    expect(compactRaster.height).toBeLessThanOrEqual(leftCol.height);
    expect(compactRaster.width / leftCol.width).toBeGreaterThanOrEqual(0.75);
    expect(compactRaster.height / leftCol.height).toBeGreaterThanOrEqual(0.70);

    await act(async () => {
      setupTyp.renderer.destroy();
    });
  });

  it("responsive layout: wide (200x55) UI fills the 200 cols without trailing blank half-screen", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { App } = await import("../apps/client/src/ui/App.js");

    const setupWide = await testRender(
      React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: 200, rows: 55 },
      }),
      { width: 200, height: 55 }
    );
    await act(async () => {
      await setupWide.renderOnce();
    });

    const frame = setupWide.captureCharFrame();
    expect(frame).toContain("CONQUEST.SH");
    expect(frame).toContain("WORLD MAP");
    expect(frame).toContain("! PLAYERS");
    expect(frame).toContain("! EVENT LOG / CHAT");

    const lines = frame.split("\n");
    // Frame lines should be formatted to 200 columns wide
    const eventLogLine = lines.find((l: string) => l.includes("! EVENT LOG / CHAT"));
    expect(eventLogLine).toBeDefined();
    expect(eventLogLine!.length).toBe(200);

    // Frame does not stop at col 120 with trailing blank half-screen: content and borders reach near 200
    const hasFarRightContent = lines.some((l: string) => l.length >= 190 && l.trimEnd().length >= 180);
    expect(hasFarRightContent).toBe(true);

    // Section 22: Quantitative acceptance criteria
    // 1. Panel usage & vertical usage without dead zones
    // Note: root children inside top-level wrapper or directly in root
    const rootNode = setupWide.renderer.root;
    // App's main container may be the root or its first child
    const appContainer = rootNode.getChildren?.()[0]?.getChildren?.().length === 4
      ? rootNode.getChildren()[0]
      : rootNode;
    const [headerNode, tacticalRowNode, eventLogNode, footerNode] = appContainer.getChildren();

    // Vertical continuity: header -> tactical row -> event log -> footer
    expect(tacticalRowNode.screenY).toBe(headerNode.screenY + headerNode.height);
    expect(eventLogNode.screenY).toBe(tacticalRowNode.screenY + tacticalRowNode.height);
    expect(footerNode.screenY).toBe(eventLogNode.screenY + eventLogNode.height);

    // Tactical middle row gives extra desktop width to the map, not the sidebar.
    const [leftCol, rightCol] = tacticalRowNode.getChildren();
    const leftColRatio = leftCol.width / 200;
    expect(leftColRatio).toBeGreaterThanOrEqual(0.70);
    expect(leftColRatio).toBeLessThanOrEqual(0.80);
    expect(rightCol.width).toBe(42);
    expect(rightCol.screenX).toBe(leftCol.screenX + leftCol.width + 1);

    // 2. Dual Viewport wide mode selection: inner map width is 136 (> 104) and height is 36
    function findInnerMap(node: any): any {
      if (isRenderedMapRaster(node)) {
        return node;
      }
      for (const child of node?.getChildren?.() || []) {
        const found = findInnerMap(child);
        if (found) return found;
      }
      return null;
    }

    const innerMap = findInnerMap(leftCol);
    expect(innerMap).not.toBeNull();
    const wideRaster = renderedMapBounds(MAP_GRID_IRONREACH_WIDE);
    expect(innerMap.width).toBe(wideRaster.width);
    expect(innerMap.width).toBeGreaterThan(renderedMapBounds(MAP_GRID_IRONREACH_COMPACT).width);
    expect(innerMap.height).toBe(wideRaster.height);

    // Use the rendered App pane, not a synthetic terminal-sized rectangle.
    // `wideRaster` is land-only, so decorations cannot inflate occupancy.
    expect(leftCol.width).toBe(157);
    expect(leftCol.height).toBe(41);
    expect(wideRaster.width).toBeLessThanOrEqual(leftCol.width);
    expect(wideRaster.height).toBeLessThanOrEqual(leftCol.height);
    expect(wideRaster.width / leftCol.width).toBeGreaterThanOrEqual(0.78);
    expect(wideRaster.height / leftCol.height).toBeGreaterThanOrEqual(0.72);

    // 3. Bounding box usage on wide map: width ratio >= 0.80 and height ratio >= 0.75
    const bbox = getGeographyBoundingBox(MAP_GRID_IRONREACH_WIDE);
    expect(bbox.width / MAP_GRID_IRONREACH_WIDE.width).toBeGreaterThanOrEqual(0.80);
    expect(bbox.height / MAP_GRID_IRONREACH_WIDE.height).toBeGreaterThanOrEqual(0.75);

    await act(async () => {
      setupWide.renderer.destroy();
    });
  });

  it("responsive layout: wide 200x55 lobby keeps session intel to its content height", async () => {
    // @ts-ignore Test renderer is intentionally imported from the client workspace.
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore Test renderer is intentionally imported from the client workspace.
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore Test renderer is intentionally imported from the client workspace.
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { App } = await import("../apps/client/src/ui/App.js");
    const lobbyPlayer: Player = {
      id: "p1", name: "Alice", colorIndex: 0, colorHex: "#00d2ff",
      connected: true, isAlive: true, ready: true,
    };
    const lobbyPeer: Player = {
      id: "p2", name: "Bob", colorIndex: 1, colorHex: "#ff4444",
      connected: true, isAlive: true, ready: false,
    };
    const lobbyState = createInitialGameState(
      "wide-lobby-session-intel", "LOBB", [lobbyPlayer, lobbyPeer], MAP_GRID_IRONREACH, 2
    );
    lobbyState.phase = "lobby";
    const client = { ...mockClient, state: lobbyState, myPlayerId: lobbyPlayer.id, roomCode: "LOBB" };

    const setup = await testRender(
      React.createElement(App, { client, terminalDimensions: { columns: 200, rows: 55 } }),
      { width: 200, height: 55 }
    );
    await act(async () => { await setup.renderOnce(); });

    const lines = setup.captureCharFrame().split("\n");
    const intelTop = lines.findIndex((line: string) => line.includes("! REALM & SESSION INTEL"));
    expect(intelTop).toBeGreaterThanOrEqual(0);
    // Seven content rows plus the card's top and bottom borders: this should
    // stay a nine-row card rather than expanding to fill the sidebar.
    expect(lines[intelTop + 8]).toContain("└");
    expect(lines.slice(intelTop, intelTop + 9).join("\n")).toContain("Connection");
    expect(lines.slice(intelTop, intelTop + 9).join("\n")).toContain("Total Armies");

    await act(async () => { setup.renderer.destroy(); });
  });

  it("regression: wide-but-short terminal (200x30) selects compact map and raster never exceeds pane bounds", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { App } = await import("../apps/client/src/ui/App.js");

    const setupShort = await testRender(
      React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: 200, rows: 30 },
      }),
      { width: 200, height: 30 }
    );
    await act(async () => {
      await setupShort.renderOnce();
    });

    // Press key to override the terminal size warning for 30 rows (< 34)
    await act(async () => {
      setupShort.mockInput.pressKey("i");
    });
    await act(async () => {
      await setupShort.renderOnce();
    });

    const rootNode = setupShort.renderer.root;
    const appContainer = rootNode.getChildren?.()[0]?.getChildren?.().length === 4
      ? rootNode.getChildren()[0]
      : rootNode;
    const tacticalRowNode = appContainer.getChildren()[1];
    const [leftCol] = tacticalRowNode.getChildren();

    function findInnerMap(node: any): any {
      if (isRenderedMapRaster(node)) {
        return node;
      }
      for (const child of node?.getChildren?.() || []) {
        const found = findInnerMap(child);
        if (found) return found;
      }
      return null;
    }

    const innerMap = findInnerMap(leftCol);
    expect(innerMap).not.toBeNull();
    // The compact viewport is selected below the supported responsive height,
    // so the wide 36-row raster cannot be chosen.
    expect(innerMap.width).toBe(renderedMapBounds(MAP_GRID_IRONREACH_COMPACT).width);
    expect(innerMap.height).toBe(renderedMapBounds(MAP_GRID_IRONREACH_COMPACT).height);
    // Raster width strictly fits inside leftCol width
    expect(innerMap.width).toBeLessThanOrEqual(leftCol.width);

    await act(async () => {
      setupShort.renderer.destroy();
    });

    // A 200x35 terminal cannot contain Ironreach's smallest 30-row land
    // crop after compact chrome, so it reports the map-specific minimum.
    const setup35 = await testRender(
      React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: 200, rows: 35 },
      }),
      { width: 200, height: 35 }
    );
    await act(async () => {
      await setup35.renderOnce();
    });

    const frame35 = setup35.captureCharFrame();
    expect(frame35).toContain("TERMINAL WINDOW TOO SMALL");
    expect(frame35).toContain("This map requires at least 99 columns × 45 rows");

    await act(async () => {
      setup35.renderer.destroy();
    });
  });

  it("regression: responsive geography changes at the 180x51 wide boundary and never exceeds its pane", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { App } = await import("../apps/client/src/ui/App.js");

    function findInnerMap(node: any): any {
      if (isRenderedMapRaster(node)) {
        return node;
      }
      for (const child of node?.getChildren?.() || []) {
        const found = findInnerMap(child);
        if (found) return found;
      }
      return null;
    }

    // The responsive mode boundary changes chrome, while map selection follows
    // the actual pane. The capped sidebar lets Ironreach wide fit on both sides.
    const setup179 = await testRender(
      React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: 179, rows: 50 },
      }),
      { width: 179, height: 50 }
    );
    await act(async () => {
      await setup179.renderOnce();
    });
    const root179 = setup179.renderer.root;
    const appContainer179 = root179.getChildren?.()[0]?.getChildren?.().length === 4
      ? root179.getChildren()[0]
      : root179;
    const [leftCol179] = appContainer179.getChildren()[1].getChildren();
    const innerMap179 = findInnerMap(leftCol179);
    expect(leftCol179.width).toBe(140);
    expect(leftCol179.height).toBe(39);
    expect(innerMap179.width).toBe(renderedMapBounds(MAP_GRID_IRONREACH_WIDE).width);
    expect(innerMap179.height).toBe(renderedMapBounds(MAP_GRID_IRONREACH_WIDE).height);
    await act(async () => {
      setup179.renderer.destroy();
    });

    const setup180 = await testRender(
      React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: 180, rows: 50 },
      }),
      { width: 180, height: 50 }
    );
    await act(async () => {
      await setup180.renderOnce();
    });
    const root180 = setup180.renderer.root;
    const appContainer180 = root180.getChildren?.()[0]?.getChildren?.().length === 4
      ? root180.getChildren()[0]
      : root180;
    const [leftCol180] = appContainer180.getChildren()[1].getChildren();
    const innerMap180 = findInnerMap(leftCol180);
    expect(innerMap180.width).toBe(renderedMapBounds(MAP_GRID_IRONREACH_WIDE).width);
    expect(innerMap180.height).toBe(renderedMapBounds(MAP_GRID_IRONREACH_WIDE).height);
    expect(innerMap180.width).toBeLessThanOrEqual(leftCol180.width);
    expect(innerMap180.height).toBeLessThanOrEqual(leftCol180.height);
    await act(async () => {
      setup180.renderer.destroy();
    });

    const setup180wide = await testRender(
      React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: 180, rows: 51 },
      }),
      { width: 180, height: 51 }
    );
    await act(async () => {
      await setup180wide.renderOnce();
    });
    const root180wide = setup180wide.renderer.root;
    const appContainer180wide = root180wide.getChildren?.()[0]?.getChildren?.().length === 4
      ? root180wide.getChildren()[0]
      : root180wide;
    const [leftCol180wide] = appContainer180wide.getChildren()[1].getChildren();
    const innerMap180wide = findInnerMap(leftCol180wide);
    expect(innerMap180wide.width).toBe(renderedMapBounds(MAP_GRID_IRONREACH_WIDE).width);
    expect(innerMap180wide.height).toBe(renderedMapBounds(MAP_GRID_IRONREACH_WIDE).height);
    expect(innerMap180wide.width).toBeLessThanOrEqual(leftCol180wide.width);
    expect(innerMap180wide.height).toBeLessThanOrEqual(leftCol180wide.height);
    await act(async () => {
      setup180wide.renderer.destroy();
    });

    // 1. 184x55: the 132-column wide land crop fits the App's wide map pane.
    const setup184 = await testRender(
      React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: 184, rows: 55 },
      }),
      { width: 184, height: 55 }
    );
    await act(async () => {
      await setup184.renderOnce();
    });

    const root184 = setup184.renderer.root;
    const appContainer184 = root184.getChildren?.()[0]?.getChildren?.().length === 4
      ? root184.getChildren()[0]
      : root184;
    const [leftCol184] = appContainer184.getChildren()[1].getChildren();
    const innerMap184 = findInnerMap(leftCol184);

    expect(innerMap184).not.toBeNull();
    expect(innerMap184.width).toBe(renderedMapBounds(MAP_GRID_IRONREACH_WIDE).width);
    expect(innerMap184.height).toBe(renderedMapBounds(MAP_GRID_IRONREACH_WIDE).height);
    expect(innerMap184.width).toBeLessThanOrEqual(leftCol184.width);

    await act(async () => {
      setup184.renderer.destroy();
    });

    // 2. 185x55 retains the same wide crop and fit.
    const setup185 = await testRender(
      React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: 185, rows: 55 },
      }),
      { width: 185, height: 55 }
    );
    await act(async () => {
      await setup185.renderOnce();
    });

    const root185 = setup185.renderer.root;
    const appContainer185 = root185.getChildren?.()[0]?.getChildren?.().length === 4
      ? root185.getChildren()[0]
      : root185;
    const [leftCol185] = appContainer185.getChildren()[1].getChildren();
    const innerMap185 = findInnerMap(leftCol185);

    expect(innerMap185).not.toBeNull();
    expect(innerMap185.width).toBe(renderedMapBounds(MAP_GRID_IRONREACH_WIDE).width);
    expect(innerMap185.height).toBe(renderedMapBounds(MAP_GRID_IRONREACH_WIDE).height);
    expect(innerMap185.width).toBeLessThanOrEqual(leftCol185.width);

    await act(async () => {
      setup185.renderer.destroy();
    });
  });
});

describe("ui: Compact layout mode, CompactInspector, half-block rendering & hover behavior", () => {
  const testPlayers: any[] = [
    { id: "p1", name: "Alice", colorHex: "#00d2ff", isAlive: true, ready: false, connected: true },
    { id: "p2", name: "Bob", colorHex: "#ff4444", isAlive: true, ready: true, connected: true },
  ];

  it("CompactInspector distinguishes [HOVERED] vs [SELECTED] and reverts when unhovered", async () => {
    const { CompactInspector } = await import("../apps/client/src/ui/CompactInspector.js");

    let readyFired = false;

    // 1. Uninspected: Displays player summary and lobby ready button
    const uninspected: any = CompactInspector({
      mapBundle: ironreachBundle,
      state: {
        phase: "lobby",
        turnNumber: 0,
        activePlayerIndex: 0,
        players: testPlayers,
        territories: {},
        pendingReinforcements: 0,
      } as any,
      myPlayerId: "p1",
      selectedTerritoryId: null,
      hoveredTerritoryId: null,
      targetTerritoryId: null,
      phase: "lobby",
      onDeploy: () => {},
      onAttack: () => {},
      onFortify: () => {},
      onSkipPhase: () => {},
      onEndTurn: () => {},
      onReady: () => {
        readyFired = true;
      },
    });

    const uninspectedStr = JSON.stringify(uninspected);
    expect(uninspectedStr).toContain("! PLAYERS & INSPECTOR");
    expect(uninspectedStr).toContain("Alice");
    expect(uninspectedStr).toContain("Bob");
    expect(uninspectedStr).toContain("[ Ready ]");

    // 2. Hovered territory A1 without selection: displays [HOVERED]
    const hoveredEl: any = CompactInspector({
      mapBundle: ironreachBundle,
      state: null,
      myPlayerId: "p1",
      selectedTerritoryId: null,
      hoveredTerritoryId: "A1",
      targetTerritoryId: null,
      phase: "lobby",
      onDeploy: () => {},
      onAttack: () => {},
      onFortify: () => {},
      onSkipPhase: () => {},
      onEndTurn: () => {},
    });
    const hoveredStr = JSON.stringify(hoveredEl);
    expect(hoveredStr).toContain("! INSPECTOR [HOVERED]");
    expect(hoveredStr).toContain("HOVERED");
    expect(hoveredStr).toContain("Highwatch");
    expect(hoveredStr).toContain("Verdant …");

    // 3. Selected territory A1: displays [SELECTED]
    const selectedEl: any = CompactInspector({
      mapBundle: ironreachBundle,
      state: null,
      myPlayerId: "p1",
      selectedTerritoryId: "A1",
      hoveredTerritoryId: null,
      targetTerritoryId: null,
      phase: "lobby",
      onDeploy: () => {},
      onAttack: () => {},
      onFortify: () => {},
      onSkipPhase: () => {},
      onEndTurn: () => {},
    });
    const selectedStr = JSON.stringify(selectedEl);
    expect(selectedStr).toContain("! INSPECTOR [SELECTED]");
    expect(selectedStr).toContain("SELECTED");
    expect(selectedStr).toContain("Highwatch");

    // 4. Hovering B1 while A1 is selected: displays B1 with [HOVERED]
    const hoverWhileSelectedEl: any = CompactInspector({
      mapBundle: ironreachBundle,
      state: null,
      myPlayerId: "p1",
      selectedTerritoryId: "A1",
      hoveredTerritoryId: "B1",
      targetTerritoryId: null,
      phase: "lobby",
      onDeploy: () => {},
      onAttack: () => {},
      onFortify: () => {},
      onSkipPhase: () => {},
      onEndTurn: () => {},
    });
    const hoverWhileSelectedStr = JSON.stringify(hoverWhileSelectedEl);
    expect(hoverWhileSelectedStr).toContain("! INSPECTOR [HOVERED]");
    expect(hoverWhileSelectedStr).toContain("B1");
    expect(hoverWhileSelectedStr).toContain("HOVERED");

    // 5. Reverting to A1 when hover cleared
    const revertedEl: any = CompactInspector({
      mapBundle: ironreachBundle,
      state: null,
      myPlayerId: "p1",
      selectedTerritoryId: "A1",
      hoveredTerritoryId: null,
      targetTerritoryId: null,
      phase: "lobby",
      onDeploy: () => {},
      onAttack: () => {},
      onFortify: () => {},
      onSkipPhase: () => {},
      onEndTurn: () => {},
    });
    const revertedStr = JSON.stringify(revertedEl);
    expect(revertedStr).toContain("! INSPECTOR [SELECTED]");
    expect(revertedStr).toContain("A1");
  });

  it("Sidebar omits Card 4 in standard mode and uses updated territory terminology", async () => {
    const { Sidebar } = await import("../apps/client/src/ui/Sidebar.js");

    // Standard mode: Cards 1-3 rendered, Card 4 omitted
    const standardEl: any = Sidebar({
      mapBundle: ironreachBundle,
      state: null,
      myPlayerId: "p1",
      selectedTerritoryId: "A1",
      hoveredTerritoryId: null,
      targetTerritoryId: null,
      onDeploy: () => {},
      onAttack: () => {},
      onFortify: () => {},
      onSkipPhase: () => {},
      onEndTurn: () => {},
      layoutMode: "standard",
    });

    const standardCards = standardEl.props.children.filter(Boolean);
    expect(standardCards.length).toBe(3);
    expect(standardCards[0].props.title).toBe("! PLAYERS");
    expect(standardCards[1].props.title).toBe("! SELECTED TERRITORY");
    expect(standardCards[2].props.title).toBe("! ACTIONS");

    // Wide mode: All 4 cards rendered with updated terminology
    const wideEl: any = Sidebar({
      mapBundle: ironreachBundle,
      state: null,
      myPlayerId: "p1",
      selectedTerritoryId: "A1",
      hoveredTerritoryId: null,
      targetTerritoryId: null,
      onDeploy: () => {},
      onAttack: () => {},
      onFortify: () => {},
      onSkipPhase: () => {},
      onEndTurn: () => {},
      layoutMode: "wide",
    });

    const wideCards = wideEl.props.children.filter(Boolean);
    expect(wideCards.length).toBe(4);
    expect(wideCards[3].props.title).toBe("! REALM & SESSION INTEL");

    const wideStr = JSON.stringify(wideEl);
    expect(wideStr).toContain("The Ironreach");
    expect(wideStr).toContain('20," Territories"');
    expect(wideStr).not.toContain("20 Realms");
  });

  it("Header and Footer adapt to compact layout mode with space-saving heights", async () => {
    const { Header } = await import("../apps/client/src/ui/Header.js");
    const { Footer } = await import("../apps/client/src/ui/Footer.js");

    // Compact Header: height 3 tactical bar
    const compactHeader: any = Header({
      roomCode: "H5CM",
      turnNumber: 1,
      activePlayer: testPlayers[0],
      phase: "deployment",
      pendingReinforcements: 3,
      connectionStatus: "connected",
      isMyTurn: true,
      layoutMode: "compact",
    });
    const mainHeaderBox = compactHeader.props.children[1];
    expect(mainHeaderBox.props.style.height).toBe(3);

    // Standard/Wide Header: height 5 with ASCII art logo
    const wideHeader: any = Header({
      roomCode: "H5CM",
      turnNumber: 1,
      activePlayer: testPlayers[0],
      phase: "deployment",
      pendingReinforcements: 3,
      connectionStatus: "connected",
      isMyTurn: true,
      layoutMode: "wide",
    });
    const wideMainHeaderBox = wideHeader.props.children[1];
    expect(wideMainHeaderBox.props.style.height).toBe(5);

    // Compact Footer: height 1
    const compactFooter: any = Footer({
      activeTab: 1,
      layoutMode: "compact",
    });
    expect(compactFooter.props.style.height).toBe(1);

    // Standard Footer: height 3
    const standardFooter: any = Footer({
      activeTab: 1,
      layoutMode: "standard",
    });
    expect(standardFooter.props.style.height).toBe(3);
  });

  it("MapCanvas renders half-block microcell boundaries and neon highlight for selection", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");

    const setup = await testRender(
      React.createElement(MapCanvas, {
          mapBundle: ironreachBundle,
        territories: {},
        players: testPlayers,
        myPlayerId: "p1",
        phase: "deployment",
        selectedTerritoryId: "A1",
        targetTerritoryId: null,
        onSelectTerritory: () => {},
        onSelectTarget: () => {},
        onDeselect: () => {},
      }),
      { width: 140, height: 40 }
    );

    await act(async () => {
      await setup.renderOnce();
    });

    const frame = setup.captureCharFrame();
    // Verify half-block characters exist in the output for microcell coastlines
    expect(frame).toContain("▀");
    // Verify territory name overlays cleanly on land
    expect(frame).toContain("HIGHWATCH");

    await act(async () => {
      setup.renderer.destroy();
    });
  });

  it("MapCanvas visibly renders political borders between adjacent territories owned by the same player", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");

    // Both A1 and A3 owned by Alice (p1), B1 owned by Bob (p2)
    const territories = {
      A1: { id: "A1", ownerId: "p1", units: 4 },
      A2: { id: "A2", ownerId: "p1", units: 2 },
      A3: { id: "A3", ownerId: "p1", units: 5 },
      B1: { id: "B1", ownerId: "p2", units: 3 },
    };

    const setup = await testRender(
      React.createElement(MapCanvas, {
          mapBundle: ironreachBundle,
        territories,
        players: testPlayers,
        myPlayerId: "p1",
        phase: "deployment",
        selectedTerritoryId: null,
        targetTerritoryId: null,
        onSelectTerritory: () => {},
        onSelectTarget: () => {},
        onDeselect: () => {},
      }),
      { width: 140, height: 40 }
    );

    await act(async () => {
      await setup.renderOnce();
    });

    const frame = setup.captureCharFrame();
    // Verify half-block characters exist for vertical/diagonal borders & coastlines
    expect(frame).toContain("▀");
    // Verify political boundary separator glyph "·" exists between same-owner territories
    expect(frame).toContain("·");
    // Verify both territory labels are visible
    expect(frame).toContain("HIGHWATCH");
    expect(frame).toContain("STONEVEIL");

    await act(async () => {
      setup.renderer.destroy();
    });
  });

  it("MapCanvas selection perimeter renders distinct boundary markers and hover updates without erasing borders", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");

    const territories = {
      A1: { id: "A1", ownerId: "p1", units: 4 },
      A3: { id: "A3", ownerId: "p1", units: 5 },
    };

    const setup = await testRender(
      React.createElement(MapCanvas, {
          mapBundle: ironreachBundle,
        territories,
        players: testPlayers,
        myPlayerId: "p1",
        phase: "deployment",
        selectedTerritoryId: "A1",
        hoveredTerritoryId: "A3",
        targetTerritoryId: null,
        onSelectTerritory: () => {},
        onSelectTarget: () => {},
        onDeselect: () => {},
      }),
      { width: 140, height: 40 }
    );

    await act(async () => {
      await setup.renderOnce();
    });

    const frame = setup.captureCharFrame();
    // Selection perimeter renders boundary block markers (▌, ▐, █, or ▀)
    const hasSelectionMarkers = frame.includes("▌") || frame.includes("▐") || frame.includes("█");
    expect(hasSelectionMarkers).toBe(true);

    // Selected territory and hovered territory are both rendered
    expect(frame).toContain("HIGHWATCH");
    expect(frame).toContain("STONEVEIL");

    await act(async () => {
      setup.renderer.destroy();
    });
  });

  it("Header in standard mode renders clean height-3 bar without 3-line ASCII logo, while wide mode renders height-5 banner", async () => {
    const { Header } = await import("../apps/client/src/ui/Header.js");

    const standardHeader: any = Header({
      roomCode: "TEST",
      turnNumber: 3,
      activePlayer: testPlayers[0],
      phase: "attack",
      pendingReinforcements: 2,
      connectionStatus: "connected",
      isMyTurn: true,
      layoutMode: "standard",
    });

    const standardMainBox = standardHeader.props.children[1];
    expect(standardMainBox.props.style.height).toBe(3);

    const standardStr = JSON.stringify(standardHeader);
    expect(standardStr).toContain("CONQUEST.SH");
    expect(standardStr).toContain("CONQUER • NEGOTIATE • SURVIVE");
    // Must NOT contain the 3-line ASCII banner glyphs
    expect(standardStr).not.toContain("╔═╗");
    expect(standardStr).not.toContain("╚═╝");

    const wideHeader: any = Header({
      roomCode: "TEST",
      turnNumber: 3,
      activePlayer: testPlayers[0],
      phase: "attack",
      pendingReinforcements: 2,
      connectionStatus: "connected",
      isMyTurn: true,
      layoutMode: "wide",
    });

    const wideMainBox = wideHeader.props.children[1];
    expect(wideMainBox.props.style.height).toBe(5);

    const wideStr = JSON.stringify(wideHeader);
    expect(wideStr).toContain("╔═╗╔═╗╔╗╔╔═╗╦ ╦╔═╗╔═╗╔╦╗   ╔═╗╦ ╦");
  });
});
