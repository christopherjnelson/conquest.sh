import React from "react";
import type { GameState } from "@conquest/protocol";
import { MAP_SECTOR_07 } from "@conquest/map-engine";

export interface SidebarProps {
  state: GameState | null;
  myPlayerId: string | null;
  selectedTerritoryId: string | null;
  targetTerritoryId: string | null;
  onDeploy: () => void;
  onAttack: () => void;
  onFortify: () => void;
  onSkipPhase: () => void;
  onEndTurn: () => void;
  onReady?: () => void;
}

export function Sidebar({
  state,
  myPlayerId,
  selectedTerritoryId,
  targetTerritoryId,
  onDeploy,
  onAttack,
  onFortify,
  onSkipPhase,
  onEndTurn,
  onReady,
}: SidebarProps) {
  const territories = state?.territories ?? {};
  const players = state?.players ?? [];
  const activePlayer = state ? state.players[state.activePlayerIndex] : undefined;
  const isMyTurn = Boolean(activePlayer && activePlayer.id === myPlayerId);
  const phase = state?.phase ?? "lobby";
  const pendingReinforcements = state?.pendingReinforcements ?? 0;

  const selectedTerritory = selectedTerritoryId ? territories[selectedTerritoryId] : null;
  const selectedOwner = selectedTerritory ? players.find((p) => p.id === selectedTerritory.ownerId) : null;

  const targetTerritory = targetTerritoryId ? territories[targetTerritoryId] : null;
  const targetOwner = targetTerritory ? players.find((p) => p.id === targetTerritory.ownerId) : null;

  // Validation for actions
  const isSelectedOwnedByMe = Boolean(selectedTerritory && selectedTerritory.ownerId === myPlayerId);
  const isTargetEnemy = Boolean(targetTerritory && targetTerritory.ownerId !== myPlayerId);
  const isTargetFriendly = Boolean(targetTerritory && targetTerritory.ownerId === myPlayerId);

  const canDeploy = isMyTurn && phase === "deployment" && isSelectedOwnedByMe && pendingReinforcements > 0;
  const canAttack =
    isMyTurn &&
    phase === "attack" &&
    isSelectedOwnedByMe &&
    isTargetEnemy &&
    Boolean(selectedTerritory && selectedTerritory.units >= 2);
  const canFortify =
    isMyTurn &&
    phase === "fortify" &&
    isSelectedOwnedByMe &&
    isTargetFriendly &&
    Boolean(selectedTerritory && selectedTerritory.units >= 2);
  const canSkipOrEnd = isMyTurn && (phase === "attack" || phase === "fortify");

  const myPlayer = players.find((p) => p.id === myPlayerId);

  return (
    <box
      flexDirection="column"
      border
      borderStyle="single"
      borderColor="#334155"
      style={{ width: 38, paddingLeft: 1, paddingRight: 1, paddingTop: 0, paddingBottom: 0 }}
      gap={1}
    >
      {/* PLAYERS SCOREBOARD */}
      <box flexDirection="column">
        <text fg="#00d2ff">
          <b>── PLAYERS SCOREBOARD ──</b>
        </text>
        {players.map((p) => {
          const owned = Object.values(territories).filter((t) => t.ownerId === p.id);
          const totalUnits = owned.reduce((sum, t) => sum + t.units, 0);
          const isActive = activePlayer?.id === p.id;
          const isMe = p.id === myPlayerId;

          return (
            <box key={p.id} flexDirection="column">
              <box flexDirection="row" justifyContent="space-between">
                <text>
                  <span fg="#ffaa00">{isActive ? "▶ " : "  "}</span>
                  <span fg={p.colorHex}>● </span>
                  <span fg={isMe ? "#00ff66" : "#ffffff"}>
                    <b>{p.name}</b>
                    {isMe ? " (You)" : ""}
                  </span>
                </text>
                <text fg={!p.isAlive ? "#ff4444" : !p.connected ? "#64748b" : "#00ff66"}>
                  {!p.isAlive ? "[ELIMINATED]" : !p.connected ? "[OFFLINE]" : "[ALIVE]"}
                </text>
              </box>
              <text fg="#94a3b8">
                {"   "}Territories: <b>{owned.length}</b> │ Units: <b>{totalUnits}</b>
              </text>
            </box>
          );
        })}
        {players.length === 0 && (
          <text fg="#64748b">
            <i>No players connected</i>
          </text>
        )}
      </box>

      {/* SECTOR BONUSES */}
      <box flexDirection="column">
        <text fg="#64748b">
          <b>── SECTORS ──</b>
        </text>
        {MAP_SECTOR_07.sectors.map((s) => {
          const ownerOfFirst = territories[s.territoryIds[0]]?.ownerId;
          const ownsAll =
            ownerOfFirst &&
            s.territoryIds.every((tid) => territories[tid]?.ownerId === ownerOfFirst);
          const controller = ownsAll ? players.find((p) => p.id === ownerOfFirst) : null;

          return (
            <text key={s.id} fg="#94a3b8">
              <span fg={s.colorHex}>■ {s.name} (+{s.bonusReinforcements}): </span>
              {controller ? (
                <span fg={controller.colorHex}><b>{controller.name}</b></span>
              ) : (
                <span fg="#64748b">Contested</span>
              )}
            </text>
          );
        })}
      </box>

      {/* SELECTED TERRITORY INTEL */}
      <box flexDirection="column">
        <text fg="#ffaa00">
          <b>── TERRITORY INTEL ──</b>
        </text>
        {selectedTerritory ? (
          <box flexDirection="column">
            <text fg="#ffffff">
              <b>{selectedTerritory.id}: {selectedTerritory.name}</b>
            </text>
            <text fg="#94a3b8">
              Sector:{" "}
              <span fg="#00d2ff">{selectedTerritory.sectorId.toUpperCase()}</span>
              {" │ "}Units: <span fg="#00ff66"><b>{selectedTerritory.units}</b></span>
            </text>
            <text fg="#94a3b8">
              Owner:{" "}
              <span fg={selectedOwner?.colorHex ?? "#ffffff"}>
                <b>{selectedOwner?.name ?? "Neutral"}</b>
              </span>
            </text>

            <text fg="#64748b">Adjacent targets:</text>
            {selectedTerritory.neighbors.map((nId) => {
              const neighbor = territories[nId];
              if (!neighbor) return null;
              const nOwner = players.find((p) => p.id === neighbor.ownerId);
              const isEnemy = neighbor.ownerId !== myPlayerId;
              return (
                <text key={nId} fg={isEnemy ? "#ff6666" : "#66ff66"}>
                  {" "}{isEnemy ? "⚔" : "🛡"} {nId} ({neighbor.name}): {neighbor.units}u [
                  {nOwner?.name ?? "Neutral"}]
                </text>
              );
            })}

            {targetTerritory && (
              <box
                border
                borderStyle="rounded"
                borderColor={isTargetEnemy ? "#ff4444" : "#00ff66"}
                paddingLeft={1}
                marginTop={1}
                flexDirection="column"
              >
                <text fg={isTargetEnemy ? "#ff4444" : "#00ff66"}>
                  <b>TARGET: {targetTerritory.id}: {targetTerritory.name}</b>
                </text>
                <text fg="#94a3b8">
                  Owner: {targetOwner?.name} │ Units: {targetTerritory.units}
                </text>
              </box>
            )}
          </box>
        ) : (
          <text fg="#64748b">
            <i>No territory selected. Use [Tab] or click.</i>
          </text>
        )}
      </box>

      {/* COMMAND ACTIONS */}
      <box flexDirection="column" gap={0}>
        <text fg="#00d2ff">
          <b>── COMMAND ACTIONS ──</b>
        </text>

        {phase === "lobby" && onReady && (
          <box
            border
            borderStyle="single"
            borderColor={myPlayer?.ready ? "#64748b" : "#00ff66"}
            onMouseDown={onReady}
            paddingLeft={1}
          >
            <text fg={myPlayer?.ready ? "#64748b" : "#00ff66"}>
              <b>[R] {myPlayer?.ready ? "WAITING FOR PLAYERS" : "READY / START GAME"}</b>
            </text>
          </box>
        )}

        <box
          border
          borderStyle="single"
          borderColor={canDeploy ? "#00ff66" : "#334155"}
          onMouseDown={canDeploy ? onDeploy : undefined}
          paddingLeft={1}
        >
          <text fg={canDeploy ? "#00ff66" : "#475569"}>
            <b>[D] Deploy {canDeploy ? `(+${pendingReinforcements})` : ""}</b>
          </text>
        </box>

        <box
          border
          borderStyle="single"
          borderColor={canAttack ? "#ff4444" : "#334155"}
          onMouseDown={canAttack ? onAttack : undefined}
          paddingLeft={1}
        >
          <text fg={canAttack ? "#ff4444" : "#475569"}>
            <b>[A] Attack Target</b>
          </text>
        </box>

        <box
          border
          borderStyle="single"
          borderColor={canFortify ? "#9966ff" : "#334155"}
          onMouseDown={canFortify ? onFortify : undefined}
          paddingLeft={1}
        >
          <text fg={canFortify ? "#9966ff" : "#475569"}>
            <b>[F] Fortify Target</b>
          </text>
        </box>

        <box
          border
          borderStyle="single"
          borderColor={canSkipOrEnd ? "#ffaa00" : "#334155"}
          onMouseDown={
            canSkipOrEnd
              ? phase === "attack"
                ? onSkipPhase
                : onEndTurn
              : undefined
          }
          paddingLeft={1}
        >
          <text fg={canSkipOrEnd ? "#ffaa00" : "#475569"}>
            <b>[E] {phase === "attack" ? "Skip to Fortify" : "End Turn"}</b>
          </text>
        </box>
      </box>
    </box>
  );
}
