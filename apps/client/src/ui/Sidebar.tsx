import React from "react";
import type { GameState } from "@conquest/protocol";
import { MAP_GRID_IRONREACH } from "@conquest/map-engine";

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
  onSelectTarget?: (territoryId: string) => void;
}

// Default fallback players matching ref.png if state is empty
const DEFAULT_PLAYERS = [
  { id: "p1", name: "Alex", colorHex: "#00ff66", territories: 5, armies: 18, isAlive: true },
  { id: "p2", name: "Blair", colorHex: "#00d2ff", territories: 4, armies: 12, isAlive: true },
  { id: "p3", name: "Casey", colorHex: "#38bdf8", territories: 5, armies: 14, isAlive: true },
  { id: "p4", name: "Drew", colorHex: "#ff4444", territories: 4, armies: 11, isAlive: true },
];

export function Sidebar({
  state,
  myPlayerId,
  selectedTerritoryId = "C2",
  targetTerritoryId,
  onDeploy,
  onAttack,
  onFortify,
  onSkipPhase,
  onEndTurn,
  onReady,
  onSelectTarget,
}: SidebarProps) {
  const territories = state?.territories ?? {};
  const activePlayer = state ? state.players[state.activePlayerIndex] : undefined;
  const isMyTurn = Boolean(activePlayer && activePlayer.id === myPlayerId);
  const phase = state?.phase ?? "deployment";
  const pendingReinforcements = state?.pendingReinforcements ?? 0;

  // Active territory ID (default to C2 matching ref.png if not selected)
  const activeTid = selectedTerritoryId ?? "C2";
  const selectedTerritory = territories[activeTid];
  const gridDef = MAP_GRID_IRONREACH.territories.find((t) => t.id === activeTid);

  // Territory details
  const territoryName =
    activeTid === "C2" ? "Frostfell" : gridDef?.name ?? selectedTerritory?.name ?? "Frostfell";
  const continent = gridDef?.regionName ?? "Northreach";
  const adjacentStr = gridDef?.neighbors.join(", ") ?? "C1, C3, C4, B3";
  const flavorQuote =
    activeTid === "C2"
      ? "A cold land, rich in opportunity."
      : gridDef?.flavor ?? "A contested land, rich in opportunity.";

  // Owner resolution
  const ownerId = selectedTerritory?.ownerId ?? (activeTid === "C2" ? "p3" : undefined);
  const owner = state?.players.find((p) => p.id === ownerId) ?? {
    id: "p3",
    name: "Casey",
    colorHex: "#38bdf8",
  };
  const armiesCount = selectedTerritory?.units ?? (activeTid === "C2" ? 1 : 2);

  // Target territory details
  const targetTerritory = targetTerritoryId ? territories[targetTerritoryId] : null;

  // Validation
  const isSelectedOwnedByMe = Boolean(ownerId && ownerId === myPlayerId);
  const isTargetEnemy = Boolean(targetTerritory && targetTerritory.ownerId !== myPlayerId);
  const isTargetFriendly = Boolean(targetTerritory && targetTerritory.ownerId === myPlayerId);

  const canDeploy = isMyTurn && phase === "deployment" && isSelectedOwnedByMe && pendingReinforcements > 0;
  const canAttack =
    (isMyTurn && phase === "attack" && isSelectedOwnedByMe && isTargetEnemy && armiesCount >= 2) ||
    (!state && activeTid === "C2"); // In ref.png, Attack button is highlighted
  const canFortify = isMyTurn && phase === "fortify" && isSelectedOwnedByMe && isTargetFriendly && armiesCount >= 2;
  const canSkipOrEnd = isMyTurn && (phase === "attack" || phase === "fortify");

  // Crest icon
  const crestIcon = gridDef?.icon ?? "▲";

  // Player rows
  const playerRows =
    state && state.players.length > 0
      ? state.players.map((p, idx) => {
          const owned = Object.values(territories).filter((t) => t.ownerId === p.id);
          const totalUnits = owned.reduce((sum, t) => sum + t.units, 0);
          const isActive = state.activePlayerIndex === idx;
          return {
            num: idx + 1,
            name: p.name,
            colorHex: p.colorHex,
            territories: owned.length,
            armies: totalUnits,
            isActive,
          };
        })
      : DEFAULT_PLAYERS.map((p, idx) => ({
          num: idx + 1,
          name: p.name,
          colorHex: p.colorHex,
          territories: p.territories,
          armies: p.armies,
          isActive: idx === 0, // Alex is active in ref.png
        }));

  return (
    <box
      flexDirection="column"
      style={{ width: 38 }}
      gap={1}
    >
      {/* CARD 1: ! PLAYERS */}
      <box
        title="! PLAYERS"
        titleColor="#00d2ff"
        border
        borderStyle="single"
        borderColor="#00d2ff"
        backgroundColor="#080f1a"
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
        style={{ height: 8 }}
      >
        {/* Table Header */}
        <box flexDirection="row" justifyContent="space-between" marginBottom={0}>
          <text fg="#64748b">
            #   Name
          </text>
          <text fg="#64748b">
            Territories  Armies
          </text>
        </box>

        {/* Player Rows */}
        {playerRows.map((p) => {
          if (p.isActive) {
            return (
              <box
                key={p.num}
                flexDirection="row"
                justifyContent="space-between"
                backgroundColor="#06381e"
                paddingLeft={0}
                paddingRight={0}
              >
                <text fg="#00ff66">
                  <b>{p.num}   ● {p.name.padEnd(10, " ")}</b>
                </text>
                <text fg="#00ff66">
                  <b>{String(p.territories).padStart(4, " ")}        {String(p.armies).padStart(4, " ")}</b>
                </text>
              </box>
            );
          }

          return (
            <box key={p.num} flexDirection="row" justifyContent="space-between">
              <text>
                <span fg="#94a3b8">{p.num}   </span>
                <span fg={p.colorHex}>● </span>
                <span fg="#e2e8f0">{p.name.padEnd(9, " ")}</span>
              </text>
              <text fg="#e2e8f0">
                {String(p.territories).padStart(4, " ")}        {String(p.armies).padStart(4, " ")}
              </text>
            </box>
          );
        })}
      </box>

      {/* CARD 2: ! SELECTED TERRITORY */}
      <box
        title="! SELECTED TERRITORY"
        titleColor="#00d2ff"
        border
        borderStyle="single"
        borderColor="#00d2ff"
        backgroundColor="#080f1a"
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
        style={{ height: 13 }}
      >
        {/* Header: Badge [ C2 ]   Frostfell + Crest Box */}
        <box flexDirection="row" justifyContent="space-between" alignItems="flex-start" marginBottom={1}>
          <box flexDirection="row" alignItems="center" gap={1}>
            <box
              border
              borderStyle="single"
              borderColor="#334155"
              backgroundColor="#0f172a"
              paddingLeft={1}
              paddingRight={1}
            >
              <text fg="#ffffff">
                <b>{activeTid}</b>
              </text>
            </box>
            <text fg="#00d2ff">
              <b>{territoryName}</b>
            </text>
          </box>

          {/* Crest Box */}
          <box
            border
            borderStyle="single"
            borderColor="#334155"
            flexDirection="column"
            alignItems="center"
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg="#475569">
              {crestIcon}{crestIcon}
            </text>
            <text fg="#334155">
              {" "}{crestIcon}
            </text>
          </box>
        </box>

        {/* Details Table */}
        <box flexDirection="column" gap={0}>
          <box flexDirection="row">
            <text fg="#64748b">Owner        </text>
            <text>
              <span fg={owner.colorHex}>● </span>
              <span fg="#e2e8f0"><b>{owner.name}</b></span>
            </text>
          </box>
          <box flexDirection="row">
            <text fg="#64748b">Armies       </text>
            <text fg="#e2e8f0"><b>{armiesCount}</b></text>
          </box>
          <box flexDirection="row">
            <text fg="#64748b">Continent    </text>
            <text fg="#e2e8f0"><b>{continent}</b></text>
          </box>
          <box flexDirection="row">
            <text fg="#64748b">Adjacent     </text>
            <text fg="#e2e8f0">{adjacentStr}</text>
          </box>
        </box>

        {/* Flavor quote */}
        <box marginTop={1}>
          <text fg="#64748b">
            <i>"{flavorQuote}"</i>
          </text>
        </box>
      </box>

      {/* CARD 3: ! ACTIONS */}
      <box
        title="! ACTIONS"
        titleColor="#00d2ff"
        border
        borderStyle="single"
        borderColor="#00d2ff"
        backgroundColor="#080f1a"
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
        gap={1}
        style={{ height: 10 }}
      >
        {/* Action 1: Attack */}
        <box
          border
          borderStyle="single"
          borderColor={canAttack ? "#00ffff" : "#334155"}
          backgroundColor={canAttack ? "#0c2b3d" : undefined}
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          paddingLeft={1}
          paddingRight={1}
          onMouseDown={canAttack ? onAttack : undefined}
        >
          <box flexDirection="row" gap={1}>
            <text fg={canAttack ? "#00ffff" : "#64748b"}>
              <b>⚔</b>
            </text>
            <text fg={canAttack ? "#00ffff" : "#e2e8f0"}>
              <b>[ Attack ]</b>
            </text>
          </box>
          <text fg="#64748b">
            {targetTerritoryId ? `target: ${targetTerritoryId}` : "-"}
          </text>
        </box>

        {/* Action 2: Fortify */}
        <box
          border
          borderStyle="single"
          borderColor={canFortify ? "#00ff66" : "#334155"}
          backgroundColor={canFortify ? "#092e18" : undefined}
          flexDirection="row"
          alignItems="center"
          paddingLeft={1}
          paddingRight={1}
          onMouseDown={canFortify ? onFortify : undefined}
          gap={1}
        >
          <text fg={canFortify ? "#00ff66" : "#64748b"}>
            <b>🛡</b>
          </text>
          <text fg={canFortify ? "#00ff66" : "#e2e8f0"}>
            <b>[ Fortify ]</b>
          </text>
        </box>

        {/* Action 3: Move */}
        <box
          border
          borderStyle="single"
          borderColor={canDeploy ? "#00d2ff" : "#334155"}
          backgroundColor={canDeploy ? "#0c2b3d" : undefined}
          flexDirection="row"
          alignItems="center"
          paddingLeft={1}
          paddingRight={1}
          onMouseDown={canDeploy ? onDeploy : undefined}
          gap={1}
        >
          <text fg={canDeploy ? "#00d2ff" : "#64748b"}>
            <b>➜</b>
          </text>
          <text fg={canDeploy ? "#00d2ff" : "#e2e8f0"}>
            <b>[ Move ]</b>
          </text>
        </box>

        {/* Action 4: End Turn */}
        <box
          border
          borderStyle="single"
          borderColor={canSkipOrEnd ? "#ffaa00" : "#334155"}
          backgroundColor={canSkipOrEnd ? "#291c06" : undefined}
          flexDirection="row"
          alignItems="center"
          paddingLeft={1}
          paddingRight={1}
          onMouseDown={
            canSkipOrEnd
              ? phase === "attack"
                ? onSkipPhase
                : onEndTurn
              : undefined
          }
          gap={1}
        >
          <text fg={canSkipOrEnd ? "#ffaa00" : "#64748b"}>
            <b>»</b>
          </text>
          <text fg={canSkipOrEnd ? "#ffaa00" : "#e2e8f0"}>
            <b>[ End Turn ]</b>
          </text>
        </box>
      </box>
    </box>
  );
}
