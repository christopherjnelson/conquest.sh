import React from "react";
import type { GamePhase, Player } from "@conquest/protocol";
import type { ConnectionStatus } from "../network/client.js";

export interface HeaderProps {
  roomCode: string | null;
  turnNumber?: number;
  activePlayer?: Player | undefined;
  phase: GamePhase;
  pendingReinforcements?: number;
  connectionStatus: ConnectionStatus;
  isMyTurn: boolean;
}

export function Header({
  roomCode,
  turnNumber = 0,
  activePlayer,
  phase,
  pendingReinforcements = 0,
  connectionStatus,
  isMyTurn,
}: HeaderProps) {
  const isLobby = phase === "lobby";

  return (
    <box flexDirection="column" style={{ width: "100%" }} marginBottom={0}>
      {/* Top Window Bar: Traffic lights, App Title, Quit Shortcut & Version */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        paddingLeft={1}
        paddingRight={1}
        height={1}
      >
        <box flexDirection="row" gap={1}>
          <text>
            <span fg="#ff5f56">● </span>
            <span fg="#ffbd2e">● </span>
            <span fg="#27c93f">● </span>
            <span fg="#e2e8f0"><b>conquest.sh ─ A Terminal Strategy Game</b></span>
          </text>
        </box>

        <box flexDirection="row" gap={1}>
          <text fg="#64748b">
            Ctrl+C to quit  │  v0.2.0
          </text>
        </box>
      </box>

      {/* Main Header Box */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        border
        borderStyle="single"
        borderColor="#00d2ff"
        backgroundColor="#080f1a"
        paddingLeft={1}
        paddingRight={2}
        style={{ height: 5 }}
      >
        {/* Left: ASCII Art Logo + Subtitle */}
        <box flexDirection="row" alignItems="center" gap={2}>
          <box flexDirection="column">
            <text fg="#00ffff">
              <b>╔═╗╔═╗╔╗╔╔═╗╦ ╦╔═╗╔═╗╔╦╗   ╔═╗╦ ╦</b>
            </text>
            <text fg="#00ffff">
              <b>║  ║ ║║║║║ ║║ ║╠═ ╚═╗ ║    ╚═╗╠═╣</b>
            </text>
            <text fg="#00ffff">
              <b>╚═╝╚═╝╝╚╝╚═╩╩═╝╚═╝╚═╝ ╩  ▪ ╚═╝╩ ╩</b>
            </text>
          </box>

          <text fg="#334155">│</text>

          <text fg="#22d3ee">
            <b>CONQUER   NEGOTIATE   SURVIVE</b>
          </text>
        </box>

        {/* Center-Right Columns: Turn, Active Player, Reinforcements, Quote */}
        {isLobby ? (
          <box flexDirection="row" alignItems="center" gap={3}>
            {/* Lobby Status Column */}
            <box flexDirection="column">
              <text fg="#f59e0b">
                <b>Lobby: Waiting for players...</b>
              </text>
              <text fg="#64748b">
                Room Code: <span fg="#00d2ff"><b>{roomCode ?? "None"}</b></span>
              </text>
            </box>

            {/* Slogan Quote Column */}
            <box flexDirection="column">
              <text fg="#64748b">
                <i>"Same map.</i>
              </text>
              <text fg="#64748b">
                <i>Different stories."</i>
              </text>
              <text fg="#475569">
                ─ CONQUEST.SH
              </text>
            </box>
          </box>
        ) : (
          <box flexDirection="row" alignItems="center" gap={3}>
            {/* Turn Column */}
            <box flexDirection="column" alignItems="center">
              <text fg="#64748b">
                Turn <span fg="#00d2ff"><b>{turnNumber}/∞</b></span>
              </text>
              <text fg="#00d2ff">
                🏰
              </text>
            </box>

            {/* Active Player Column */}
            <box flexDirection="column">
              <text fg="#64748b">Active Player</text>
              {activePlayer ? (
                <text>
                  <span fg={activePlayer.colorHex}>● </span>
                  <span fg={activePlayer.colorHex}><b>{activePlayer.name}</b></span>
                  {isMyTurn && <span fg="#00ff66"> (You)</span>}
                </text>
              ) : (
                <text fg="#94a3b8">
                  None
                </text>
              )}
            </box>

            {/* Reinforcements Column */}
            <box flexDirection="column">
              <text fg="#64748b">Reinforcements</text>
              <text fg="#38bdf8">
                ♟ <b>{pendingReinforcements} remaining</b>
              </text>
            </box>

            {/* Slogan Quote Column */}
            <box flexDirection="column">
              <text fg="#64748b">
                <i>"Same map.</i>
              </text>
              <text fg="#64748b">
                <i>Different stories."</i>
              </text>
              <text fg="#475569">
                ─ CONQUEST.SH
              </text>
            </box>
          </box>
        )}
      </box>
    </box>
  );
}
