import React from "react";
import type { GameState } from "@conquest/protocol";
import { MAP_IRONREACH } from "@conquest/map-engine";

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
  onSelectTarget,
}: SidebarProps) {
  const territories = state?.territories ?? {};
  const players = state?.players ?? [];
  const activePlayer = state ? state.players[state.activePlayerIndex] : undefined;
  const isMyTurn = Boolean(activePlayer && activePlayer.id === myPlayerId);
  const phase = state?.phase ?? "lobby";
  const pendingReinforcements = state?.pendingReinforcements ?? 0;

  const selectedTerritory = selectedTerritoryId ? territories[selectedTerritoryId] : null;
  const selectedDef = selectedTerritoryId
    ? MAP_IRONREACH.territories.find((t) => t.id === selectedTerritoryId)
    : null;
  const selectedSector = selectedTerritory
    ? MAP_IRONREACH.sectors.find((s) => s.id === selectedTerritory.sectorId)
    : null;
  const selectedOwner = selectedTerritory
    ? players.find((p) => p.id === selectedTerritory.ownerId)
    : null;

  const targetTerritory = targetTerritoryId ? territories[targetTerritoryId] : null;
  const targetOwner = targetTerritory
    ? players.find((p) => p.id === targetTerritory.ownerId)
    : null;

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

  // Tactical prompt explaining next legal move
  let tacticalPrompt = "Await orders from the sovereign commanders.";
  if (phase === "lobby") {
    tacticalPrompt = myPlayer?.ready
      ? "Forces mustered. Awaiting all lords to declare ready."
      : "Muster forces. Declare Ready for battle! [R]";
  } else if (!isMyTurn) {
    tacticalPrompt = `Lord ${activePlayer?.name ?? "opponent"} commands the realm (${phase.toUpperCase()}).`;
  } else if (phase === "deployment") {
    if (pendingReinforcements > 0) {
      if (!selectedTerritory) {
        tacticalPrompt = `Select a friendly realm to muster +${pendingReinforcements} reinforcements.`;
      } else if (!isSelectedOwnedByMe) {
        tacticalPrompt = "Select a realm under your rule to deploy reinforcements.";
      } else {
        tacticalPrompt = `Press [D] to deploy +${pendingReinforcements} armies to ${selectedTerritory.name}.`;
      }
    } else {
      tacticalPrompt = "All reinforcements dispatched. Advance to attack phase.";
    }
  } else if (phase === "attack") {
    if (!selectedTerritory) {
      tacticalPrompt = "Select a realm you rule with 2+ armies to lead the assault.";
    } else if (!isSelectedOwnedByMe) {
      tacticalPrompt = "You must lead invasions from a realm you rule.";
    } else if (selectedTerritory.units < 2) {
      tacticalPrompt = "At least 2 armies required to mount an attack.";
    } else if (!targetTerritory) {
      tacticalPrompt = `Select an adjacent enemy realm to invade from ${selectedTerritory.name}.`;
    } else {
      tacticalPrompt = `Press [A] to assault ${targetTerritory.name} from ${selectedTerritory.name}!`;
    }
  } else if (phase === "fortify") {
    if (!selectedTerritory) {
      tacticalPrompt = "Select a realm to redeploy troops from, or press [E] to end turn.";
    } else if (!isSelectedOwnedByMe) {
      tacticalPrompt = "Select a realm you rule to redeploy garrison troops.";
    } else if (selectedTerritory.units < 2) {
      tacticalPrompt = "Must leave at least 1 army behind to garrison.";
    } else if (!targetTerritory) {
      tacticalPrompt = `Select a friendly neighboring realm to reinforce from ${selectedTerritory.name}.`;
    } else {
      tacticalPrompt = `Press [F] to fortify ${Math.max(1, selectedTerritory.units - 1)} armies into ${targetTerritory.name}.`;
    }
  } else if (phase === "game_over") {
    tacticalPrompt = "The War for the Ironreach has ended! All hail the sovereign!";
  }

  return (
    <box
      flexDirection="column"
      border
      borderStyle="single"
      borderColor="#334155"
      style={{ width: 42, paddingLeft: 1, paddingRight: 1, paddingTop: 0, paddingBottom: 0 }}
      gap={1}
    >
      {/* SECTION 1: FACTIONS & REALMS */}
      <box flexDirection="column">
        <text fg="#00d2ff">
          <b>── FACTIONS & REALMS ──</b>
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
                  <span fg={p.colorHex}>● </span>
                  <span fg={isMe ? "#00ff66" : "#ffffff"}>
                    <b>{p.name}</b>
                    {isMe ? " (You)" : ""}
                  </span>
                  {isActive && <span fg="#ffaa00"><b> ⚔ ACTIVE</b></span>}
                </text>
                <text fg={!p.isAlive ? "#ff4444" : !p.connected ? "#64748b" : "#00ff66"}>
                  {!p.isAlive ? "[FALLEN]" : !p.connected ? "[OFFLINE]" : "[RULER]"}
                </text>
              </box>
              <text fg="#94a3b8">
                {"   "}Realms: <b>{owned.length}</b> │ Armies: <b>{totalUnits}</b>
              </text>
            </box>
          );
        })}
        {players.length === 0 && (
          <text fg="#64748b">
            <i>No lords joined yet</i>
          </text>
        )}

        {/* Regional Realm Dominions */}
        <box flexDirection="column" marginTop={1}>
          {MAP_IRONREACH.sectors.map((s) => {
            const ownerOfFirst = territories[s.territoryIds[0]]?.ownerId;
            const ownsAll =
              ownerOfFirst &&
              s.territoryIds.every((tid) => territories[tid]?.ownerId === ownerOfFirst);
            const controller = ownsAll ? players.find((p) => p.id === ownerOfFirst) : null;

            return (
              <text key={s.id} fg="#94a3b8">
                <span fg={s.colorHex}>■ {s.name} (+{s.bonusReinforcements}): </span>
                {controller ? (
                  <span fg={controller.colorHex}>
                    <b>{controller.name}</b>
                  </span>
                ) : (
                  <span fg="#64748b">Contested</span>
                )}
              </text>
            );
          })}
        </box>
      </box>

      {/* SECTION 2: TERRITORY INTEL */}
      <box flexDirection="column">
        <text fg="#ffaa00">
          <b>── TERRITORY INTEL ──</b>
        </text>
        {selectedTerritory ? (
          <box flexDirection="column">
            <box flexDirection="row" justifyContent="space-between">
              <text fg="#ffffff">
                <b>⚑ {selectedTerritory.name.toUpperCase()}</b>
              </text>
              <text fg={selectedSector?.colorHex ?? "#00d2ff"}>
                <b>[{selectedSector?.name ?? selectedTerritory.sectorId}]</b>
              </text>
            </box>

            {selectedDef?.render?.flavor && (
              <text fg="#94a3b8">
                <i>"{selectedDef.render.flavor}"</i>
              </text>
            )}

            <text fg="#94a3b8">
              Ruler:{" "}
              <span fg={selectedOwner?.colorHex ?? "#ffffff"}>
                <b>{selectedOwner?.name ?? "Neutral"}</b>
              </span>
              {" │ "}Garrison:{" "}
              <span fg="#00ff66">
                <b>⚔ {selectedTerritory.units} Standing Armies</b>
              </span>
            </text>

            <text fg="#64748b" marginTop={1}>
              <b>Bordering Realms:</b>
            </text>
            {selectedTerritory.neighbors.map((nId) => {
              const neighbor = territories[nId];
              const nDef = MAP_IRONREACH.territories.find((t) => t.id === nId);
              if (!neighbor) return null;
              const nOwner = players.find((p) => p.id === neighbor.ownerId);
              const isEnemy = neighbor.ownerId !== myPlayerId;
              const isNeighborTargeted = targetTerritoryId === nId;

              const actionLabel = isEnemy ? "Attack ⚔" : "Fortify 🛡";
              const chipColor = isEnemy ? "#ff4444" : "#00ff66";
              const chipBg = isNeighborTargeted
                ? isEnemy
                  ? "#4c0519"
                  : "#064e3b"
                : undefined;

              return (
                <box
                  key={nId}
                  flexDirection="row"
                  justifyContent="space-between"
                  alignItems="center"
                  onMouseDown={() => onSelectTarget?.(nId)}
                  style={{ paddingLeft: 1, paddingRight: 1 }}
                >
                  <text fg={isEnemy ? "#fca5a5" : "#86efac"}>
                    {isEnemy ? "⚔" : "🛡"} {nDef?.name ?? neighbor.name}: <b>{neighbor.units}</b>u [
                    <span fg={nOwner?.colorHex ?? "#ffffff"}>
                      {nOwner?.name ?? "Neutral"}
                    </span>
                    ]
                  </text>
                  <box
                    border
                    borderStyle="single"
                    borderColor={isNeighborTargeted ? chipColor : "#475569"}
                    backgroundColor={chipBg}
                    paddingLeft={1}
                    paddingRight={1}
                  >
                    <text fg={isNeighborTargeted ? chipColor : "#94a3b8"}>
                      <b>{isNeighborTargeted ? `● TARGETED` : `[${actionLabel}]`}</b>
                    </text>
                  </box>
                </box>
              );
            })}

            {targetTerritory && (
              <box
                border
                borderStyle="double"
                borderColor={isTargetEnemy ? "#ff4444" : "#00ff66"}
                backgroundColor={isTargetEnemy ? "#2e1018" : "#0d2b1a"}
                paddingLeft={1}
                paddingRight={1}
                marginTop={1}
                flexDirection="column"
              >
                <text fg={isTargetEnemy ? "#ff4444" : "#00ff66"}>
                  <b>
                    {isTargetEnemy ? "⚔ ASSAULT TARGET" : "🛡 FORTIFY DEST"}:{" "}
                    {targetTerritory.name}
                  </b>
                </text>
                <text fg="#94a3b8">
                  Ruler:{" "}
                  <span fg={targetOwner?.colorHex ?? "#ffffff"}>
                    <b>{targetOwner?.name ?? "Neutral"}</b>
                  </span>{" "}
                  │ ⚔ <b>{targetTerritory.units} Standing Armies</b>
                </text>
              </box>
            )}
          </box>
        ) : (
          <text fg="#64748b">
            <i>Select a realm on the map to inspect intelligence.</i>
          </text>
        )}
      </box>

      {/* SECTION 3: WAR COUNCIL ACTIONS */}
      <box flexDirection="column" gap={0}>
        <text fg="#00d2ff">
          <b>── WAR COUNCIL ACTIONS ──</b>
        </text>

        {/* Tactical prompt */}
        <text fg="#38bdf8" marginBottom={1}>
          <i>{tacticalPrompt}</i>
        </text>

        {phase === "lobby" && onReady && (
          <box
            border
            borderStyle="double"
            borderColor={myPlayer?.ready ? "#64748b" : "#00ff66"}
            backgroundColor={myPlayer?.ready ? undefined : "#0d2b1a"}
            onMouseDown={onReady}
            paddingLeft={1}
          >
            <text fg={myPlayer?.ready ? "#64748b" : "#00ff66"}>
              <b>[R] {myPlayer?.ready ? "WAITING FOR PLAYERS" : "DECLARE READY FOR WAR"}</b>
            </text>
          </box>
        )}

        <box
          border
          borderStyle={canDeploy ? "double" : "single"}
          borderColor={canDeploy ? "#00ff66" : "#334155"}
          backgroundColor={canDeploy ? "#0d2b1a" : undefined}
          onMouseDown={canDeploy ? onDeploy : undefined}
          paddingLeft={1}
        >
          <text fg={canDeploy ? "#00ff66" : "#475569"}>
            <b>[D] Deploy Reinforcements {canDeploy ? `(+${pendingReinforcements})` : ""}</b>
          </text>
        </box>

        <box
          border
          borderStyle={canAttack ? "double" : "single"}
          borderColor={canAttack ? "#ff4444" : "#334155"}
          backgroundColor={canAttack ? "#2e1018" : undefined}
          onMouseDown={canAttack ? onAttack : undefined}
          paddingLeft={1}
        >
          <text fg={canAttack ? "#ff4444" : "#475569"}>
            <b>[A] Attack Selected Target</b>
          </text>
        </box>

        <box
          border
          borderStyle={canFortify ? "double" : "single"}
          borderColor={canFortify ? "#9966ff" : "#334155"}
          backgroundColor={canFortify ? "#1e1438" : undefined}
          onMouseDown={canFortify ? onFortify : undefined}
          paddingLeft={1}
        >
          <text fg={canFortify ? "#9966ff" : "#475569"}>
            <b>[F] Fortify Troops</b>
          </text>
        </box>

        <box
          border
          borderStyle={canSkipOrEnd ? "double" : "single"}
          borderColor={canSkipOrEnd ? "#ffaa00" : "#334155"}
          backgroundColor={canSkipOrEnd ? "#2d1f05" : undefined}
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
