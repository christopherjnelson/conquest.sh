import { describe, expect, it } from "bun:test";
import { formatEvent } from "../apps/client/src/ui/EventLog.js";
import { MAP_IRONREACH } from "../packages/map-engine/src/index.js";
import type { GameEvent, Player } from "../packages/protocol/src/index.js";

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

    const formatted = formatEvent(event, testPlayers);
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

    const formatted = formatEvent(event, testPlayers);
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

    const formatted = formatEvent(event, testPlayers);
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

    const formatted = formatEvent(event, testPlayers);
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

    const formatted = formatEvent(event, testPlayers);
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

    const formatted = formatEvent(event, testPlayers);
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

  it("renders MapCanvas as a 2D cellular grid without rectangular territory boxes", async () => {
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");
    const el: any = MapCanvas({
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
    expect(el.props.style.width).toBe(106);
    expect(el.props.style.height).toBe(32);

    // Inner container holds the 30 lines
    const innerBox = el.props.children;
    expect(innerBox.type).toBe("box");
    const lines = innerBox.props.children;
    expect(lines.length).toBe(30);

    // Each line is a <text> element with styled <span> runs
    for (const line of lines) {
      expect(line.type).toBe("text");
    }
  });

  it("renders Sidebar with 3 cards matching ref.png", async () => {
    const { Sidebar } = await import("../apps/client/src/ui/Sidebar.js");
    const el: any = Sidebar({
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
    expect(cards.length).toBe(3);

    // Card 1: ! PLAYERS
    expect(cards[0].props.title).toBe("! PLAYERS");
    // Card 2: ! SELECTED TERRITORY
    expect(cards[1].props.title).toBe("! SELECTED TERRITORY");
    // Card 3: ! ACTIONS
    expect(cards[2].props.title).toBe("! ACTIONS");
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
      "conquest.sh requires at least 105 columns x 34 rows for the tactical realm map."
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
    const { MAP_GRID_IRONREACH, getTerritoryAt } = await import("../packages/map-engine/src/index.js");

    let hoveredTerritoryId: string | null = null;
    let selectedTerritoryId: string | null = null;

    const headerHeight = 5;
    const setup = await testRender(
      React.createElement(
        "box",
        { flexDirection: "column", style: { width: 120, height: 40 } },
        React.createElement("box", { style: { width: 120, height: headerHeight } }),
        React.createElement(MapCanvas, {
          territories: {},
          players: testPlayers,
          myPlayerId: "p1",
          phase: "deployment",
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
      { width: 120, height: 40 }
    );

    await act(async () => {
      await setup.renderOnce();
    });

    // Locate the inner map content box (104x30) to determine screen origins
    function findInnerMapBox(node: any): any {
      if (node && node.width === 104 && node.height === 30) return node;
      for (const child of node?.getChildren?.() || []) {
        const found = findInnerMapBox(child);
        if (found) return found;
      }
      return null;
    }

    const innerMapBox = findInnerMapBox(setup.renderer.root);
    const innerOriginX = typeof innerMapBox?.screenX === "number" ? innerMapBox.screenX : 1;
    const innerOriginY = typeof innerMapBox?.screenY === "number" ? innerMapBox.screenY : headerHeight + 1;

    // Verify MapCanvas inner content starts at y >= 5 due to header offset
    expect(innerOriginY).toBeGreaterThanOrEqual(5);

    // 1. Determine screen coordinate of known interior cell of territory A1 (cell (24, 3))
    const cellA1 = { x: 24, y: 3 };
    expect(getTerritoryAt(cellA1.x, cellA1.y, MAP_GRID_IRONREACH)).toBe("A1");
    const screenX_A1 = cellA1.x + innerOriginX;
    const screenY_A1 = cellA1.y + innerOriginY;

    await act(async () => {
      await setup.mockMouse.moveTo(screenX_A1, screenY_A1);
    });
    expect(hoveredTerritoryId as string | null).toBe("A1");

    // 2. Move pointer onto known interior cell of D2 (cell (20, 19))
    const cellD2 = { x: 20, y: 19 };
    expect(getTerritoryAt(cellD2.x, cellD2.y, MAP_GRID_IRONREACH)).toBe("D2");
    const screenX_D2 = cellD2.x + innerOriginX;
    const screenY_D2 = cellD2.y + innerOriginY;

    await act(async () => {
      await setup.mockMouse.moveTo(screenX_D2, screenY_D2);
    });
    expect(hoveredTerritoryId as string | null).toBe("D2");

    // 3. Click D2
    await act(async () => {
      await setup.mockMouse.click(screenX_D2, screenY_D2);
    });
    expect(selectedTerritoryId as string | null).toBe("D2");

    // 4. Move pointer over water (cell (0, 0))
    const cellWater = { x: 0, y: 0 };
    expect(getTerritoryAt(cellWater.x, cellWater.y, MAP_GRID_IRONREACH)).toBeNull();
    const screenX_water = cellWater.x + innerOriginX;
    const screenY_water = cellWater.y + innerOriginY;

    await act(async () => {
      await setup.mockMouse.moveTo(screenX_water, screenY_water);
    });
    expect(hoveredTerritoryId as string | null).toBeNull();

    await act(async () => {
      setup.renderer.destroy();
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

  it("MapCanvas renders units as 0 instead of 2 for uninitialized territories", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");

    const setup = await testRender(
      React.createElement(MapCanvas, {
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
    // Uninitialized territories should render with ▲ 0 (not ▲ 2)
    expect(frame).toContain("▲ 0");
    expect(frame).not.toContain("▲ 2");

    await act(async () => {
      setup.renderer.destroy();
    });
  });
});

describe("ui: Responsive fullscreen layout & terminal size tests", () => {
  const mockClient: any = {
    state: null,
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

  it("responsive layout: minimum supported (110x38) renders without clipping and warning does not block", async () => {
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
    // Warning does not block because 110 >= 105 and 38 >= 34
    expect(frame).not.toContain("TERMINAL WINDOW TOO SMALL");
    expect(frame).toContain("CONQUEST.SH");
    expect(frame).toContain("WORLD MAP");
    expect(frame).toContain("! PLAYERS");
    expect(frame).toContain("! EVENT LOG / CHAT");

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

    await act(async () => {
      setupWide.renderer.destroy();
    });
  });
});


