/**
 * Render-level guard: for each Earth-42 profile, render MapCanvas without and then
 * with a battle panel and diff the character frames to locate the panel rectangle.
 *
 * Asserts:
 *   1. The diff bounding box matches FULL_W×FULL_H or COND_W×COND_H exactly.
 *   2. The rectangle does not touch the outer canvas border rows/cols.
 *   3. Every cell inside the rectangle in the no-battle frame is ocean or decoration
 *      (specifically: no half-block / full-block terrain glyph ▀▄▌▐█).
 *
 * Reports which profiles got a full panel, which got condensed, and which had no panel.
 */
import { describe, expect, it } from "bun:test";
import { EARTH_42_BUNDLE } from "../packages/map-engine/src/maps/earth-42.js";
import {
  getMapContentDimensionsForLayout,
  selectRenderVariant,
} from "../packages/map-engine/src/index.js";
import type { BattleReport } from "../apps/client/src/ui/battle-report.js";

// ---------------------------------------------------------------------------
// Profile → representative terminal dimensions
// Each entry yields the given render profile when passed to selectRenderVariant.
// Derived via getLayoutModeForMap → getMapContentDimensionsForLayout → selectRenderVariant.
// ---------------------------------------------------------------------------
const PROFILE_TERMINALS: Record<string, { cols: number; rows: number; mode: string }> = {
  compact:      { cols: 90,  rows: 30, mode: "compact"  },
  "compact-tall": { cols: 100, rows: 45, mode: "compact"  },
  standard:     { cols: 130, rows: 50, mode: "compact"  },
  wide:         { cols: 180, rows: 50, mode: "standard" },
  large:        { cols: 200, rows: 60, mode: "wide"     },
  ultra:        { cols: 240, rows: 60, mode: "wide"     },
};

/** Terrain half-block / full-block glyphs that only appear over land cells. */
const LAND_GLYPHS = new Set(["▀", "▄", "▌", "▐", "█"]);

function makeReport(): BattleReport {
  return {
    key: "placement-test",
    attackerName: "Atlas",
    attackerColor: "#00d2ff",
    defenderName: "Bravo",
    defenderColor: "#ffaa00",
    sourceTerritoryName: "Alaska Range",
    targetTerritoryName: "Kamchatka",
    attackerRolls: [6, 4, 2],
    defenderRolls: [5, 4],
    pairs: [
      { attackerDie: 6, defenderDie: 5, attackerWins: true },
      { attackerDie: 4, defenderDie: 4, attackerWins: false },
    ],
    unpairedAttackerDice: [2],
    attackerLosses: 1,
    defenderLosses: 1,
    attackerUnitsBefore: 7,
    defenderUnitsBefore: 3,
    attackerUnitsAfter: 6,
    defenderUnitsAfter: 2,
    conquered: false,
    engagementRound: 1,
    engagementAttackerLosses: 1,
    engagementDefenderLosses: 1,
  };
}

/** Split a character frame into a 2-D array of Unicode code points (1 per terminal column). */
function parseFrame(frame: string): string[][] {
  return frame
    .split("\n")
    .filter((_, i, arr) => i < arr.length - 1 || _.length > 0) // drop trailing empty
    .map(line => [...line]); // spread handles multi-byte chars
}

interface BBox {
  minRow: number; maxRow: number;
  minCol: number; maxCol: number;
  width: number; height: number;
}

/** Return the bounding box of cells where grid2 differs from grid1, or null if identical. */
function diffBBox(grid1: string[][], grid2: string[][]): BBox | null {
  let minRow = Infinity, maxRow = -Infinity;
  let minCol = Infinity, maxCol = -Infinity;
  const rows = Math.max(grid1.length, grid2.length);
  for (let r = 0; r < rows; r++) {
    const row1 = grid1[r] ?? [];
    const row2 = grid2[r] ?? [];
    const cols = Math.max(row1.length, row2.length);
    for (let c = 0; c < cols; c++) {
      if ((row1[c] ?? " ") !== (row2[c] ?? " ")) {
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
      }
    }
  }
  if (minRow === Infinity) return null;
  return {
    minRow, maxRow, minCol, maxCol,
    width:  maxCol - minCol + 1,
    height: maxRow - minRow + 1,
  };
}

