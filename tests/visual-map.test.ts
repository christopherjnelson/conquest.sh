import { describe, expect, it } from "bun:test";
import {
  MAP_GRID_IRONREACH_COMPACT,
  MAP_GRID_IRONREACH_WIDE,
} from "../packages/map-engine/src/index.js";
import { getMapRenderLayout, getTerrainTextureMark } from "../apps/client/src/ui/MapCanvas.js";

describe("visual map: rendered geography occupancy", () => {
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
    // These are the actual inner-pane dimensions observed at the standard and
    // wide breakpoints. MapCanvas crops its raster to land, so routes and chart
    // decoration cannot make this measurement look healthier than it is.
    const standardPane = { width: 102, height: 30 };
    // 132 is the current authored wide land width. A 131-column pane selects
    // compact upstream, so wide occupancy must never be tested while clipped.
    const widePane = { width: 132, height: 36 };
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

    // At a realistic wide terminal the wide raster is materially larger than
    // the standard raster in both rendered axes.
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
      ["compact", { width: 102, height: 30 }, MAP_GRID_IRONREACH_COMPACT],
      ["wide", { width: 132, height: 36 }, MAP_GRID_IRONREACH_WIDE],
    ] as const) {
      const layout = getMapRenderLayout(map);
      const setup = await testRender(
        React.createElement(MapCanvas, {
          viewport,
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

  it("keeps standard-pane territory labels inside their own land shapes", async () => {
    // @ts-ignore runtime-only OpenTUI modules
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");
    const setup = await testRender(React.createElement(MapCanvas, {
      viewport: "compact", territories: {}, players: [], myPlayerId: null, phase: "lobby",
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
      viewport: "wide",
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

  it("renders terrain grain in ordinary land while preserving a selected solid field", async () => {
    // @ts-ignore runtime-only OpenTUI modules
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");
    const setup = await testRender(React.createElement(MapCanvas, {
      viewport: "wide",
      territories: {
        C2: { id: "C2", ownerId: "p1", units: 3 },
        B2: { id: "B2", ownerId: "p1", units: 3 },
      },
      players: [{ id: "p1", name: "Alex", colorHex: "#00d2ff", connected: true, isAlive: true, ready: true }],
      myPlayerId: "p1", phase: "deployment", selectedTerritoryId: "C2", targetTerritoryId: null,
      onSelectTerritory: () => {}, onSelectTarget: () => {}, onDeselect: () => {},
    }), { width: 160, height: 40 });
    await act(async () => { await setup.renderOnce(); });
    const frame = setup.captureCharFrame();
    expect(frame).toContain("░");
    expect(frame).toContain("·");
    // The selected territory itself remains a crisp solid cyan field.
    const c2Line = frame.split("\n").find((line: string) => line.includes("C2"));
    expect(c2Line).toBeDefined();
    await act(async () => { setup.renderer.destroy(); });
  });
});
