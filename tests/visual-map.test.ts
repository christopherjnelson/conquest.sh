import { getMap, selectRenderVariant } from "../packages/map-engine/src/registry.js";
const ironreachBundle = getMap("ironreach")!;
const earthBundle = getMap("earth-42")!;
import { describe, expect, it } from "bun:test";
import {
  MAP_GRID_IRONREACH_COMPACT,
  MAP_GRID_IRONREACH_WIDE,
  getMapContentDimensionsForTerminal,
  getMapContentDimensionsForLayout,
  getLayoutModeForMap,
  getSidebarWidthForTerminal,
  getGeographyBoundingBox,
  getMicroTerritoryAt,
} from "../packages/map-engine/src/index.js";
import { getMapRenderLayout, getTerrainTextureMark } from "../apps/client/src/ui/MapCanvas.js";

describe("visual map: rendered geography occupancy", () => {
  it("chooses a map-aware full-width fallback at terminal boundaries and never clips Earth", async () => {
    // @ts-ignore runtime-only OpenTUI modules
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore runtime-only OpenTUI modules
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore runtime-only OpenTUI modules
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { App } = await import("../apps/client/src/ui/App.js");
    const client: any = {
      state: { mapId: "earth-42", phase: "lobby", players: [], territories: {}, sectors: {}, history: [], turnNumber: 0, activePlayerIndex: 0, pendingReinforcements: 0 },
      myPlayerId: "p1", status: "connected", roomCode: "E42B",
      onSnapshot: () => () => {}, onEvent: () => () => {}, onStatusChange: () => () => {}, onError: () => () => {},
      sendChat: () => {}, deploy: () => {}, attack: () => {}, fortify: () => {}, skipPhase: () => {}, endTurn: () => {}, ready: () => {},
    };
    const sizes = [
      { columns: 105, rows: 34, warning: true, mode: null },
      { columns: 105, rows: 38, warning: false, mode: "compact" },
      { columns: 120, rows: 38, warning: false, mode: "compact" },
      // The standard sidebar would leave less room than Earth's smallest land
      // crop, so these must use the full-width compact presentation.
      { columns: 130, rows: 38, warning: false, mode: "compact" },
      { columns: 134, rows: 38, warning: false, mode: "compact" },
      { columns: 140, rows: 45, warning: false, mode: "standard" },
      { columns: 180, rows: 51, warning: false, mode: "wide" },
    ] as const;

    for (const size of sizes) {
      const setup = await testRender(
        React.createElement(App, { client, terminalDimensions: size }),
        { width: size.columns, height: size.rows },
      );
      await act(async () => { await setup.renderOnce(); });
      const frame = setup.captureCharFrame();

      if (size.warning) {
        expect(frame, `${size.columns}x${size.rows}`).toContain("TERMINAL WINDOW TOO SMALL");
        await act(async () => { setup.renderer.destroy(); });
        continue;
      }

      expect(frame, `${size.columns}x${size.rows}`).not.toContain("TERMINAL WINDOW TOO SMALL");
      const mode = getLayoutModeForMap(size.columns, size.rows, earthBundle);
      expect(mode, `${size.columns}x${size.rows}`).toBe(size.mode!);
      const pane = getMapContentDimensionsForLayout(size.columns, size.rows, mode);
      const root = setup.renderer.root;
      const app = root.getChildren?.()[0]?.getChildren?.().length === 4 ? root.getChildren()[0] : root;
      const tacticalRow = app.getChildren()[1];
      const mapColumn = tacticalRow.getChildren()[0];
      const worldMap = mapColumn.getChildren()[0];
      const raster = worldMap.getChildren()[0];
      const selected = selectRenderVariant(earthBundle, pane).grid;
      const land = getGeographyBoundingBox(selected);

      // The rendered pane can receive a spare flex row. The selector must use
      // its declared pane, while this check uses the actual bordered WORLD MAP
      // interior that the raster is placed in.
      expect(worldMap.width - 2, `${size.columns}x${size.rows}`).toBeGreaterThanOrEqual(pane.width);
      expect(worldMap.height - 2, `${size.columns}x${size.rows}`).toBeGreaterThanOrEqual(pane.height);
      expect(raster.width, `${size.columns}x${size.rows}`).toBe(land.width);
      expect(raster.height, `${size.columns}x${size.rows}`).toBe(land.height);
      expect(raster.width, `${size.columns}x${size.rows}`).toBeLessThanOrEqual(worldMap.width - 2);
      expect(raster.height, `${size.columns}x${size.rows}`).toBeLessThanOrEqual(worldMap.height - 2);
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("uses a deterministic, sparse interior terrain grain", () => {
    const marks = Array.from({ length: 30 }, (_, y) =>
      Array.from({ length: 44 }, (_, x) => getTerrainTextureMark("C2", x, y + 26))
    ).flat();
    expect(marks).toEqual(Array.from({ length: 30 }, (_, y) =>
      Array.from({ length: 44 }, (_, x) => getTerrainTextureMark("C2", x, y + 26))
    ).flat());
    expect(marks.filter(Boolean).length).toBeGreaterThan(0);
    expect(marks.filter(Boolean).length).toBeLessThan(50);
    expect(marks).toContain("░");
    expect(marks).toContain("·");
  });

  it("uses land bounds rather than ocean decorations for both pane variants", () => {
    // These are the World Map pane dimensions supplied by App's shared layout
    // contract at the requested terminal sizes: 140×45 standard and 200×55
    // wide. MapCanvas crops to land, so chart decorations cannot affect this
    // measurement.
    const standardPane = getMapContentDimensionsForTerminal(140, 45);
    const widePane = getMapContentDimensionsForTerminal(200, 55);
    expect(standardPane).toEqual({ width: 99, height: 32 });
    expect(widePane).toEqual({ width: 155, height: 39 });
    const standard = getMapRenderLayout(MAP_GRID_IRONREACH_COMPACT, standardPane);
    const wide = getMapRenderLayout(MAP_GRID_IRONREACH_WIDE, widePane);
    expect(wide.width).toBe(wide.land.width);
    expect(wide.height).toBe(wide.land.height);
    expect(standard.width).toBe(standard.land.width);
    expect(standard.height).toBe(standard.land.height);
    expect(wide.landWidthRatio).toBeGreaterThanOrEqual(0.78);
    expect(wide.landHeightRatio).toBeGreaterThanOrEqual(0.72);
    expect(standard.landWidthRatio).toBeGreaterThanOrEqual(0.75);
    expect(standard.landHeightRatio).toBeGreaterThanOrEqual(0.70);

    // At the actual App pane sizes, the wide raster is materially larger than
    // the standard raster in both rendered axes and fits without clipping.
    expect(wide.land.width).toBeGreaterThan(standard.land.width);
    expect(wide.land.height).toBeGreaterThan(standard.land.height);
  });

  it("renders the geographic crop inside realistic standard and wide panes", async () => {
    // @ts-ignore OpenTUI's test helpers are runtime-only ESM modules.
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");

    for (const [viewport, pane, map] of [
      ["compact", getMapContentDimensionsForTerminal(140, 45), MAP_GRID_IRONREACH_COMPACT],
      ["wide", getMapContentDimensionsForTerminal(200, 55), MAP_GRID_IRONREACH_WIDE],
    ] as const) {
      const layout = getMapRenderLayout(map);
      const setup = await testRender(
        React.createElement(MapCanvas, {
          mapBundle: ironreachBundle,
          renderProfile: viewport,
          territories: {}, players: [], myPlayerId: null, phase: "lobby",
          selectedTerritoryId: null, targetTerritoryId: null,
          onSelectTerritory: () => {}, onSelectTarget: () => {}, onDeselect: () => {},
        }),
        pane,
      );
      await act(async () => { await setup.renderOnce(); });

      const findRaster = (node: any): any => {
        if (node?.width === layout.width && node?.height === layout.height) return node;
        for (const child of node?.getChildren?.() ?? []) {
          const found = findRaster(child);
          if (found) return found;
        }
        return null;
      };
      expect(findRaster(setup.renderer.root)).not.toBeNull();
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("keeps the 180x50/180x51 layout boundary inside App's bordered World Map content", async () => {
    // @ts-ignore runtime-only OpenTUI modules
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { App } = await import("../apps/client/src/ui/App.js");
    const client: any = {
      state: { mapId: "ironreach", phase: "lobby", players: [], territories: {}, sectors: {}, history: [], turnNumber: 0, activePlayerIndex: 0, pendingReinforcements: 0 }, myPlayerId: "p1", status: "connected", roomCode: "BORD",
      onSnapshot: () => () => {}, onEvent: () => () => {}, onStatusChange: () => () => {},
      onError: () => () => {}, sendChat: () => {}, deploy: () => {}, attack: () => {},
      fortify: () => {}, skipPhase: () => {}, endTurn: () => {}, ready: () => {},
    };

    const render = async (columns: number, rows: number) => {
      const setup = await testRender(
        React.createElement(App, { client, terminalDimensions: { columns, rows } }),
        { width: columns, height: rows }
      );
      await act(async () => { await setup.renderOnce(); });
      const root = setup.renderer.root;
      const app = root.getChildren?.()[0]?.getChildren?.().length === 4
        ? root.getChildren()[0]
        : root;
      const worldMap = app.getChildren()[1].getChildren()[0].getChildren()[0];
      const raster = worldMap.getChildren()[0];
      return { setup, worldMap, raster };
    };

    // The capped sidebar gives the standard layout enough horizontal room for
    // Ironreach's wide rendering when its land crop fits the map pane.
    const at50 = await render(180, 50);
    expect(at50.worldMap.width - 2).toBe(139);
    expect(at50.worldMap.height - 2).toBe(37);
    expect(at50.raster.width).toBe(getMapRenderLayout(MAP_GRID_IRONREACH_WIDE).width);
    expect(at50.raster.height).toBe(getMapRenderLayout(MAP_GRID_IRONREACH_WIDE).height);
    expect(at50.raster.width).toBeLessThanOrEqual(at50.worldMap.width - 2);
    expect(at50.raster.height).toBeLessThanOrEqual(at50.worldMap.height - 2);
    await act(async () => { at50.setup.renderer.destroy(); });

    // At 180x51 the wide pane grows only as far as the capped sidebar allows.
    const at51 = await render(180, 51);
    expect(at51.worldMap.width - 2).toBe(135);
    expect(at51.worldMap.height - 2).toBe(36);
    expect(at51.raster.width).toBe(getMapRenderLayout(MAP_GRID_IRONREACH_WIDE).width);
    expect(at51.raster.height).toBe(getMapRenderLayout(MAP_GRID_IRONREACH_WIDE).height);
    expect(at51.raster.width).toBeLessThanOrEqual(at51.worldMap.width - 2);
    expect(at51.raster.height).toBeLessThanOrEqual(at51.worldMap.height - 2);
    await act(async () => { at51.setup.renderer.destroy(); });
  });

  it("caps the actual App sidebar and gives remaining columns to WORLD MAP", async () => {
    // @ts-ignore runtime-only OpenTUI modules
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { App } = await import("../apps/client/src/ui/App.js");
    const client: any = {
      state: { mapId: "ironreach", phase: "lobby", players: [], territories: {}, sectors: {}, history: [], turnNumber: 0, activePlayerIndex: 0, pendingReinforcements: 0 },
      myPlayerId: "p1", status: "connected", roomCode: "BORD",
      onSnapshot: () => () => {}, onEvent: () => () => {}, onStatusChange: () => () => {},
      onError: () => () => {}, sendChat: () => {}, deploy: () => {}, attack: () => {},
      fortify: () => {}, skipPhase: () => {}, endTurn: () => {}, ready: () => {},
    };
    for (const [columns, rows, expectedSidebar] of [
      [140, 45, 38], [180, 51, 42], [200, 55, 42], [220, 60, 42], [240, 60, 42],
    ]) {
      const setup = await testRender(
        React.createElement(App, { client, terminalDimensions: { columns, rows } }),
        { width: columns, height: rows },
      );
      await act(async () => { await setup.renderOnce(); });
      const root = setup.renderer.root;
      const app = root.getChildren?.()[0]?.getChildren?.().length === 4
        ? root.getChildren()[0] : root;
      const tacticalRow = app.getChildren()[1];
      const worldMap = tacticalRow.getChildren()[0].getChildren()[0];
      const sidebar = tacticalRow.getChildren()[1];
      expect(sidebar.width).toBe(expectedSidebar);
      expect(sidebar.width).toBe(getSidebarWidthForTerminal(columns, rows));
      expect({ width: worldMap.width - 2, height: worldMap.height - 2 })
        .toEqual(getMapContentDimensionsForTerminal(columns, rows));
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("keeps standard-pane territory labels inside their own land shapes", async () => {
    // @ts-ignore runtime-only OpenTUI modules
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");
    const setup = await testRender(React.createElement(MapCanvas, {
          mapBundle: ironreachBundle,
      renderProfile: "compact", territories: {}, players: [], myPlayerId: null, phase: "lobby",
      selectedTerritoryId: null, targetTerritoryId: null,
      onSelectTerritory: () => {}, onSelectTarget: () => {}, onDeselect: () => {},
    }), { width: 140, height: 45 });
    await act(async () => { await setup.renderOnce(); });

    const rows = setup.captureCharFrame().split("\n");
    // The former collision put both northern labels on one printed row.
    expect(rows.some((row: string) => row.includes("WHISPERING") && row.includes("HIGHWATCH"))).toBe(false);
    // A nearby-island collision must not merge two different names either.
    expect(rows.some((row: string) => row.includes("MOSS") && row.includes("VERDANT"))).toBe(false);
    const compassRow = rows.findIndex((row: string) => row.includes("W ┼ E"));
    expect(compassRow).toBeGreaterThanOrEqual(1);
    expect(rows[compassRow - 1]).toContain("N");
    expect(rows[compassRow + 1]).toContain("S");
    await act(async () => { setup.renderer.destroy(); });
  });

  it("keeps C1 and C3 names primary in a wide active map", async () => {
    // @ts-ignore runtime-only OpenTUI modules
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");
    const setup = await testRender(React.createElement(MapCanvas, {
          mapBundle: ironreachBundle,
      renderProfile: "wide",
      territories: {
        C1: { id: "C1", ownerId: "p1", units: 3 },
        C3: { id: "C3", ownerId: "p1", units: 3 },
      },
      players: [{ id: "p1", name: "Alex", colorHex: "#00d2ff", connected: true, isAlive: true, ready: true }],
      myPlayerId: "p1", phase: "deployment", selectedTerritoryId: null, targetTerritoryId: null,
      onSelectTerritory: () => {}, onSelectTarget: () => {}, onDeselect: () => {},
    }), { width: 160, height: 40 });
    await act(async () => { await setup.renderOnce(); });
    const frame = setup.captureCharFrame();
    expect(frame).toContain("FROSTFELL");
    expect(frame).toContain("GLACIER BAY");
    await act(async () => { setup.renderer.destroy(); });
  });

  it("renders terrain grain in ordinary land while keeping selected and target interiors solid", async () => {
    // @ts-ignore runtime-only OpenTUI modules
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");
    const renderInteractionFrame = async (selectedTerritoryId: string | null, targetTerritoryId: string | null) => {
      const setup = await testRender(React.createElement(MapCanvas, {
          mapBundle: ironreachBundle,
      renderProfile: "wide",
      territories: {
        C2: { id: "C2", ownerId: "p1", units: 3 },
        B3: { id: "B3", ownerId: "p1", units: 3 },
      },
      players: [{ id: "p1", name: "Alex", colorHex: "#00d2ff", connected: true, isAlive: true, ready: true }],
      myPlayerId: "p1", phase: "deployment", selectedTerritoryId, targetTerritoryId,
      onSelectTerritory: () => {}, onSelectTarget: () => {}, onDeselect: () => {},
      }), { width: 160, height: 40 });
      await act(async () => { await setup.renderOnce(); });
      const frame = setup.captureCharFrame();
      await act(async () => { setup.renderer.destroy(); });
      return frame;
    };

    const selectedFrame = await renderInteractionFrame("C2", null);
    const targetFrame = await renderInteractionFrame(null, "B3");
    const frame = selectedFrame;
    expect(frame).toContain("░");
    expect(frame).toContain("·");

    const assertSolidInterior = (territoryId: string, renderedFrame: string) => {
      const layout = getMapRenderLayout(MAP_GRID_IRONREACH_WIDE);
      const rows = renderedFrame.split("\n");
      const interiorCells: Array<{ x: number; y: number }> = [];
      for (let y = layout.sourceY; y <= layout.land.maxY; y++) {
        for (let x = layout.sourceX; x <= layout.land.maxX; x++) {
          const microY = 2 * y;
          if (
            getMicroTerritoryAt(x, microY, MAP_GRID_IRONREACH_WIDE) === territoryId &&
            getMicroTerritoryAt(x, microY + 1, MAP_GRID_IRONREACH_WIDE) === territoryId &&
            getMicroTerritoryAt(x - 1, microY, MAP_GRID_IRONREACH_WIDE) === territoryId &&
            getMicroTerritoryAt(x + 1, microY, MAP_GRID_IRONREACH_WIDE) === territoryId &&
            getMicroTerritoryAt(x, microY - 1, MAP_GRID_IRONREACH_WIDE) === territoryId &&
            getMicroTerritoryAt(x, microY + 2, MAP_GRID_IRONREACH_WIDE) === territoryId
          ) {
            interiorCells.push({ x, y });
          }
        }
      }
      const terrainMarkCells = interiorCells.filter(({ x, y }) =>
        getTerrainTextureMark(territoryId, x, 2 * y) !== ""
      );
      // This samples the exact cells that would paint terrain grain in an
      // ordinary territory, while avoiding punctuation from its text label.
      expect(terrainMarkCells.length).toBeGreaterThan(0);
      for (const { x, y } of terrainMarkCells) {
        // testRender wraps a direct component in its one-cell test border.
        const char = rows[y - layout.sourceY + 1]?.[x - layout.sourceX + 1];
        expect(char, `${territoryId} terrain-mark cell at ${x},${y}`).not.toBe(
          getTerrainTextureMark(territoryId, x, 2 * y)
        );
      }
    };

    assertSolidInterior("C2", selectedFrame);
    assertSolidInterior("B3", targetFrame);
  });
});