describe("battle panel placement — render-level diff across all Earth-42 profiles", () => {
  it("panel rectangle is ocean-only, correct size, and clear of canvas borders", async () => {
    // @ts-ignore runtime-only OpenTUI helpers
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");
    const { FULL_W, FULL_H, COND_W, COND_H } = await import("../apps/client/src/ui/BattlePanel.js");

    const results: string[] = [];
    const report = makeReport();

    for (const [profileName, term] of Object.entries(PROFILE_TERMINALS)) {
      const paneDims = getMapContentDimensionsForLayout(term.cols, term.rows, term.mode as any);
      const activeVariant = selectRenderVariant(EARTH_42_BUNDLE, paneDims);

      // Verify we got the expected profile (if not, note it but continue)
      if (activeVariant.profile !== profileName) {
        results.push(
          `[WARN] ${profileName}: terminal ${term.cols}×${term.rows} yielded ` +
          `profile '${activeVariant.profile}' (expected '${profileName}')`,
        );
      }

      // --- Render WITHOUT battle ---
      const setup1 = await testRender(
        React.createElement(MapCanvas, {
          mapBundle: EARTH_42_BUNDLE,
          contentDimensions: paneDims,
          territories: {},
          players: [],
          myPlayerId: null,
          phase: "attack" as const,
          selectedTerritoryId: null,
          targetTerritoryId: null,
          onSelectTerritory: () => {},
          onSelectTarget: () => {},
          onDeselect: () => {},
          battleAnimate: false,
        }),
        paneDims,
      );
      await act(async () => { await setup1.renderOnce(); });
      const frame1 = setup1.captureCharFrame();
      await act(async () => { setup1.renderer.destroy(); });

      // --- Render WITH battle ---
      const setup2 = await testRender(
        React.createElement(MapCanvas, {
          mapBundle: EARTH_42_BUNDLE,
          contentDimensions: paneDims,
          territories: {},
          players: [],
          myPlayerId: null,
          phase: "attack" as const,
          selectedTerritoryId: null,
          targetTerritoryId: null,
          onSelectTerritory: () => {},
          onSelectTarget: () => {},
          onDeselect: () => {},
          battle: report,
          battleAnimate: false,
        }),
        paneDims,
      );
      await act(async () => { await setup2.renderOnce(); });
      const frame2 = setup2.captureCharFrame();
      await act(async () => { setup2.renderer.destroy(); });

      const grid1 = parseFrame(frame1);
      const grid2 = parseFrame(frame2);
      const bbox = diffBBox(grid1, grid2);

      if (!bbox) {
        results.push(`${profileName} (pane ${paneDims.width}×${paneDims.height}): NO PANEL RENDERED`);
        continue;
      }

      // --- Determine expected panel size ---
      const isFullPanel   = bbox.width === FULL_W && bbox.height === FULL_H;
      const isCondPanel   = bbox.width === COND_W && bbox.height === COND_H;
      const panelLabel    = isFullPanel ? "full" : isCondPanel ? "condensed" : "UNKNOWN";

      results.push(
        `${profileName} (pane ${paneDims.width}×${paneDims.height} / ` +
        `land ${activeVariant.grid.width}×${activeVariant.grid.height}): ` +
        `${panelLabel} panel ${bbox.width}×${bbox.height} ` +
        `at rows ${bbox.minRow}–${bbox.maxRow}, cols ${bbox.minCol}–${bbox.maxCol}`,
      );

      // 1. Rectangle dimensions must match a known panel size
      expect(
        isFullPanel || isCondPanel,
        `[${profileName}] diff bbox ${bbox.width}×${bbox.height} must be ` +
        `${FULL_W}×${FULL_H} (full) or ${COND_W}×${COND_H} (condensed)`,
      ).toBe(true);

      // 2. Rectangle must not touch the outer canvas border rows/cols
      //    Canvas borders: row 0, row (H-1), col 0, col (W-1)
      expect(bbox.minRow > 0, `[${profileName}] panel top row (${bbox.minRow}) must be > 0 (inside top border)`).toBe(true);
      expect(bbox.maxRow < paneDims.height - 1, `[${profileName}] panel bottom row (${bbox.maxRow}) must be < ${paneDims.height - 1} (inside bottom border)`).toBe(true);
      expect(bbox.minCol > 0, `[${profileName}] panel left col (${bbox.minCol}) must be > 0 (inside left border)`).toBe(true);
      expect(bbox.maxCol < paneDims.width - 1, `[${profileName}] panel right col (${bbox.maxCol}) must be < ${paneDims.width - 1} (inside right border)`).toBe(true);

      // 3. Every cell in the bbox in frame1 (no-battle) must be ocean/decoration,
      //    never a land terrain glyph (▀▄▌▐█).
      const landCellsInArea: string[] = [];
      for (let r = bbox.minRow; r <= bbox.maxRow; r++) {
        const row = grid1[r] ?? [];
        for (let c = bbox.minCol; c <= bbox.maxCol; c++) {
          const ch = row[c] ?? " ";
          if (LAND_GLYPHS.has(ch)) {
            landCellsInArea.push(`(${r},${c})='${ch}'`);
          }
        }
      }
      expect(
        landCellsInArea.length,
        `[${profileName}] land glyphs found in panel area in no-battle frame: ${landCellsInArea.slice(0, 5).join(", ")}`,
      ).toBe(0);
    }

    // Print summary
    console.log("\n=== Battle panel placement summary ===");
    for (const r of results) console.log(" ", r);
    console.log("=== End ===\n");
  });
});
