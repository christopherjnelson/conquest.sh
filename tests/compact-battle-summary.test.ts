/**
 * compact-battle-summary.test.ts
 *
 * Tests for the compact inspector battle-summary feature:
 *   1. Unit tests for formatCompactBattleLine.
 *   2. Render test at a compact terminal size (Earth-42 compact profile →
 *      resolveBattlePanelPlacement returns "none") – asserts the summary line
 *      appears in the inspector and that no text overlaps a border character.
 *   3. Render test where the panel IS placed – asserts the line does NOT appear
 *      in the inspector (no duplication).
 */
import { describe, expect, it } from "bun:test";
import { EARTH_42_BUNDLE } from "../packages/map-engine/src/maps/earth-42.js";
import {
  getMapContentDimensionsForLayout,
  selectRenderVariant,
} from "../packages/map-engine/src/index.js";
import type { BattleReport } from "../apps/client/src/ui/battle-report.js";
import {
  formatCompactBattleLine,
  resolveBattlePanelPlacement,
} from "../apps/client/src/ui/battle-report.js";
import { FULL_W, FULL_H, COND_W, COND_H } from "../apps/client/src/ui/BattlePanel.js";

// ─── Shared helpers ────────────────────────────────────────────────────────

function makeReport(overrides: Partial<BattleReport> = {}): BattleReport {
  return {
    key: "test-key",
    attackerName: "Atlas",
    attackerColor: "#00d2ff",
    defenderName: "Bravo",
    defenderColor: "#ffaa00",
    sourceTerritoryName: "Alaska",
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
    engagementRound: 2,
    engagementAttackerLosses: 1,
    engagementDefenderLosses: 1,
    ...overrides,
  };
}

// ─── 1. Unit tests: formatCompactBattleLine ───────────────────────────────

describe("formatCompactBattleLine", () => {
  it("formats a normal battle correctly", () => {
    const report = makeReport();
    const line = formatCompactBattleLine(report, 80);
    // Must contain the sword glyph, round, source, arrow, target, dice, losses
    expect(line).toContain("⚔");
    expect(line).toContain("R2");
    expect(line).toContain("Alaska");
    expect(line).toContain("▸");
    expect(line).toContain("Kamchatka");
    expect(line).toContain("[6 4 2]");
    expect(line).toContain("[5 4]");
    expect(line).toContain("−1/−1");
    expect(line.length).toBeLessThanOrEqual(80);
  });

  it("formats a conquest correctly", () => {
    const report = makeReport({ conquered: true });
    const line = formatCompactBattleLine(report, 80);
    expect(line).toContain("⚔");
    expect(line).toContain("CONQUERED");
    expect(line).toContain("Kamchatka");
    // Should not contain dice info
    expect(line).not.toContain("[6 4 2]");
    expect(line.length).toBeLessThanOrEqual(80);
  });

  it("truncates territory names when line is too long", () => {
    const report = makeReport({
      sourceTerritoryName: "Eastern United States Seaboard",
      targetTerritoryName: "Great Northern Territory of Canada",
    });
    const line = formatCompactBattleLine(report, 50);
    expect(line.length).toBeLessThanOrEqual(50);
    expect(line).toContain("⚔");
    // Should have truncation ellipsis
    expect(line).toContain("…");
  });

  it("truncates conquest line when target name is very long", () => {
    const report = makeReport({
      conquered: true,
      targetTerritoryName: "The Great Northern Territory of the Vast Canadian Plains",
    });
    const line = formatCompactBattleLine(report, 30);
    expect(line.length).toBeLessThanOrEqual(30);
    expect(line).toContain("⚔");
    expect(line).toContain("CONQUERED");
    expect(line).toContain("…");
  });

  it("handles a missing before-counts case (attackerUnitsBefore undefined)", () => {
    const report = makeReport({
      attackerUnitsBefore: undefined,
      defenderUnitsBefore: undefined,
      attackerUnitsAfter: undefined,
      defenderUnitsAfter: undefined,
    });
    // Should not throw; losses are still available
    const line = formatCompactBattleLine(report, 80);
    expect(line).toContain("⚔");
    expect(line).toContain("−1/−1");
  });

  it("handles empty attacker rolls (no dice)", () => {
    const report = makeReport({ attackerRolls: [], defenderRolls: [] });
    const line = formatCompactBattleLine(report, 80);
    expect(line).toContain("⚔");
    // Should use "?" placeholder for missing dice
    expect(line).toContain("?");
  });
});

// ─── 2. Render test: compact profile → no panel → summary appears ─────────

// Terminal dimensions that yield the Earth-42 "compact" profile
const COMPACT_COLS = 90;
const COMPACT_ROWS = 30;

