import React from "react";
import type { GameState } from "@conquest/protocol";
import type { LayoutMode, MapBundle } from "@conquest/map-engine";
import { getDefaultMap } from "@conquest/map-engine";

export interface SidebarProps {
  mapBundle?: MapBundle;
  state: GameState | null;
  myPlayerId: string | null;
  selectedTerritoryId: string | null;
  hoveredTerritoryId?: string | null;
  targetTerritoryId: string | null;
  onDeploy: () => void;
  deploymentCount?: number;
  onDecreaseDeployment?: () => void;
  onIncreaseDeployment?: () => void;
  onSelectAllDeployments?: () => void;
  onSelectMinimumDeployment?: () => void;
  pendingConquestMove?: GameState["pendingConquestMove"];
  conquestMoveUnits?: number;
  onDecreaseConquestMove?: () => void;
  onIncreaseConquestMove?: () => void;
  onConfirmConquestMove?: () => void;
  onAttack: () => void;
  onFortify: () => void;
  onSkipPhase: () => void;
  onEndTurn: () => void;
  pendingPhaseAction?: "skip-attack" | "end-turn" | null;
  onReady?: () => void;
  onSelectTarget?: (territoryId: string) => void;
  roomCode?: string | null;
  connectionStatus?: string;
  layoutMode?: LayoutMode;
}

