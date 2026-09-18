import React from "react";
import type { GameState } from "@conquest/protocol";
import type { LayoutMode } from "@conquest/map-engine";
import { MAP_GRID_IRONREACH } from "@conquest/map-engine";

export interface SidebarProps {
  state: GameState | null;
  myPlayerId: string | null;
  selectedTerritoryId: string | null;
  hoveredTerritoryId?: string | null;
  targetTerritoryId: string | null;
  onDeploy: () => void;
  onAttack: () => void;
  onFortify: () => void;
  onSkipPhase: () => void;
  onEndTurn: () => void;
  onReady?: () => void;
  onSelectTarget?: (territoryId: string) => void;
  roomCode?: string | null;
  connectionStatus?: string;
  layoutMode?: LayoutMode;
}

export function Sidebar({
  state,
  myPlayerId,
  selectedTerritoryId = null,
  hoveredTerritoryId = null,
  targetTerritoryId,
  onDeploy,
  onAttack,
  onFortify,
  onSkipPhase,
  onEndTurn,
  onReady,
  onSelectTarget,
  roomCode,
  connectionStatus,
  layoutMode,
}: SidebarProps) {
  const territories = state?.territories ?? {};
  const activePlayer = state ? state.players[state.activePlayerIndex] : undefined;
  const isMyTurn = Boolean(activePlayer && activePlayer.id === myPlayerId);
  const phase = state?.phase ?? "deployment";
  const pendingReinforcements = state?.pendingReinforcements ?? 0;
  const isLobby = phase === "lobby";

  // Hover populates inspector immediately; if mouse moves away, reverts to selected
  const isHoveredDifferent = Boolean(hoveredTerritoryId && hoveredTerritoryId !== selectedTerritoryId);
  const activeTid = hoveredTerritoryId ?? selectedTerritoryId;
  const inspectionMode: "hovered" | "selected" | "none" =
    isHoveredDifferent
      ? "hovered"
      : selectedTerritoryId
      ? "selected"
      : "none";
  const selectedTerritory = activeTid ? territories[activeTid] : undefined;
  const gridDef = activeTid ? MAP_GRID_IRONREACH.territories.find((t) => t.id === activeTid) : undefined;

  // Territory details
  const territoryName = gridDef?.name ?? selectedTerritory?.name ?? activeTid ?? "";
  const sectorName = gridDef?.regionName ?? "Sector";
  const adjacentStr = gridDef?.neighbors.join(", ") ?? selectedTerritory?.neighbors.join(", ") ?? "-";
  const flavorQuote = gridDef?.flavor ?? "";

  // Owner resolution
  const ownerId = selectedTerritory?.ownerId;
  const owner = ownerId ? state?.players.find((p) => p.id === ownerId) : undefined;
  const ownerName = owner ? owner.name : "Unclaimed";
  const ownerColor = owner?.colorHex ?? "#94a3b8";
  const armiesCount = selectedTerritory?.units ?? 0;

  // Target territory details
  const targetTerritory = targetTerritoryId ? territories[targetTerritoryId] : null;

  // Validation
  const isSelectedOwnedByMe = Boolean(ownerId && ownerId === myPlayerId);
  const isTargetEnemy = Boolean(targetTerritory && targetTerritory.ownerId !== myPlayerId);
  const isTargetFriendly = Boolean(targetTerritory && targetTerritory.ownerId === myPlayerId);

  const canDeploy = isMyTurn && phase === "deployment" && isSelectedOwnedByMe && pendingReinforcements > 0;
  const canAttack = isMyTurn && phase === "attack" && isSelectedOwnedByMe && isTargetEnemy && armiesCount >= 2;
  const canFortify = isMyTurn && phase === "fortify" && isSelectedOwnedByMe && isTargetFriendly && armiesCount >= 2;
  const canSkipOrEnd = isMyTurn && (phase === "attack" || phase === "fortify");

  // Crest icon
  const crestIcon = gridDef?.icon ?? "▲";

  // Ready status in lobby
  const myPlayer = state?.players.find((p) => p.id === myPlayerId);
  const isReady = myPlayer?.ready ?? false;

  const players = state?.players ?? [];

  return (
    <box
      flexDirection="column"
      style={{ width: "100%", height: "100%" }}
      flexGrow={1}
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
            #   Player
          </text>
          <text fg="#64748b">
            {isLobby ? "Status" : "Terrs   Armies  Cards  Turn"}
          </text>
        </box>

        {/* Player Rows */}
        {players.length === 0 ? (
          <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
            <text fg="#64748b">
              <i>Waiting for players...</i>
            </text>
          </box>
        ) : isLobby ? (
          players.map((p, idx) => {
            const statusText = p.ready ? "Ready" : p.connected ? "Connected" : "Offline";
            const statusColor = p.ready ? "#00ff66" : p.connected ? "#00d2ff" : "#64748b";
            return (
              <box key={p.id} flexDirection="row" justifyContent="space-between">
                <text>
                  <span fg="#94a3b8">{idx + 1}   </span>
                  <span fg={p.colorHex}>● </span>
                  <span fg="#e2e8f0">{p.name.padEnd(9, " ")}</span>
                  {p.id === myPlayerId && <span fg="#00ff66"> (You)</span>}
                </text>
                <text fg={statusColor}>
                  <b>{statusText}</b>
                </text>
              </box>
            );
          })
        ) : (
          players.map((p, idx) => {
            const owned = Object.values(territories).filter((t) => t.ownerId === p.id);
            const totalUnits = owned.reduce((sum, t) => sum + t.units, 0);
            const isActive = state?.activePlayerIndex === idx;
            const turnText = isActive ? "Active" : p.isAlive ? "Wait" : "Dead";

            return (
              <box
                key={p.id}
                flexDirection="row"
                justifyContent="space-between"
                backgroundColor={isActive ? "#06381e" : undefined}
                paddingLeft={0}
                paddingRight={0}
              >
                <text fg={isActive ? "#00ff66" : undefined}>
                  <span fg="#94a3b8">{idx + 1}   </span>
                  <span fg={p.colorHex}>● </span>
                  <span fg={isActive ? "#00ff66" : "#e2e8f0"}><b>{p.name.padEnd(9, " ")}</b></span>
                  {p.id === myPlayerId && <span fg="#00ff66"> (You)</span>}
                </text>
                <text fg={isActive ? "#00ff66" : "#e2e8f0"}>
                  <b>
                    {String(owned.length).padStart(4, " ")}    {String(totalUnits).padStart(5, " ")}     0    {turnText.padStart(6, " ")}
                  </b>
                </text>
              </box>
            );
          })
        )}
      </box>

      {/* CARD 2: ! SELECTED TERRITORY or ! HOVERED TERRITORY */}
      <box
        title={
          inspectionMode === "hovered"
            ? "! HOVERED TERRITORY"
            : "! SELECTED TERRITORY"
        }
        titleColor="#00d2ff"
        border
        borderStyle="single"
        borderColor="#00d2ff"
        backgroundColor="#080f1a"
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
        style={{ height: 14 }}
      >
        {!activeTid ? (
          <box
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            flexGrow={1}
          >
            <text fg="#64748b">
              <i>Move over or click a territory to inspect.</i>
            </text>
          </box>
        ) : (
          <>
            {/* Header: Badge [ activeTid ] [STATUS]   territoryName + Crest Box */}
            <box flexDirection="row" justifyContent="space-between" alignItems="flex-start" marginBottom={0}>
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
                {inspectionMode !== "none" && (
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
                )}
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
            <box flexDirection="column" gap={0} marginTop={0}>
              <box flexDirection="row">
                <text fg="#64748b">Owner        </text>
                <text>
                  <span fg={ownerColor}>● </span>
                  <span fg="#e2e8f0"><b>{ownerName}</b></span>
                </text>
              </box>
              <box flexDirection="row">
                <text fg="#64748b">Armies       </text>
                <text fg="#e2e8f0"><b>{armiesCount}</b></text>
              </box>
              <box flexDirection="row">
                <text fg="#64748b">Region       </text>
                <text fg="#e2e8f0"><b>{sectorName}</b></text>
              </box>
              <box flexDirection="row">
                <text fg="#64748b">Bonus        </text>
                <text fg="#00ff66"><b>+{gridDef?.regionBonus ?? 0} armies</b></text>
              </box>
              <box flexDirection="row">
                <text fg="#64748b">Bordering    </text>
                <text fg="#e2e8f0">{adjacentStr}</text>
              </box>
            </box>

            {/* Bordering Realms Chips */}
            <box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
              {(gridDef?.neighbors ?? selectedTerritory?.neighbors ?? []).map((nId) => {
                const isTarget = targetTerritoryId === nId;
                const nDef = MAP_GRID_IRONREACH.territories.find((t) => t.id === nId);
                const nState = territories[nId];
                const nOwner = nState ? state?.players.find((p) => p.id === nState.ownerId) : undefined;
                const nColor = isTarget ? "#00ffff" : nOwner?.colorHex ?? nDef?.regionColor ?? "#94a3b8";

                return (
                  <box
                    key={nId}
                    border
                    borderStyle="single"
                    borderColor={isTarget ? "#00ffff" : "#334155"}
                    backgroundColor={isTarget ? "#0c2b3d" : "#0f172a"}
                    paddingLeft={1}
                    paddingRight={1}
                    onMouseDown={() => onSelectTarget?.(nId)}
                  >
                    <text fg={nColor}>
                      <b>{nId} {nDef?.name ?? ""}</b>
                    </text>
                  </box>
                );
              })}
            </box>

            {/* Flavor quote */}
            {flavorQuote ? (
              <box marginTop={0}>
                <text fg="#64748b">
                  <i>"{flavorQuote}"</i>
                </text>
              </box>
            ) : null}
          </>
        )}
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
        {isLobby ? (
          <box flexDirection="column" gap={1} justifyContent="center" flexGrow={1}>
            <box
              border
              borderStyle="single"
              borderColor={isReady ? "#00ff66" : "#00d2ff"}
              backgroundColor={isReady ? "#064e3b" : "#0c2b3d"}
              flexDirection="row"
              justifyContent="center"
              alignItems="center"
              paddingLeft={1}
              paddingRight={1}
              onMouseDown={onReady}
            >
              <text fg={isReady ? "#00ff66" : "#00d2ff"}>
                <b>{isReady ? "✔ [ Ready ]" : "[ Ready ]"}</b>
              </text>
            </box>
            <text fg="#64748b">
              Press <span fg="#00d2ff"><b>R</b></span> or click to toggle ready.
            </text>
          </box>
        ) : (
          <>
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
              <text fg={canAttack ? "#00ffff" : "#e2e8f0"}>
                <b>[ ⚔ Attack ]</b>
              </text>
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
              <text fg={canFortify ? "#00ff66" : "#e2e8f0"}>
                <b>[ 🛡 Fortify ]</b>
              </text>
            </box>

            {/* Action 3: Move / Deploy */}
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
              <text fg={canDeploy ? "#00d2ff" : "#e2e8f0"}>
                <b>[ ➜ Move ]</b>
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
              <text fg={canSkipOrEnd ? "#ffaa00" : "#e2e8f0"}>
                <b>{phase === "attack" ? "[ » Skip Attack ]" : "[ » End Turn ]"}</b>
              </text>
            </box>
          </>
        )}
      </box>

      {/* CARD 4: ! REALM & SESSION INTEL */}
      {layoutMode !== "standard" && (
        <box
          title="! REALM & SESSION INTEL"
          titleColor="#00d2ff"
          border
          borderStyle="single"
          borderColor="#00d2ff"
          backgroundColor="#080f1a"
          flexDirection="column"
          paddingLeft={1}
          paddingRight={1}
          flexGrow={1}
        >
          <box flexDirection="column" gap={0} marginTop={0}>
            <box flexDirection="row" justifyContent="space-between">
              <text fg="#64748b">Room</text>
              <text fg="#00d2ff">
                <b>[ {roomCode ?? "Public"} ]</b>
              </text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg="#64748b">Map</text>
              <text fg="#e2e8f0">
                <b>The Ironreach</b>
              </text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg="#64748b">Territories</text>
              <text fg="#e2e8f0">
                <b>20 Contested</b>
              </text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg="#64748b">Phase</text>
              <text fg="#00ff66">
                <b>{phase.charAt(0).toUpperCase() + phase.slice(1)}</b>
              </text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg="#64748b">Turn</text>
              <text fg="#e2e8f0">
                <b>Turn {state?.turnNumber ?? 0}/∞</b>
              </text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg="#64748b">Connection</text>
              <text>
                <span fg={connectionStatus === "connected" || !connectionStatus ? "#00ff66" : "#ff4444"}>● </span>
                <span fg="#e2e8f0"><b>{connectionStatus === "connected" || !connectionStatus ? "Connected" : "Disconnected"}</b></span>
              </text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg="#64748b">Total Armies</text>
              <text fg="#ffaa00">
                <b>{Object.values(territories).reduce((sum, t) => sum + (t.units ?? 0), 0)}</b>
              </text>
            </box>
          </box>
        </box>
      )}
    </box>
  );
}