describe("CompactInspector battle summary — compact profile (no panel)", () => {
  it("shows battle summary when battlePanelPlaced=false and confirms no panel for compact profile", async () => {
    // First verify that Earth-42 compact yields "none" placement
    const paneDims = getMapContentDimensionsForLayout(COMPACT_COLS, COMPACT_ROWS, "compact");
    const grid = selectRenderVariant(EARTH_42_BUNDLE, paneDims).grid;
    const placement = resolveBattlePanelPlacement(grid, paneDims, FULL_W, FULL_H, COND_W, COND_H);
    expect(placement).toBe("none");

    // @ts-ignore runtime-only OpenTUI helpers
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { CompactInspector } = await import("../apps/client/src/ui/CompactInspector.js");

    const report = makeReport();
    const inspectorWidth = 90;

    const setup = await testRender(
      React.createElement(CompactInspector, {
        mapBundle: EARTH_42_BUNDLE,
        state: null,
        myPlayerId: null,
        selectedTerritoryId: null,
        hoveredTerritoryId: null,
        targetTerritoryId: null,
        phase: "attack" as const,
        onDeploy: () => {},
        onAttack: () => {},
        onFortify: () => {},
        onSkipPhase: () => {},
        onEndTurn: () => {},
        battleReport: report,
        battlePanelPlaced: false,
      }),
      { width: inspectorWidth, height: 3 },
    );
    await act(async () => { await setup.renderOnce(); });
    const frame = setup.captureCharFrame();
    await act(async () => { setup.renderer.destroy(); });

    const lines = frame.split("\n").filter((l: string) => l.length > 0);

    // --- Core assertions: battle summary appears with expected content ---
    // The content row is lines[1] (between the two border rows)
    const contentRow = lines[1] ?? "";

    expect(contentRow).toContain("⚔");
    expect(contentRow).toContain("R2");
    // Dice must appear: either full or truncated versions
    expect(contentRow).toMatch(/6.*4.*2/);  // attacker dice
    expect(contentRow).toMatch(/5.*4/);     // defender dice
    // Loss notation
    expect(contentRow).toContain("−1");

    // --- No text-overlap with border characters ---
    // The inspector has `height: 3` (1 top border + 1 content + 1 bottom border).
    // The top border row includes the component title — that is expected behaviour.
    // Verify there are exactly 3 non-empty lines; more would mean content overflowed.
    const nonEmptyLines = lines.filter((l: string) => l.trim().length > 0);
    expect(
      nonEmptyLines.length,
      `Expected 3 frame lines (border + content + border), got ${nonEmptyLines.length}:\n${nonEmptyLines.join("\n")}`,
    ).toBe(3);

    const topRow    = lines[0] ?? "";
    const bottomRow = lines[lines.length - 1] ?? "";

    // The battle summary (⚔) must appear only in the content row, never in border rows.
    expect(topRow).not.toContain("⚔");
    expect(bottomRow).not.toContain("⚔");

    // Print the frame for the task report
    console.log("\n=== Compact Inspector battle-summary frame ===");
    for (const line of lines) console.log(`  ${JSON.stringify(line)}`);
    console.log("=== End ===\n");
  });
});

// ─── 3. Render test: panel placed → summary must NOT appear ───────────────

describe("CompactInspector battle summary — panel placed → no duplication", () => {
  it("does not show battle summary when battlePanelPlaced=true", async () => {
    // @ts-ignore
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { CompactInspector } = await import("../apps/client/src/ui/CompactInspector.js");

    const report = makeReport();

    const setup = await testRender(
      React.createElement(CompactInspector, {
        mapBundle: EARTH_42_BUNDLE,
        state: null,
        myPlayerId: null,
        selectedTerritoryId: null,
        hoveredTerritoryId: null,
        targetTerritoryId: null,
        phase: "attack" as const,
        onDeploy: () => {},
        onAttack: () => {},
        onFortify: () => {},
        onSkipPhase: () => {},
        onEndTurn: () => {},
        battleReport: report,
        battlePanelPlaced: true,   // panel was placed on the map → no summary here
      }),
      { width: 180, height: 3 },
    );
    await act(async () => { await setup.renderOnce(); });
    const frame = setup.captureCharFrame();
    await act(async () => { setup.renderer.destroy(); });

    const lines = frame.split("\n").filter((l: string) => l.length > 0);
    const contentRow = lines[1] ?? "";

    // The summary line must NOT appear when the map already shows a panel
    expect(contentRow).not.toContain("⚔");
    // Should show the normal players/territory info instead (no battle line)
    // The inspector shows "! PLAYERS:" header or "Waiting for players..." text.
    expect(contentRow).toMatch(/players|PLAYERS|Waiting/i);
  });
});