function fitSidebarText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 1))}…` : value;
}

export function Sidebar({
  mapBundle = getDefaultMap(),
  state,
  myPlayerId,
  selectedTerritoryId = null,
  hoveredTerritoryId = null,
  targetTerritoryId,
  onDeploy,
  deploymentCount,
  onDecreaseDeployment,
  onIncreaseDeployment,
  onSelectAllDeployments,
  onSelectMinimumDeployment,
  pendingConquestMove,
  conquestMoveUnits,
  onDecreaseConquestMove,
  onIncreaseConquestMove,
  onConfirmConquestMove,
  onAttack,
  onFortify,
  onSkipPhase,
  onEndTurn,
  pendingPhaseAction,
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
  // The inspector can preview a hovered territory, but actions always apply
  // to the persistent map selection.
  const selectedTerritoryState = selectedTerritoryId ? territories[selectedTerritoryId] : undefined;
  const gridDef = activeTid ? mapBundle.definition.territories.find((t) => t.id === activeTid) : undefined;
  const region = mapBundle.definition.sectors.find(s => s.id === gridDef?.sectorId);

  // Territory details
  const territoryName = gridDef?.name ?? selectedTerritory?.name ?? activeTid ?? "";
  const sectorName = region?.name ?? mapBundle.metadata.regionSingular;
  const flavorQuote = gridDef?.description ?? "";

  // Owner resolution
  const ownerId = selectedTerritory?.ownerId;
  const owner = ownerId ? state?.players.find((p) => p.id === ownerId) : undefined;
  const ownerName = owner ? owner.name : "Unclaimed";
  const ownerColor = owner?.colorHex ?? "#94a3b8";
  const armiesCount = selectedTerritory?.units ?? 0;

  // Target territory details
  const targetTerritory = targetTerritoryId ? territories[targetTerritoryId] : null;

  // Validation
  const isActionSourceOwnedByMe = Boolean(
    selectedTerritoryState?.ownerId && selectedTerritoryState.ownerId === myPlayerId
  );
  const isTargetEnemy = Boolean(targetTerritory && targetTerritory.ownerId !== myPlayerId);
  const isTargetFriendly = Boolean(targetTerritory && targetTerritory.ownerId === myPlayerId);

  const canDeploy = isMyTurn && phase === "deployment" && isActionSourceOwnedByMe && pendingReinforcements > 0;
  const selectedDeploymentCount = Math.min(Math.max(1, deploymentCount ?? pendingReinforcements), pendingReinforcements);
  const canAttack = isMyTurn && !pendingConquestMove && phase === "attack" && isActionSourceOwnedByMe && isTargetEnemy && (selectedTerritoryState?.units ?? 0) >= 2;
  const canFortify = isMyTurn && phase === "fortify" && isActionSourceOwnedByMe && isTargetFriendly && (selectedTerritoryState?.units ?? 0) >= 2;
  const canSkipOrEnd = isMyTurn && !pendingConquestMove && (phase === "attack" || phase === "fortify");

  // Ready status in lobby
  const myPlayer = state?.players.find((p) => p.id === myPlayerId);
  const isReady = myPlayer?.ready ?? false;

  const players = state?.players ?? [];
  const neighborIds = gridDef?.neighbors ?? selectedTerritory?.neighbors ?? [];
  // The inspector is intentionally terse. At the supported 110-column width its
  // panel has only about 30 inner cells, so values must never push into labels.
  const valueLimit = layoutMode === "wide" ? 30 : 17;
  // The identity and owner rows have less room than a plain value row. Keeping
  // their text within those lanes prevents terminal wrapping from painting a
  // territory name over the Owner row.
  const identityLimit = layoutMode === "wide" ? 34 : 24;
  const ownerValueLimit = layoutMode === "wide" ? 22 : 14;
  const flavorLimit = layoutMode === "wide" ? 34 : 22;

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
        titleColor="#38bdf8"
        border
        borderStyle="single"
        borderColor="#24566d"
        backgroundColor="#080f1a"
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
        style={{ height: 7 }}
      >
        {/* Table Header */}
        <box flexDirection="row" justifyContent="space-between" marginBottom={0}>
          <text fg="#64748b">
            # Player
          </text>
          <text fg="#64748b">
            {isLobby ? "Status" : "Terrs Armies   Turn"}
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
            const isMe = p.id === myPlayerId;
            const rawName = p.name;
            const displayName = (rawName.length > 7 ? rawName.slice(0, 6) + "…" : rawName).padEnd(7, " ");
            return (
              <box key={p.id} flexDirection="row" justifyContent="space-between">
                <text>
                  <span fg="#94a3b8">{idx + 1} </span>
                  <span fg={p.colorHex}>● </span>
                  <span fg="#e2e8f0">{displayName}</span>
                  {isMe && <span fg="#00ff66">*</span>}
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
            const isEliminated = !p.isAlive;
            const turnText = isActive ? "Active" : isEliminated ? "Dead" : "Wait";
            const isMe = p.id === myPlayerId;
            const rawName = p.name;
            const displayName = (rawName.length > 7 ? rawName.slice(0, 6) + "…" : rawName).padEnd(7, " ");

            return (
              <box
                key={p.id}
                flexDirection="row"
                justifyContent="space-between"
                backgroundColor={isActive ? "#06381e" : undefined}
                paddingLeft={0}
                paddingRight={0}
              >
                <text fg={isActive ? "#00ff66" : isEliminated ? "#ef4444" : undefined}>
                  <span fg="#94a3b8">{idx + 1} </span>
                  <span fg={p.colorHex}>● </span>
                  <span fg={isActive ? "#00ff66" : isEliminated ? "#ef4444" : "#e2e8f0"}>
                    <b>{displayName}</b>
                  </span>
                  {isMe && <span fg={isEliminated ? "#ef4444" : "#00ff66"}>*</span>}
                </text>
                <text fg={isActive ? "#00ff66" : isEliminated ? "#ef4444" : "#e2e8f0"}>
                  <b>
                    {String(owned.length).padStart(3, " ")}  {String(totalUnits).padStart(4, " ")}   {turnText.padStart(6, " ")}
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
        titleColor="#38bdf8"
        border
        borderStyle="single"
        borderColor="#24566d"
        backgroundColor="#080f1a"
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
        style={{ height: activeTid ? 14 : 7 }}
      >
        {!activeTid ? (
          <box
            flexDirection="column"
            paddingTop={1}
            gap={1}
          >
            <text fg="#64748b">
              <i>Move over or click a territory to inspect.</i>
            </text>
            <text fg="#475569">
              Map intel will appear here.
            </text>
          </box>
        ) : (
          <>
            {/* Keep identity on two short rows so the data columns below remain stable. */}
            <box flexDirection="column" style={{ height: 2 }} flexShrink={0}>
              <box flexDirection="row" alignItems="center" gap={1}>
                <text fg="#ffffff"><b>[{mapBundle.metadata.displayCodes[activeTid] ?? activeTid}]</b></text>
                {inspectionMode !== "none" && (
                  <text fg={inspectionMode === "selected" ? "#00ffff" : "#ffaa00"}>
                    <b>{inspectionMode === "selected" ? "SEL" : "HOV"}</b>
                  </text>
                )}
              </box>
              <text fg="#00d2ff">
                <b>{fitSidebarText(territoryName, identityLimit)}</b>
              </text>
            </box>

            {/* Fixed label column prevents values from colliding at narrow widths. */}
            <box flexDirection="column" style={{ height: 4 }} flexShrink={0}>
              <box flexDirection="row" style={{ height: 1 }}>
                <text fg="#64748b" style={{ width: 10 }}>Owner</text>
                <text flexGrow={1} flexShrink={1}>
                  <span fg={ownerColor}>● </span>
                  <span fg="#e2e8f0"><b>{fitSidebarText(ownerName, ownerValueLimit)}</b></span>
                </text>
              </box>
              <box flexDirection="row" style={{ height: 1 }}>
                <text fg="#64748b" style={{ width: 10 }}>Armies</text>
                <text fg="#e2e8f0" flexGrow={1}><b>{armiesCount}</b></text>
              </box>
              <box flexDirection="row" style={{ height: 1 }}>
                <text fg="#64748b" style={{ width: 10 }}>Region</text>
                <text fg="#e2e8f0" flexGrow={1}><b>{fitSidebarText(sectorName, valueLimit)}</b></text>
              </box>
              <box flexDirection="row" style={{ height: 1 }}>
                <text fg="#64748b" style={{ width: 10 }}>Bonus</text>
                <text fg="#00ff66" flexGrow={1}><b>+{region?.bonusReinforcements ?? 0} armies</b></text>
              </box>
            </box>

            {/* Neighbor ids wrap inside a two-line lane and cannot displace the quote. */}
            <box flexDirection="row" flexWrap="wrap" gap={1} style={{ height: 2 }} flexShrink={0}>
              {neighborIds.map((nId) => {
                const isTarget = targetTerritoryId === nId;
                const nDef = mapBundle.definition.territories.find((t) => t.id === nId);
                const nRegion = mapBundle.definition.sectors.find(s => s.id === nDef?.sectorId);
                const nState = territories[nId];
                const nOwner = nState ? state?.players.find((p) => p.id === nState.ownerId) : undefined;
                const nColor = isTarget ? "#00ffff" : nOwner?.colorHex ?? nRegion?.colorHex ?? "#94a3b8";

                return (
                  <text
                    key={nId}
                    fg={nColor}
                    onMouseDown={() => onSelectTarget?.(nId)}
                  >
                    <b>[{mapBundle.metadata.displayCodes[nId] ?? nId}{isTarget ? "*" : ""}]</b>
                  </text>
                );
              })}
            </box>

            {/* Reserved quote lane keeps a long flavor line below the neighbor chips. */}
            <box style={{ height: 2 }} flexShrink={0}>
              {flavorQuote ? (
                <text fg="#64748b">
                  <i>"{fitSidebarText(flavorQuote, flavorLimit)}"</i>
                </text>
              ) : null}
            </box>
          </>
        )}
      </box>

      {/* CARD 3: ! ACTIONS */}
      <box
        title="! ACTIONS"
        titleColor="#38bdf8"
        border
        borderStyle="single"
        borderColor="#24566d"
        backgroundColor="#080f1a"
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
        gap={0}
        style={{ height: isLobby || phase === "deployment" ? 8 : 7 }}
      >
        {myPlayer && !myPlayer.isAlive ? (
          <box flexDirection="column" gap={1} justifyContent="center" alignItems="center" flexGrow={1}>
            <text fg="#ef4444">
              <b>YOU HAVE BEEN ELIMINATED</b>
            </text>
            <text fg="#94a3b8">
              <i>Spectating remaining commanders</i>
            </text>
            <text fg="#64748b">
              Map inspection & chat active
            </text>
          </box>
        ) : isLobby ? (
          <box flexDirection="column" gap={0} paddingTop={0}>
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
          <box flexDirection="column" gap={0}>
            {/* Compact one-line controls preserve four actions inside the active card. */}
            {pendingConquestMove && isMyTurn ? (
              <box flexDirection="row" justifyContent="space-between">
                <text fg="#a78bfa" onMouseDown={onDecreaseConquestMove}><b>[−]</b></text>
                <text fg="#e9d5ff"><b>Move {conquestMoveUnits} / {pendingConquestMove.maximumUnits}</b></text>
                <text fg="#a78bfa" onMouseDown={onIncreaseConquestMove}><b>[+]</b></text>
                <text fg="#e9d5ff" onMouseDown={onConfirmConquestMove}><b>[Enter] Confirm</b></text>
              </box>
            ) : <>
              <box flexDirection="row" gap={1}>
                <text fg={canDeploy ? "#00d2ff" : "#64748b"} onMouseDown={canDeploy ? onDecreaseDeployment : undefined}><b>[−]</b></text>
                <text fg={canDeploy ? "#e2e8f0" : "#64748b"}>{pendingReinforcements > 0 ? `${selectedDeploymentCount}/${pendingReinforcements}` : "-"}</text>
                <text fg={canDeploy ? "#00d2ff" : "#64748b"} onMouseDown={canDeploy ? onIncreaseDeployment : undefined}><b>[+]</b></text>
                <text fg={canDeploy ? "#00d2ff" : "#64748b"} onMouseDown={canDeploy ? onSelectMinimumDeployment : undefined}><b>[1]</b></text>
                <text fg={canDeploy ? "#00d2ff" : "#64748b"} onMouseDown={canDeploy ? onSelectAllDeployments : undefined}><b>[All]</b></text>
              </box>
              {phase === "deployment" && <box onMouseDown={canDeploy ? onDeploy : undefined}>
                <text fg={canDeploy ? "#00d2ff" : "#e2e8f0"}>
                  <b>[D] ➜ Deploy</b><span fg="#64748b">  [/ adjust, 0 one]</span>
                </text>
              </box>}
            </>}

            <box
              flexDirection="row"
              justifyContent="space-between"
              onMouseDown={canAttack ? onAttack : undefined}
            >
              <text fg={canAttack ? "#00ffff" : "#e2e8f0"}>
                <b>[A] ⚔ Attack</b>
              </text>
              <text fg="#64748b">
                {targetTerritoryId ? targetTerritoryId : "-"}
              </text>
            </box>

            <box
              flexDirection="row"
              onMouseDown={canFortify ? onFortify : undefined}
            >
              <text fg={canFortify ? "#00ff66" : "#e2e8f0"}>
                <b>[F] 🛡 Fortify</b>
              </text>
            </box>

            <box
              flexDirection="row"
              onMouseDown={
                canSkipOrEnd
                  ? phase === "attack"
                    ? onSkipPhase
                    : onEndTurn
                  : undefined
              }
            >
              <text fg={canSkipOrEnd ? "#ffaa00" : "#e2e8f0"}>
                <b>{phase === "attack"
                  ? (pendingPhaseAction === "skip-attack" ? "[ Confirm Skip ]" : "[E] » End Attack")
                  : (pendingPhaseAction === "end-turn" ? "[ Confirm End Turn ]" : "[E] » End Turn")}</b>
              </text>
            </box>
          </box>
        )}
      </box>

      {/* CARD 4: ! REALM & SESSION INTEL */}
      {layoutMode !== "standard" && (
        <box
          title="! REALM & SESSION INTEL"
          titleColor="#64748b"
          border
          borderStyle="single"
          borderColor="#1e3a4a"
          backgroundColor="#080f1a"
          flexDirection="column"
          paddingLeft={1}
          paddingRight={1}
          // Lobby has only the session facts below; allowing this card to grow
          // makes its border consume the otherwise unused sidebar height.
          flexGrow={isLobby ? 0 : 1}
          style={isLobby ? { height: 9 } : undefined}
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
                <b>{fitSidebarText(mapBundle.definition.name, valueLimit + 4)}</b>
              </text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg="#64748b">Territories</text>
              <text fg="#e2e8f0">
                <b>{mapBundle.definition.territories.length} Territories</b>
              </text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg="#64748b">Regions</text>
              <text fg="#e2e8f0">
                <b>{mapBundle.definition.sectors.length} {mapBundle.metadata.regionPlural}</b>
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
