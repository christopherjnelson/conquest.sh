import React from "react";
import type { GamePhase, GameState } from "@conquest/protocol";
import { getDefaultMap, type MapBundle } from "@conquest/map-engine";
import type { BattleReport } from "./battle-report.js";

export interface CompactInspectorProps {
  mapBundle?: MapBundle;
  state: GameState | null;
  myPlayerId: string | null;
  selectedTerritoryId: string | null;
  hoveredTerritoryId?: string | null;
  targetTerritoryId: string | null;
  roomCode?: string | null;
  phase: GamePhase;
  onDeploy: () => void;
  pendingConquestMove?: GameState["pendingConquestMove"];
  onAttack: () => void;
  onFortify: () => void;
  onSkipPhase: () => void;
  onEndTurn: () => void;
  pendingPhaseAction?: "skip-attack" | "end-turn" | null;
  onReady?: () => void;
  onSelectTarget?: (territoryId: string) => void;
  onSelectTerritory?: (territoryId: string) => void;
  /**
   * The most recent battle report derived from game events.
   * Passed in from App, which derives it via deriveBattleReport.
   */
  battleReport?: BattleReport | null;
  /**
   * Whether MapCanvas successfully placed a battle panel (full or condensed).
   * When false and battleReport is set, the inspector shows a one-line battle
   * summary in place of the territory info — the lowest-priority left-side
   * content. This keeps the inspector's height:3 unchanged (no new rows) while
   * giving compact players visual battle feedback that the map couldn't provide.
   */
  battlePanelPlaced?: boolean;
  /**
   * Terminal column count passed from App so the left-info lane can be bounded
   * to leave enough room for action buttons.  Defaults to 120 when omitted.
   */
  terminalColumns?: number;
}

