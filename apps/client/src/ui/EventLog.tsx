import React from "react";
import type { GameEvent, Player } from "@conquest/protocol";

export interface EventLogProps {
  events: GameEvent[];
  chatOpen: boolean;
  players: Player[];
  onToggleChat: () => void;
  onSendChat: (text: string) => void;
}

export function formatEvent(
  e: GameEvent,
  players: Player[]
): { text: string; color: string } {
  const getPlayerName = (id: string) => players.find((p) => p.id === id)?.name ?? id;

  switch (e.type) {
    case "player_joined":
      return {
        text: `[+] Player ${e.player.name} connected to grid`,
        color: "#00d2ff",
      };
    case "player_left":
      return {
        text: `[-] Player ${getPlayerName(e.playerId)} lost connection`,
        color: "#ff4444",
      };
    case "player_reconnected":
      return {
        text: `[↺] Player ${getPlayerName(e.playerId)} reconnected to room`,
        color: "#00ff66",
      };
    case "game_started":
      return {
        text: `=== SECTOR 07 ONLINE // COMBAT INITIATED (Turn 1) ===`,
        color: "#ffaa00",
      };
    case "phase_changed":
      return {
        text: `[►] Phase: ${e.phase.toUpperCase()} (${getPlayerName(e.activePlayerId)})`,
        color: "#38bdf8",
      };
    case "units_deployed":
      return {
        text: `[DEPLOY] ${getPlayerName(e.playerId)} deployed ${e.count} units to ${e.territoryId}`,
        color: "#00ff66",
      };
    case "attack_resolved": {
      const rollsStr = `[${e.attackerRolls.join(",")}] vs [${e.defenderRolls.join(",")}]`;
      const lossStr = `-${e.attackerLosses} att, -${e.defenderLosses} def`;
      const base = `[ATTACK] ${getPlayerName(e.attackerId)} -> ${e.targetTerritoryId} (${getPlayerName(e.defenderId)}) Rolls ${rollsStr} (${lossStr})`;
      if (e.conquered) {
        return { text: `${base} ★ CONQUERED!`, color: "#ff3399" };
      }
      return { text: base, color: "#f97316" };
    }
    case "units_fortified":
      return {
        text: `[FORTIFY] ${getPlayerName(e.playerId)} moved ${e.units} units: ${e.sourceTerritoryId} -> ${e.targetTerritoryId}`,
        color: "#9966ff",
      };
    case "turn_ended":
      return {
        text: `── Turn ${e.turnNumber}: Active player ${getPlayerName(e.nextPlayerId)} (+${e.reinforcements} reinforcements) ──`,
        color: "#ffaa00",
      };
    case "player_eliminated":
      return {
        text: `☠ ELIMINATED: ${getPlayerName(e.playerId)} was defeated by ${getPlayerName(e.eliminatedBy)}!`,
        color: "#ff4444",
      };
    case "game_won":
      return {
        text: `★ VICTORY: ${e.winnerName} HAS CONQUERED SECTOR 07! ★`,
        color: "#ff3399",
      };
    case "chat_message":
      return {
        text: `[CHAT] ${e.senderName}: ${e.text}`,
        color: "#e879f9",
      };
    default:
      return { text: JSON.stringify(e), color: "#94a3b8" };
  }
}

export function EventLog({
  events,
  chatOpen,
  players,
  onToggleChat,
  onSendChat,
}: EventLogProps) {
  // Show the last 7 events to comfortably fit in the console
  const displayedEvents = events.slice(-7);

  return (
    <box
      flexDirection="column"
      border
      borderStyle="single"
      borderColor="#334155"
      paddingLeft={1}
      paddingRight={1}
      style={{ flexGrow: 1, minHeight: 7 }}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text fg="#00d2ff">
          <b>TACTICAL COMM & EVENT LOG</b>
        </text>
        <text fg="#64748b">
          {chatOpen ? "[Esc] Close Chat" : "[C] Open Chat"}
        </text>
      </box>

      {/* Event list */}
      <box flexDirection="column" gap={0}>
        {displayedEvents.map((evt, idx) => {
          const { text, color } = formatEvent(evt, players);
          return (
            <text key={idx} fg={color}>
              {text}
            </text>
          );
        })}
        {displayedEvents.length === 0 && (
          <text fg="#64748b">
            <i>Awaiting telemetry and tactical data...</i>
          </text>
        )}
      </box>

      {/* Chat Input Field */}
      {chatOpen ? (
        <box
          border
          borderStyle="rounded"
          borderColor="#ff3399"
          height={3}
          paddingLeft={1}
          paddingRight={1}
          marginTop={1}
          alignItems="center"
          flexDirection="row"
        >
          <text fg="#ff3399">
            <b>Chat: </b>
          </text>
          <input
            focused
            placeholder="Type message and press Enter..."
            onSubmit={(val: any) => {
              const str = typeof val === "string" ? val : String(val?.value ?? "");
              if (str.trim()) {
                onSendChat(str.trim());
              }
              onToggleChat();
            }}
          />
        </box>
      ) : null}
    </box>
  );
}
