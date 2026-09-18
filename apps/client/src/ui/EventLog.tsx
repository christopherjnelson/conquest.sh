import React from "react";
import type { GameEvent, Player } from "@conquest/protocol";
import { MAP_IRONREACH } from "@conquest/map-engine";

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
  const getTerritoryName = (id: string) =>
    MAP_IRONREACH.territories.find((t) => t.id === id)?.name ?? id;

  switch (e.type) {
    case "player_joined":
      return {
        text: `⚜ Lord ${e.player.name} has taken their seat at the war table`,
        color: "#00d2ff",
      };
    case "player_left":
      return {
        text: `✦ Lord ${getPlayerName(e.playerId)} retreated from the council`,
        color: "#ff4444",
      };
    case "player_reconnected":
      return {
        text: `↺ Lord ${getPlayerName(e.playerId)} returned to the realm`,
        color: "#00ff66",
      };
    case "game_started":
      return {
        text: `⚔ WAR FOR THE IRONREACH HAS BEGUN ── Turn 1 ⚔`,
        color: "#ffaa00",
      };
    case "phase_changed":
      return {
        text: `📜 Council Order: ${e.phase.toUpperCase()} phase initiated by ${getPlayerName(e.activePlayerId)}`,
        color: "#38bdf8",
      };
    case "units_deployed": {
      const player = getPlayerName(e.playerId);
      const territory = getTerritoryName(e.territoryId);
      return {
        text: `🛡 ${player} reinforced ${territory} (+${e.count} armies)`,
        color: "#00ff66",
      };
    }
    case "attack_resolved": {
      const attacker = getPlayerName(e.attackerId);
      const defender = getPlayerName(e.defenderId);
      const territory = getTerritoryName(e.targetTerritoryId);

      if (e.conquered) {
        return {
          text: `⚔ ${attacker} captured ${territory} from ${defender}!`,
          color: "#ff3399",
        };
      }

      const losses = `-${e.attackerLosses} att, -${e.defenderLosses} def`;
      return {
        text: `🎲 Battle at ${territory}: ${attacker} vs ${defender} (${losses})`,
        color: "#f97316",
      };
    }
    case "units_fortified": {
      const player = getPlayerName(e.playerId);
      const target = getTerritoryName(e.targetTerritoryId);
      return {
        text: `🛡 ${player} fortified ${e.units} armies to ${target}`,
        color: "#9966ff",
      };
    }
    case "turn_ended":
      return {
        text: `── Turn ${e.turnNumber}: Sovereign ${getPlayerName(e.nextPlayerId)} commands (+${e.reinforcements} reinforcements) ──`,
        color: "#ffaa00",
      };
    case "player_eliminated": {
      const player = getPlayerName(e.playerId);
      return {
        text: `💀 ${player} has fallen in battle!`,
        color: "#ff4444",
      };
    }
    case "game_won": {
      const winner = e.winnerName;
      return {
        text: `👑 ${winner} has conquered the entire realm!`,
        color: "#ffaa00",
      };
    }
    case "chat_message":
      return {
        text: `💬 [Raven] ${e.senderName}: "${e.text}"`,
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
          <b>CHRONICLES OF WAR & REALM COMMUNICATIONS</b>
        </text>
        <text fg="#64748b">
          {chatOpen ? "[Esc] Close Raven" : "[C] Send Raven (Chat)"}
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
            <i>The chronicles await the clash of steel...</i>
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
            <b>Send Raven: </b>
          </text>
          <input
            focused
            placeholder="Compose message to other lords and press Enter..."
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
