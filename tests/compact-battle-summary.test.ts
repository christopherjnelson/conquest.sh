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

// ─── Render test helpers ──────────────────────────────────────────────────

/**
 * Render the CompactInspector at the given width and return the 3 frame lines.
 * All renders use: phase=attack, one target territory "AS01", no state (no
 * players, so "Waiting for players…" appears unless battle summary overrides).
 */
async function renderInspector(opts: {
  width: number;
  battleReport: BattleReport | null;
  battlePanelPlaced: boolean;
  targetTerritoryId?: string | null;
}): Promise<{ lines: string[]; contentRow: string; topRow: string; bottomRow: string }> {
  // @ts-ignore runtime-only OpenTUI helpers
  const React = (await import("../apps/client/node_modules/react/index.js")).default;
  // @ts-ignore
  const { act } = await import("../apps/client/node_modules/react/index.js");
  // @ts-ignore
  const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
  const { CompactInspector } = await import("../apps/client/src/ui/CompactInspector.js");

  const setup = await testRender(
    React.createElement(CompactInspector, {
      mapBundle: EARTH_42_BUNDLE,
      state: null,
      myPlayerId: "p1",
      selectedTerritoryId: null,
      hoveredTerritoryId: null,
      targetTerritoryId: opts.targetTerritoryId ?? "AS01",
      phase: "attack" as const,
      onDeploy: () => {},
      onAttack: () => {},
      onFortify: () => {},
      onSkipPhase: () => {},
      onEndTurn: () => {},
      battleReport: opts.battleReport,
      battlePanelPlaced: opts.battlePanelPlaced,
      terminalColumns: opts.width,
    }),
    { width: opts.width, height: 3 },
  );
  await act(async () => { await setup.renderOnce(); });
  const frame = setup.captureCharFrame();
  await act(async () => { setup.renderer.destroy(); });

  const lines = frame.split("\n").filter((l: string) => l.length > 0);
  return {
    lines,
    contentRow: lines[1] ?? "",
    topRow: lines[0] ?? "",
    bottomRow: lines[lines.length - 1] ?? "",
  };
}

/**
 * Checks that no button-border overflow is present in the bottom border row.
 *
 * The classic symptom of the overlap bug: bordered boxes inside a height:3
 * inspector push their closing `]─┘` characters into the bottom border row,
 * producing patterns like `│─]─────────│─` next to the inspector's own
 * `└──...──┘` frame.  We detect this by looking for `]─` adjacent to the
 * inspector's closing border character — a pattern that cannot arise from
 * the inspector's own frame or from clean borderless button text.
 *
 * (The top border may legitimately contain a component title; the bottom
 * border may also have some content in rare overflow cases that are pre-existing
 * — we only flag the specific bordered-button artifact pattern.)
 */
function assertNoButtonBorderOverflow(
  lines: string[],
  label: string,
): void {
  const bottomRow = lines[lines.length - 1] ?? "";

  // "│─]" or "]─" immediately before border chars are the telltale signs of
  // a bordered button's bottom-border row overflowing into the inspector's
  // bottom border row.
  expect(
    bottomRow,
    `[${label}] Button border artifact (]─) found in bottom border row:\n  ${JSON.stringify(bottomRow)}`,
  ).not.toMatch(/\]─/);
}

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

    const report = makeReport();
    const { lines, contentRow, topRow, bottomRow } = await renderInspector({
      width: COMPACT_COLS,
      battleReport: report,
      battlePanelPlaced: false,
    });

    // --- Core assertions: battle summary appears with expected content ---
    expect(contentRow).toContain("⚔");
    expect(contentRow).toContain("R2");
    // Dice must appear (full or truncated)
    expect(contentRow).toMatch(/6.*4.*2/);  // attacker dice
    expect(contentRow).toMatch(/5.*4/);     // defender dice
    // Loss notation
    expect(contentRow).toContain("−1");

    // --- Action buttons must be intact ---
    // The attack button text is "[ ⚔ Attack ]" (no target since state=null / no armies),
    // and the skip button is "[ » Skip ]".
    expect(contentRow).toMatch(/\[ ⚔ Attack\b.*\]/);
    expect(contentRow).toMatch(/\[ » Skip \]/);

    // The battle summary ⚔ must not appear in border rows
    expect(topRow).not.toMatch(/⚔ R\d/);
    expect(bottomRow).not.toMatch(/⚔ R\d/);

    // No button labels may overflow into the bottom border row
    assertNoButtonBorderOverflow(lines, "compact-with-battle");

    // Print the frame for the task report
    console.log("\n=== Compact Inspector battle-summary frame (90-wide) ===");
    for (const line of lines) console.log(`  ${JSON.stringify(line)}`);
    console.log("=== End ===\n");
  });

  it("shows intact buttons in the no-battle case at 90-wide", async () => {
    const { lines, contentRow } = await renderInspector({
      width: COMPACT_COLS,
      battleReport: null,
      battlePanelPlaced: false,
    });

    // Attack and skip buttons must be complete (no truncated labels)
    expect(contentRow).toMatch(/\[ ⚔ Attack\b.*\]/);
    expect(contentRow).toMatch(/\[ » Skip \]/);

    assertNoButtonBorderOverflow(lines, "compact-no-battle");

    console.log("\n=== Compact Inspector no-battle frame (90-wide) ===");
    for (const line of lines) console.log(`  ${JSON.stringify(line)}`);
    console.log("=== End ===\n");
  });
});

// ─── 3. Render test: panel placed → summary must NOT appear ───────────────

describe("CompactInspector battle summary — panel placed → no duplication", () => {
  it("does not show battle summary when battlePanelPlaced=true", async () => {
    const report = makeReport();
    const { lines, contentRow } = await renderInspector({
      width: 180,
      battleReport: report,
      battlePanelPlaced: true,
    });

    // The battle summary line must NOT appear when the map already shows a panel.
    // The attack button also contains "⚔", so check for the summary-specific
    // pattern "⚔ R{n}" (round indicator) rather than bare "⚔".
    expect(contentRow).not.toMatch(/⚔ R\d/);
    // Should show the normal players/territory info instead (no battle line)
    expect(contentRow).toMatch(/players|PLAYERS|Waiting/i);

    // Buttons must also be intact at the larger width
    expect(contentRow).toMatch(/\[ ⚔ Attack\b.*\]/);
    expect(contentRow).toMatch(/\[ » Skip \]/);
    assertNoButtonBorderOverflow(lines, "wide-panel-placed");
  });
});
