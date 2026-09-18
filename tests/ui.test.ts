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
  it("contains all 10 canonical Ironreach territories across 3 sectors", () => {
    expect(MAP_IRONREACH.sectors.length).toBe(3);
    expect(MAP_IRONREACH.territories.length).toBe(10);

    const territoryIds = MAP_IRONREACH.territories.map((t) => t.id);
    const expected = [
      "frostfell",
      "highwatch",
      "iron_hollow",
      "stoneveil",
      "red_basin",
      "mossgate",
      "sunken_pass",
      "ember_coast",
      "ashmoor",
      "hollowmere",
    ];
    for (const id of expected) {
      expect(territoryIds).toContain(id);
    }
  });

  it("ensures no territorial realm boxes overlap on the canvas", () => {
    for (let i = 0; i < MAP_IRONREACH.territories.length; i++) {
      const a = MAP_IRONREACH.territories[i];
      const aWidth = a.render?.width ?? 18;
      const aHeight = a.render?.height ?? 5;
      const aX1 = a.position.x;
      const aX2 = a.position.x + aWidth;
      const aY1 = a.position.y;
      const aY2 = a.position.y + aHeight;

      for (let j = i + 1; j < MAP_IRONREACH.territories.length; j++) {
        const b = MAP_IRONREACH.territories[j];
        const bWidth = b.render?.width ?? 18;
        const bHeight = b.render?.height ?? 5;
        const bX1 = b.position.x;
        const bX2 = b.position.x + bWidth;
        const bY1 = b.position.y;
        const bY2 = b.position.y + bHeight;

        const xOverlap = aX1 < bX2 && aX2 > bX1;
        const yOverlap = aY1 < bY2 && aY2 > bY1;
        const overlaps = xOverlap && yOverlap;

        expect(overlaps).toBe(false);
      }
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
    expect(el.props.style.width).toBe(78);
    expect(el.props.style.height).toBe(30);

    // Inner container holds the 28 lines
    const innerBox = el.props.children;
    expect(innerBox.type).toBe("box");
    const lines = innerBox.props.children;
    expect(lines.length).toBe(28);

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
    expect(el.props.style.width).toBe(38);

    const cards = el.props.children;
    expect(cards.length).toBe(3);

    // Card 1: ! PLAYERS
    expect(cards[0].props.title).toBe("! PLAYERS");
    // Card 2: ! SELECTED TERRITORY
    expect(cards[1].props.title).toBe("! SELECTED TERRITORY");
    // Card 3: ! ACTIONS
    expect(cards[2].props.title).toBe("! ACTIONS");
  });

  it("renders Header with IRON FRONT banner, turn, active player and quote", async () => {
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
      "conquest.sh requires at least 110 columns x 38 rows for the tactical realm map."
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
    expect(frameOverridden).toContain("IRON FRONT");
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
    expect(frameZero).toContain("IRON FRONT");
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
    expect(frameLarge).toContain("IRON FRONT");
    expect(frameLarge).not.toContain("TERMINAL WINDOW TOO SMALL");
    await act(async () => {
      setupLarge.renderer.destroy();
    });
  });
});

