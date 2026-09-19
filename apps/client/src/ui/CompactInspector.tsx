import React from "react";
import type { GamePhase, GameState } from "@conquest/protocol";
import { MAP_GRID_IRONREACH } from "@conquest/map-engine";

export interface CompactInspectorProps {
  state: GameState | null;
  myPlayerId: string | null;
  selectedTerritoryId: string | null;
  hoveredTerritoryId?: string | null;
  targetTerritoryId: string | null;
  roomCode?: string | null;
  phase: GamePhase;
  onDeploy: () => void;
  onAttack: () => void;
  onFortify: () => void;
  onSkipPhase: () => void;
  onEndTurn: () => void;
  onReady?: () => void;
  onSelectTarget?: (territoryId: string) => void;
  onSelectTerritory?: (territoryId: string) => void;
}

export function CompactInspector({
  state,
  myPlayerId,
  selectedTerritoryId,
  hoveredTerritoryId,
  targetTerritoryId,
  phase,
  onDeploy,
  onAttack,
  onFortify,
  onSkipPhase,
  onEndTurn,
  onReady,
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
  const gridDef = displayTid ? MAP_GRID_IRONREACH.territories.find((t) => t.id === displayTid) : undefined;

  const territoryName = gridDef?.name ?? territoryState?.name ?? displayTid ?? "";
  const sectorName = gridDef?.regionName ?? "Sector";
  const bonus = gridDef?.regionBonus ?? 2;
  const neighbors = gridDef?.neighbors ?? territoryState?.neighbors ?? [];
  const neighborsStr = neighbors.join(", ");

  const ownerId = territoryState?.ownerId;
  const owner = ownerId ? players.find((p) => p.id === ownerId) : undefined;
  const ownerName = isLobby ? "Unclaimed" : owner ? owner.name : "Unclaimed";
  const ownerColor = isLobby ? "#94a3b8" : owner?.colorHex ?? "#94a3b8";
  const armiesCount = territoryState?.units ?? 0;

  // Target territory details
  const targetTerritory = targetTerritoryId ? territories[targetTerritoryId] : null;
  const isSelectedOwnedByMe = Boolean(ownerId && ownerId === myPlayerId);
  const isTargetEnemy = Boolean(targetTerritory && targetTerritory.ownerId !== myPlayerId);
  const isTargetFriendly = Boolean(targetTerritory && targetTerritory.ownerId === myPlayerId);

  const canDeploy = isMyTurn && phase === "deployment" && isSelectedOwnedByMe && pendingReinforcements > 0;
  const canAttack = isMyTurn && phase === "attack" && isSelectedOwnedByMe && isTargetEnemy && armiesCount >= 2;
  const canFortify = isMyTurn && phase === "fortify" && isSelectedOwnedByMe && isTargetFriendly && armiesCount >= 2;
  const canSkipOrEnd = isMyTurn && (phase === "attack" || phase === "fortify");

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
      {/* Left Info: Territory or Players summary */}
      <box flexDirection="row" alignItems="center" gap={1} flexGrow={1}>
        {inspectionMode !== "none" && displayTid ? (
          <>
            {/* Status Badge */}
            <box
              border
              borderStyle="single"
              borderColor={inspectionMode === "selected" ? "#00ffff" : "#ffaa00"}
              backgroundColor={inspectionMode === "selected" ? "#0c2b3d" : "#291c06"}
              paddingLeft={1}
              paddingRight={1}
            >
              <text fg={inspectionMode === "selected" ? "#00ffff" : "#ffaa00"}>
                <b>{inspectionMode.toUpperCase()}</b>
              </text>
            </box>

            {/* Territory ID & Name */}
            <text>
              <span fg="#ffffff"><b>[{displayTid}]</b> </span>
              <span fg="#00d2ff"><b>{territoryName}</b></span>
            </text>

            <text fg="#334155">│</text>

            {/* Sector & Bonus */}
            <text fg="#64748b">
              {sectorName} <span fg="#00ff66">(+{bonus})</span>
            </text>

            <text fg="#334155">│</text>

            {/* Owner & Armies */}
            <text>
              <span fg={ownerColor}>● </span>
              <span fg="#e2e8f0"><b>{ownerName}</b></span>
              <span fg="#94a3b8"> ({armiesCount} armies)</span>
            </text>

            <text fg="#334155">│</text>

            {/* Neighbors */}
            <text fg="#64748b">
              Borders: <span fg="#cbd5e1">{neighborsStr || "-"}</span>
            </text>
          </>
        ) : (
          /* Honest Players Summary when no territory is hovered or selected */
          <box flexDirection="row" alignItems="center" gap={1}>
            <text fg="#00d2ff">
              <b>! PLAYERS:</b>
            </text>
            {players.length === 0 ? (
              <text fg="#64748b"><i>Waiting for players...</i></text>
            ) : (
              players.map((p, idx) => {
                const isPActive = !isLobby && state?.activePlayerIndex === idx;
                const statusBadge = isLobby
                  ? p.ready
                    ? "Ready"
                    : p.connected
                    ? "Connected"
                    : "Offline"
                  : isPActive
                  ? "Active"
                  : p.isAlive
                  ? "Wait"
                  : "Dead";
                const badgeColor = isLobby
                  ? p.ready
                    ? "#00ff66"
                    : "#00d2ff"
                  : isPActive
                  ? "#00ff66"
                  : "#64748b";

                return (
                  <text key={p.id}>
                    <span fg="#64748b">{idx > 0 ? " │ " : ""}</span>
                    <span fg={p.colorHex}>● </span>
                    <span fg="#e2e8f0"><b>{p.name}</b></span>
                    {p.id === myPlayerId && <span fg="#00ff66"> (You)</span>}
                    <span fg={badgeColor}> [{statusBadge}]</span>
                  </text>
                );
              })
            )}
            <text fg="#475569"> │ Hover or click territory to inspect</text>
          </box>
        )}
      </box>

      {/* Right Actions: Contextual Buttons */}
      <box flexDirection="row" alignItems="center" gap={1}>
        {isLobby ? (
          <box
            border
            borderStyle="single"
            borderColor={isReady ? "#00ff66" : "#00d2ff"}
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
            {/* Deploy */}
            {phase === "deployment" && (
              <box
                border
                borderStyle="single"
                borderColor={canDeploy ? "#00d2ff" : "#334155"}
                backgroundColor={canDeploy ? "#0c2b3d" : undefined}
                paddingLeft={1}
                paddingRight={1}
                onMouseDown={canDeploy ? onDeploy : undefined}
              >
                <text fg={canDeploy ? "#00d2ff" : "#64748b"}>
                  <b>[ ➜ Deploy ]</b>
                </text>
              </box>
            )}

            {/* Attack */}
            {phase === "attack" && (
              <box
                border
                borderStyle="single"
                borderColor={canAttack ? "#00ffff" : "#334155"}
                backgroundColor={canAttack ? "#0c2b3d" : undefined}
                paddingLeft={1}
                paddingRight={1}
                onMouseDown={canAttack ? onAttack : undefined}
              >
                <text fg={canAttack ? "#00ffff" : "#64748b"}>
                  <b>{targetTerritoryId ? `[ ⚔ Attack ${targetTerritoryId} ]` : "[ ⚔ Attack ]"}</b>
                </text>
              </box>
            )}

            {/* Fortify */}
            {phase === "fortify" && (
              <box
                border
                borderStyle="single"
                borderColor={canFortify ? "#00ff66" : "#334155"}
                backgroundColor={canFortify ? "#092e18" : undefined}
                paddingLeft={1}
                paddingRight={1}
                onMouseDown={canFortify ? onFortify : undefined}
              >
                <text fg={canFortify ? "#00ff66" : "#64748b"}>
                  <b>[ 🛡 Fortify ]</b>
                </text>
              </box>
            )}

            {/* Skip / End Turn */}
            <box
              border
              borderStyle="single"
              borderColor={canSkipOrEnd ? "#ffaa00" : "#334155"}
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
                <b>{phase === "attack" ? "[ » Skip ]" : "[ » End Turn ]"}</b>
              </text>
            </box>
          </>
        )}
      </box>
    </box>
  );
}