function fitCompactText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 1))}…` : value;
}

export function CompactInspector({
  mapBundle = getDefaultMap(),
  state,
  myPlayerId,
  selectedTerritoryId,
  hoveredTerritoryId,
  targetTerritoryId,
  phase,
  onDeploy,
  pendingConquestMove,
  onAttack,
  onFortify,
  onSkipPhase,
  onEndTurn,
  pendingPhaseAction,
  onReady,
  battleReport,
  battlePanelPlaced = false,
  terminalColumns = 120,
}: CompactInspectorProps) {
  const territories = state?.territories ?? {};
  const activePlayer = state ? state.players[state.activePlayerIndex] : undefined;
  const isMyTurn = Boolean(activePlayer && activePlayer.id === myPlayerId);
  const pendingReinforcements = state?.pendingReinforcements ?? 0;
  const isLobby = phase === "lobby";
  const players = state?.players ?? [];

  // Hover populates inspector immediately; if mouse moves away, reverts to selected
  const isHoveredDifferent = Boolean(hoveredTerritoryId && hoveredTerritoryId !== selectedTerritoryId);
  const displayTid = hoveredTerritoryId ?? selectedTerritoryId;
  const inspectionMode: "hovered" | "selected" | "none" =
    isHoveredDifferent
      ? "hovered"
      : selectedTerritoryId
      ? "selected"
      : "none";

  const territoryState = displayTid ? territories[displayTid] : undefined;
  // Hovering changes the information shown here, never the territory an
  // action will use.
  const selectedTerritoryState = selectedTerritoryId ? territories[selectedTerritoryId] : undefined;
  const gridDef = displayTid ? mapBundle.definition.territories.find((t) => t.id === displayTid) : undefined;
  const region = mapBundle.definition.sectors.find(s => s.id === gridDef?.sectorId);

  const territoryName = gridDef?.name ?? territoryState?.name ?? displayTid ?? "";
  const sectorName = region?.name ?? mapBundle.metadata.regionSingular;
  const bonus = region?.bonusReinforcements ?? 0;
  const neighbors = gridDef?.neighbors ?? territoryState?.neighbors ?? [];
  const neighborsStr = neighbors.map(id => mapBundle.metadata.displayCodes[id] ?? id).join(",");

  const ownerId = territoryState?.ownerId;
  const owner = ownerId ? players.find((p) => p.id === ownerId) : undefined;
  const ownerName = isLobby ? "Unclaimed" : owner ? owner.name : "Unclaimed";
  const ownerColor = isLobby ? "#94a3b8" : owner?.colorHex ?? "#94a3b8";
  const armiesCount = territoryState?.units ?? 0;

  // Target territory details
  const targetTerritory = targetTerritoryId ? territories[targetTerritoryId] : null;
  const isActionSourceOwnedByMe = Boolean(
    selectedTerritoryState?.ownerId && selectedTerritoryState.ownerId === myPlayerId
  );
  const isTargetEnemy = Boolean(targetTerritory && targetTerritory.ownerId !== myPlayerId);
  const isTargetFriendly = Boolean(targetTerritory && targetTerritory.ownerId === myPlayerId);

  const canDeploy = isMyTurn && phase === "deployment" && isActionSourceOwnedByMe && pendingReinforcements > 0;
  const canAttack = isMyTurn && !pendingConquestMove && phase === "attack" && isActionSourceOwnedByMe && isTargetEnemy && (selectedTerritoryState?.units ?? 0) >= 2;
  const canFortify = isMyTurn && phase === "fortify" && isActionSourceOwnedByMe && isTargetFriendly && (selectedTerritoryState?.units ?? 0) >= 2;
  const canSkipOrEnd = isMyTurn && !pendingConquestMove && (phase === "attack" || phase === "fortify");
  // A mandatory conquest-move control needs the extra right-side cells. In
  // every other phase, give the inspector a wider lane for readable names.
  //
  // We now compute the left-info lane width dynamically from the terminal
  // width so the right-side action buttons always have room to render.
  //
  // The inspector box has 1-char borders + 1-char padding on each side:
  //   innerWidth = terminalColumns − 2 (border) − 2 (padding) = terminalColumns − 4
  //
  // Reserve ~45 chars for the action buttons (worst case: one attack button
  // plus one skip/end-turn button, each with padding, plus a gap).  Cap the
  // left lane at 65 so it doesn't sprawl at very wide terminals, and floor it
  // at 28 so the lane is always minimally useful.
  const innerWidth = Math.max(0, terminalColumns - 4);
  // When a conquest move is pending the button area is wider ("MOVE TROOPS…"
  // plus the mandatory troop-count selector takes the full right side).
  const buttonsReserve = pendingConquestMove && isMyTurn ? 55 : 45;
  const compactInfoWidth = Math.min(65, Math.max(28, innerWidth - buttonsReserve));
  const compactNameLimit = Math.min(14, Math.max(6, Math.floor(compactInfoWidth / 4.5)));

  // Battle summary line — shown only when the map could NOT place a panel.
  // Replaces the territory / players left-info section (same row, same width),
  // because it's the lowest-priority content there: territory info is still
  // available by hovering and actions buttons on the right are unaffected.
  const showBattleSummary = !battlePanelPlaced && !!battleReport;

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const isReady = myPlayer?.ready ?? false;

  return (
    <box
      title={
        inspectionMode === "hovered"
          ? "! INSPECTOR [HOVERED]"
          : inspectionMode === "selected"
          ? "! INSPECTOR [SELECTED]"
          : "! PLAYERS & INSPECTOR"
      }
      titleColor="#00d2ff"
      border
      borderStyle="single"
      borderColor="#00d2ff"
      backgroundColor="#080f1a"
      style={{ width: "100%", height: 3 }}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
    >
      {/* Left Info: Territory/Players summary, or battle summary when no map panel fit */}
      <box flexDirection="row" alignItems="center" gap={0} style={{ width: compactInfoWidth }} flexShrink={1}>
        {showBattleSummary && battleReport ? (
          /* One-line battle summary — replaces territory info when the map panel
             couldn't be placed (compact profile). Height stays at 3 (unchanged). */
          battleReport.conquered ? (
            <text fg={battleReport.attackerColor}>
              ⚔ CONQUERED {fitCompactText(battleReport.targetTerritoryName, compactInfoWidth - 12)}
            </text>
          ) : (
            <text>
              {(() => {
                // Width-aware: truncate territory names to fit the left-info lane.
                // Fixed overhead: "⚔ R{n} " + "▸" + " [" + atkDice + "]v[" + defDice + "] −a/−d"
                const atkDice = battleReport.attackerRolls.length > 0 ? battleReport.attackerRolls.join(" ") : "?";
                const defDice = battleReport.defenderRolls.length > 0 ? battleReport.defenderRolls.join(" ") : "?";
                const lossStr = `−${battleReport.attackerLosses}/−${battleReport.defenderLosses}`;
                const dicePart = `[${atkDice}]v[${defDice}]`;
                // Fixed chars: "⚔ R" + round + " " + "▸" + " " + dicePart + " " + lossStr
                const fixedOverhead = 4 + String(battleReport.engagementRound).length + 1 + dicePart.length + 1 + lossStr.length + 1;
                const namesBudget = Math.max(4, compactInfoWidth - fixedOverhead);
                const half = Math.floor(namesBudget / 2);
                const src = fitCompactText(battleReport.sourceTerritoryName, half);
                const tgtBudget = Math.max(1, namesBudget - src.length);
                const tgt = fitCompactText(battleReport.targetTerritoryName, tgtBudget);
                return (
                  <>
                    <span fg="#ffffff">⚔ R{battleReport.engagementRound} {src}</span>
                    <span fg="#475569">▸</span>
                    <span fg="#ffffff">{tgt} </span>
                    <span fg="#475569">[</span>
                    <span fg={battleReport.attackerColor}>{atkDice}</span>
                    <span fg="#475569">]v[</span>
                    <span fg={battleReport.defenderColor}>{defDice}</span>
                    <span fg="#475569">]</span>
                    <span fg="#94a3b8"> {lossStr}</span>
                  </>
                );
              })()}
            </text>
          )
        ) : inspectionMode !== "none" && displayTid ? (
          <>
            {/* Keep the compact lane to the facts that fit beside its actions. */}
            <text>
              <span fg="#ffffff"><b>[{mapBundle.metadata.displayCodes[displayTid] ?? displayTid}]</b> </span>
              <span fg="#00d2ff"><b>{fitCompactText(territoryName, compactNameLimit)}</b></span>
            </text>

            <text fg="#334155">│</text>

            {/* Owner & Armies */}
            <text>
              <span fg={ownerColor}>● </span>
              <span fg="#e2e8f0"><b>{fitCompactText(ownerName, compactNameLimit)}</b></span>
              <span fg="#94a3b8"> ({armiesCount})</span>
            </text>

            <text fg="#334155">│</text>

            <text fg="#64748b">{fitCompactText(sectorName, pendingConquestMove && isMyTurn ? 7 : 9)} <span fg="#00ff66">+{bonus}</span></text>

            <text fg="#334155">│</text>

            <text fg="#64748b"><span fg="#cbd5e1">{fitCompactText(neighborsStr || "-", pendingConquestMove && isMyTurn ? 5 : 7)}</span></text>
          </>
        ) : (
          /* Players summary — rendered as a SINGLE text/span tree so it
             cannot produce multiple rows and overflow the height:3 container.
             The summary is width-aware: player badges are built into a string
             first and the whole thing is truncated to compactInfoWidth. */
          (() => {
            if (players.length === 0) {
              return (
                <text>
                  <span fg="#00d2ff"><b>! PLAYERS: </b></span>
                  <span fg="#64748b">Waiting for players… Hover or click a territory to inspect</span>
                </text>
              );
            }
            // Build the player tokens as an array of {text, color} pairs so we
            // can truncate before rendering — prevents multi-row overflow.
            type Token = { text: string; fg: string };
            const tokens: Token[] = [{ text: "! PLAYERS: ", fg: "#00d2ff" }];
            for (let idx = 0; idx < players.length; idx++) {
              const p = players[idx]!;
              const isPActive = !isLobby && state?.activePlayerIndex === idx;
              const statusBadge = isLobby
                ? p.ready ? "Ready" : p.connected ? "Conn" : "Off"
                : isPActive ? "Active" : p.isAlive ? "Wait" : "Dead";
              const badgeColor = isLobby
                ? (p.ready ? "#00ff66" : "#00d2ff")
                : isPActive ? "#00ff66" : "#64748b";
              if (idx > 0) tokens.push({ text: " │ ", fg: "#64748b" });
              tokens.push({ text: "● ", fg: p.colorHex });
              const nameText = fitCompactText(p.name, compactNameLimit) + (p.id === myPlayerId ? " (You)" : "");
              tokens.push({ text: nameText, fg: "#e2e8f0" });
              tokens.push({ text: ` [${statusBadge}]`, fg: badgeColor });
            }

            // Compute cumulative lengths to know when to truncate
            let used = 0;
            const visibleTokens: Token[] = [];
            for (const tok of tokens) {
              if (used >= compactInfoWidth) break;
              const remaining = compactInfoWidth - used;
              if (tok.text.length <= remaining) {
                visibleTokens.push(tok);
                used += tok.text.length;
              } else {
                // Truncate this token with "…"
                visibleTokens.push({ text: tok.text.slice(0, remaining - 1) + "…", fg: tok.fg });
                used = compactInfoWidth;
                break;
              }
            }

            return (
              <text>
                {visibleTokens.map((tok, i) => (
                  <span key={i} fg={tok.fg}>{tok.text}</span>
                ))}
              </text>
            );
          })()
        )}
      </box>

      {/* Right Actions: Compact borderless buttons.
           Bordered boxes (border + content + border = 3 rows) cannot fit inside
           a height:3 inspector — their top/bottom borders would collide with the
           inspector's own border rows, producing garbled output.  We use
           background-only styling with bracket labels instead. */}
      <box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
        {isLobby ? (
          <box
            backgroundColor={isReady ? "#064e3b" : "#0c2b3d"}
            paddingLeft={1}
            paddingRight={1}
            onMouseDown={onReady}
          >
            <text fg={isReady ? "#00ff66" : "#00d2ff"}>
              <b>{isReady ? "✔ [ Ready ]" : "[ Ready ]"}</b>
            </text>
          </box>
        ) : (
          <>
            {/* Deployment opens the map-centered amount dialog. */}
            {phase === "deployment" && (
              <box
                  backgroundColor={canDeploy ? "#0c2b3d" : undefined}
                  paddingLeft={1}
                  paddingRight={1}
                  onMouseDown={canDeploy ? onDeploy : undefined}
                >
                  <text fg={canDeploy ? "#00d2ff" : "#64748b"}>
                    <b>[D] ➜ Deploy…</b>
                  </text>
                </box>
            )}

            {/* Attack or mandatory post-conquest troop move */}
            {phase === "attack" && pendingConquestMove && isMyTurn ? (
              <text fg="#a78bfa"><b>MOVE TROOPS…</b> choose the advance on the map</text>
            ) : phase === "attack" && (
              <box
                backgroundColor={canAttack ? "#0c2b3d" : undefined}
                paddingLeft={1}
                paddingRight={1}
                onMouseDown={canAttack ? onAttack : undefined}
              >
                <text fg={canAttack ? "#00ffff" : "#64748b"}>
                  <b>{targetTerritoryId ? `[ ⚔ Attack ${mapBundle.metadata.displayCodes[targetTerritoryId] ?? targetTerritoryId} ]` : "[ ⚔ Attack ]"}</b>
                </text>
              </box>
            )}

            {/* Fortify */}
            {phase === "fortify" && (
              <box
                backgroundColor={canFortify ? "#092e18" : undefined}
                paddingLeft={1}
                paddingRight={1}
                onMouseDown={canFortify ? onFortify : undefined}
              >
                <text fg={canFortify ? "#00ff66" : "#64748b"}>
                  <b>[ 🛡 Fortify… ]</b>
                </text>
              </box>
            )}

            {/* Skip / End Turn */}
            {(phase === "attack" || phase === "fortify") && <box
              backgroundColor={canSkipOrEnd ? "#291c06" : undefined}
              paddingLeft={1}
              paddingRight={1}
              onMouseDown={
                canSkipOrEnd
                  ? phase === "attack"
                    ? onSkipPhase
                    : onEndTurn
                  : undefined
              }
            >
              <text fg={canSkipOrEnd ? "#ffaa00" : "#64748b"}>
                <b>{phase === "attack"
                  ? (pendingPhaseAction === "skip-attack" ? "[ Confirm Skip ]" : "[ » Skip ]")
                  : (pendingPhaseAction === "end-turn" ? "[ Confirm End Turn ]" : "[ » End Turn ]")}</b>
              </text>
            </box>}
          </>
        )}
      </box>
    </box>
  );
}
