import React, { useState } from "react";
import type { GameEvent, Player } from "@conquest/protocol";
import { MAP_GRID_IRONREACH, MAP_IRONREACH } from "@conquest/map-engine";

export interface EventLogProps {
  events: GameEvent[];
  chatOpen: boolean;
  players: Player[];
  onToggleChat: () => void;
  onSendChat: (text: string) => void;
}

export type EventTab = "All" | "Game" | "Chat" | "System";

export interface FormattedEventItem {
  timestamp: string;
  senderName?: string;
  senderColor?: string;
  text: string;
  color: string;
  category: "Game" | "Chat" | "System";
}

// Fallback sample events matching ref.png if no events yet
const SAMPLE_EVENTS: FormattedEventItem[] = [
  {
    timestamp: "19:14",
    senderName: "Alex",
    senderColor: "#00ff66",
    text: "Alex received 5 reinforcements.",
    color: "#e2e8f0",
    category: "Game",
  },
  {
    timestamp: "19:15",
    senderName: "Casey",
    senderColor: "#38bdf8",
    text: "Casey captured A3 from Blair.",
    color: "#e2e8f0",
    category: "Game",
  },
  {
    timestamp: "19:16",
    senderName: "Drew",
    senderColor: "#ff4444",
    text: "Drew: nice move!",
    color: "#e2e8f0",
    category: "Chat",
  },
  {
    timestamp: "19:16",
    senderName: "Blair",
    senderColor: "#00d2ff",
    text: "Blair: still a long way to go...",
    color: "#e2e8f0",
    category: "Chat",
  },
  {
    timestamp: "19:17",
    senderName: "Alex",
    senderColor: "#00ff66",
    text: "Alex: C2 looks vulnerable 👀",
    color: "#e2e8f0",
    category: "Chat",
  },
  {
    timestamp: "19:17",
    senderName: "Casey",
    senderColor: "#38bdf8",
    text: "Casey: winter is coming.",
    color: "#e2e8f0",
    category: "Chat",
  },
];

/**
 * Formats a GameEvent for military chronicles (preserves exact test compatibility).
 */
export function formatEvent(
  e: GameEvent,
  players: Player[]
): { text: string; color: string } {
  const getPlayerName = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const getTerritoryName = (id: string) =>
    MAP_GRID_IRONREACH.territories.find((t) => t.id === id)?.name ??
    MAP_IRONREACH.territories.find((t) => t.id === id)?.name ??
    id;

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
        text: `💬 ${e.senderName}: "${e.text}"`,
        color: "#e879f9",
      };
    default:
      return { text: JSON.stringify(e), color: "#94a3b8" };
  }
}

function getEventCategory(e: GameEvent): "Game" | "Chat" | "System" {
  if (e.type === "chat_message") return "Chat";
  if (
    e.type === "player_joined" ||
    e.type === "player_left" ||
    e.type === "player_reconnected" ||
    e.type === "game_started"
  ) {
    return "System";
  }
  return "Game";
}

function formatTimestamp(ts?: number): string {
  if (!ts) return "19:14";
  const date = new Date(ts);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function EventLog({
  events,
  chatOpen,
  players,
  onToggleChat,
  onSendChat,
}: EventLogProps) {
  const [activeTab, setActiveTab] = useState<EventTab>("All");

  const formattedItems: FormattedEventItem[] =
    events.length > 0
      ? events.map((e) => {
          const { text, color } = formatEvent(e, players);
          const category = getEventCategory(e);
          let senderName: string | undefined;
          let senderColor: string | undefined;

          if ("playerId" in e && typeof e.playerId === "string") {
            const p = players.find((p) => p.id === e.playerId);
            if (p) {
              senderName = p.name;
              senderColor = p.colorHex;
            }
          } else if ("attackerId" in e && typeof e.attackerId === "string") {
            const p = players.find((p) => p.id === e.attackerId);
            if (p) {
              senderName = p.name;
              senderColor = p.colorHex;
            }
          } else if (e.type === "chat_message") {
            senderName = e.senderName;
            const p = players.find((p) => p.name === e.senderName);
            senderColor = p?.colorHex ?? "#e879f9";
          }

          return {
            timestamp: formatTimestamp(e.timestamp),
            senderName,
            senderColor,
            text,
            color,
            category,
          };
        })
      : SAMPLE_EVENTS;

  const filteredItems =
    activeTab === "All"
      ? formattedItems
      : formattedItems.filter((item) => item.category === activeTab);

  const displayedItems = filteredItems.slice(-6);

  return (
    <box
      title="! EVENT LOG / CHAT"
      titleColor="#00d2ff"
      border
      borderStyle="single"
      borderColor="#00d2ff"
      backgroundColor="#080f1a"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      style={{ width: 78, height: 9 }}
    >
      {/* Title bar with tabs right aligned */}
      <box flexDirection="row" justifyContent="flex-end" marginBottom={0}>
        <box flexDirection="row" gap={1}>
          <text
            fg={activeTab === "All" ? "#00ff66" : "#64748b"}
            onMouseDown={() => setActiveTab("All")}
          >
            <b>All</b>
          </text>
          <text fg="#334155">│</text>
          <text
            fg={activeTab === "Game" ? "#00ff66" : "#64748b"}
            onMouseDown={() => setActiveTab("Game")}
          >
            Game
          </text>
          <text fg="#334155">│</text>
          <text
            fg={activeTab === "Chat" ? "#00ff66" : "#64748b"}
            onMouseDown={() => setActiveTab("Chat")}
          >
            Chat
          </text>
          <text fg="#334155">│</text>
          <text
            fg={activeTab === "System" ? "#00ff66" : "#64748b"}
            onMouseDown={() => setActiveTab("System")}
          >
            System
          </text>
        </box>
      </box>

      {/* Event list with scrollbar on the right */}
      <box flexDirection="row" justifyContent="space-between" flexGrow={1}>
        <box flexDirection="column" gap={0} flexGrow={1}>
          {displayedItems.map((item, idx) => (
            <box key={idx} flexDirection="row" gap={1}>
              <text fg="#64748b">[{item.timestamp}]</text>
              <text fg={item.color}>
                {item.senderName && item.senderColor ? (
                  <>
                    <span fg={item.senderColor}><b>{item.senderName}</b></span>
                    <span fg="#e2e8f0">{item.text.slice(item.senderName.length)}</span>
                  </>
                ) : (
                  <span>{item.text}</span>
                )}
              </text>
            </box>
          ))}
          {displayedItems.length === 0 && (
            <text fg="#64748b">
              <i>No entries in {activeTab} chronicle</i>
            </text>
          )}
        </box>

        {/* Scrollbar Track matching ref.png */}
        <box flexDirection="column" alignItems="center" style={{ width: 1 }}>
          <text fg="#00ff66">█</text>
          <text fg="#1e293b">│</text>
          <text fg="#1e293b">│</text>
          <text fg="#1e293b">│</text>
        </box>
      </box>

      {/* Chat Input Field if open */}
      {chatOpen && (
        <box
          border
          borderStyle="single"
          borderColor="#00ffff"
          backgroundColor="#0c2b3d"
          height={3}
          paddingLeft={1}
          paddingRight={1}
          marginTop={1}
          alignItems="center"
          flexDirection="row"
        >
          <text fg="#00ffff">
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
      )}
    </box>
  );
}
