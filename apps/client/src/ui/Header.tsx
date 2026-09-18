import React from "react";
import type { GamePhase, Player } from "@conquest/protocol";
import type { ConnectionStatus } from "../network/client.js";

export interface HeaderProps {
  roomCode: string | null;
  turnNumber: number;
  activePlayer: Player | undefined;
  phase: GamePhase;
  pendingReinforcements: number;
  connectionStatus: ConnectionStatus;
  isMyTurn: boolean;
}

export function Header({
  roomCode,
  turnNumber,
  activePlayer,
  phase,
  pendingReinforcements,
  connectionStatus,
  isMyTurn,
}: HeaderProps) {
  let phaseColor = "#00d2ff";
  let phaseLabel = "DEPLOYMENT";

  switch (phase) {
    case "lobby":
      phaseColor = "#ffaa00";
      phaseLabel = "LOBBY";
      break;
    case "deployment":
      phaseColor = "#00d2ff";
      phaseLabel = "DEPLOYMENT";
      break;
    case "attack":
      phaseColor = "#ff4444";
      phaseLabel = "ATTACK";
      break;
    case "fortify":
      phaseColor = "#9966ff";
      phaseLabel = "FORTIFY";
      break;
    case "game_over":
      phaseColor = "#ff3399";
      phaseLabel = "GAME OVER";
      break;
  }

  let statusColor = "#00ff66";
  let statusLabel = "● ONLINE";
  if (connectionStatus === "reconnecting") {
    statusColor = "#ffaa00";
    statusLabel = "◌ RECONNECTING";
  } else if (connectionStatus === "connecting") {
    statusColor = "#ffaa00";
    statusLabel = "◌ CONNECTING";
  } else if (connectionStatus === "disconnected") {
    statusColor = "#ff4444";
    statusLabel = "○ OFFLINE";
  }

  const activePlayerName = activePlayer?.name ?? "Waiting";

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      border
      borderStyle="rounded"
      borderColor="#00d2ff"
      paddingLeft={1}
      paddingRight={1}
      height={3}
    >
      <box flexDirection="row" gap={1}>
        <text fg="#00d2ff">
          <b>CONQUEST.SH ── WAR FOR THE IRONREACH</b>
        </text>
        <text fg="#475569">│</text>
        <text fg="#ffaa00">
          ROOM: <b>{roomCode ?? "----"}</b>
        </text>
      </box>

      <box flexDirection="row" gap={1}>
        <text fg="#ffffff">
          Turn <b>{turnNumber}</b>
        </text>
        <text fg="#475569">│</text>
        <text fg={phaseColor}>
          Phase: <b>{phaseLabel}</b>
        </text>
        <text fg="#475569">│</text>
        <text fg="#00ff66">
          Reinforcements: <b>{pendingReinforcements}</b>
        </text>
        <text fg="#475569">│</text>
        <text>
          <span fg="#94a3b8">Active: </span>
          <span fg={activePlayer?.colorHex ?? "#ffffff"}>● </span>
          <span fg="#ffffff">
            <b>{activePlayerName}</b>
          </span>
          {isMyTurn && <span fg="#00ff66"><b> (YOU)</b></span>}
        </text>
      </box>

      <box flexDirection="row" gap={1}>
        <text fg={statusColor}>
          <b>{statusLabel}</b>
        </text>
      </box>
    </box>
  );
}
