import React, { useState } from "react";
import type { GameEvent, Player } from "@conquest/protocol";
import { getDefaultMap, type LayoutMode, type MapBundle } from "@conquest/map-engine";

export interface EventLogProps {
  mapBundle?: MapBundle;
  events: GameEvent[];
  chatOpen: boolean;
  players: Player[];
  onToggleChat: () => void;
  onSendChat: (text: string) => void;
  layoutMode?: LayoutMode;
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

/**
 * Separates the first real occurrence of a sender name from an event message.
 * Event copy has prefixes (icons, battle locations, etc.), so sender text is
 * not reliably at offset zero.
 */
export function splitEventSender(text: string, senderName?: string) {
  if (!senderName) return { before: text, sender: "", after: "" };
  const senderAt = text.indexOf(senderName);
  if (senderAt < 0) return { before: text, sender: "", after: "" };
  return {
    before: text.slice(0, senderAt),
    sender: senderName,
    after: text.slice(senderAt + senderName.length),
  };
}



/**
 * Formats a GameEvent for military chronicles (preserves exact test compatibility).
 */
export function formatEvent(
  e: GameEvent,
  players: Player[],
  historicalPlayerNames: ReadonlyMap<string, string> = new Map(),
  mapBundle: MapBundle = getDefaultMap()
): { text: string; color: string } {
  const getPlayerName = (id: string) =>
    players.find((p) => p.id === id)?.name ?? historicalPlayerNames.get(id) ?? id;
  const getTerritoryName = (id: string) => {
    const norm = id.toLowerCase().replace(/[_\s-]+/g, "");
    const found =
      mapBundle.definition.territories.find(
        (t) =>
          t.id === id ||
          t.id.toLowerCase() === id.toLowerCase() ||
          t.name.toLowerCase().replace(/[_\s-]+/g, "") === norm
      );
    return found?.name ?? id;
  };

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
        text: `⚔ WAR FOR ${mapBundle.definition.name.toUpperCase()} HAS BEGUN ── Turn 1 ⚔`,
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
    case "conquest_move_completed": {
      const player = getPlayerName(e.playerId);
      const source = getTerritoryName(e.sourceTerritoryId);
      const target = getTerritoryName(e.targetTerritoryId);
      return { text: `↗ ${player} moved ${e.units} troops from ${source} to ${target}.`, color: "#a78bfa" };
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

function getHistoricalPlayerNames(events: GameEvent[], players: Player[]): Map<string, string> {
  // Snapshots omit departed players, while the chronicle retains their events.
  // Player joins are therefore the durable name record for those entries.
  const names = new Map<string, string>();
  for (const event of events) {
    if (event.type === "player_joined") names.set(event.player.id, event.player.name);
  }
  // A current snapshot is authoritative if a player rejoined with a new name.
  for (const player of players) names.set(player.id, player.name);
  return names;
}

export function EventLog({
  mapBundle = getDefaultMap(),
  events,
  chatOpen,
  players,
  onToggleChat,
  onSendChat,
  layoutMode,
}: EventLogProps) {
  const [activeTab, setActiveTab] = useState<EventTab>("All");
  const historicalPlayerNames = getHistoricalPlayerNames(events, players);

  const formattedItems: FormattedEventItem[] =
    events.length > 0
      ? events.map((e) => {
          const { text, color } = formatEvent(e, players, historicalPlayerNames, mapBundle);
          const category = getEventCategory(e);
          let senderName: string | undefined;
          let senderColor: string | undefined;

          if ("playerId" in e && typeof e.playerId === "string") {
            const p = players.find((p) => p.id === e.playerId);
            if (p) {
              senderName = p.name;
              senderColor = p.colorHex;
            } else {
              senderName = historicalPlayerNames.get(e.playerId);
            }
          } else if ("attackerId" in e && typeof e.attackerId === "string") {
            const p = players.find((p) => p.id === e.attackerId);
            if (p) {
              senderName = p.name;
              senderColor = p.colorHex;
            } else {
              senderName = historicalPlayerNames.get(e.attackerId);
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
      : [];

  const filteredItems =
    activeTab === "All"
      ? formattedItems
      : formattedItems.filter((item) => item.category === activeTab);

  // An empty chronicle is intentionally short so the tactical map keeps the spare rows.
  const baseLogHeight = layoutMode === "compact" ? 4 : layoutMode === "standard" ? 5 : 6;
  // The main tactical area owns all spare terminal rows. Chat borrows a row
  // from the existing chronicle content instead of growing the outer panel and
  // squeezing the map underneath it.
  const logHeight = baseLogHeight;
  const sliceCount = layoutMode === "compact" ? 1 : layoutMode === "standard" ? 2 : 3;
  const displayedItems = filteredItems.slice(-sliceCount);

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
      style={{ width: "100%", height: logHeight }}
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
          {displayedItems.map((item, idx) => {
            const sender = splitEventSender(item.text, item.senderName);
            return (
              <box key={idx} flexDirection="row" gap={1}>
                <text fg="#64748b">[{item.timestamp}]</text>
                <text fg={item.color}>
                  {sender.sender && item.senderColor ? (
                    <>
                      <span>{sender.before}</span>
                      <span fg={item.senderColor}><b>{sender.sender}</b></span>
                      <span fg="#e2e8f0">{sender.after}</span>
                    </>
                  ) : (
                    <span>{item.text}</span>
                  )}
                </text>
              </box>
            );
          })}
          {events.length === 0 ? (
            <text fg="#64748b">
              <i>No events yet.</i>
            </text>
          ) : displayedItems.length === 0 ? (
            <text fg="#64748b">
              <i>No entries in {activeTab} chronicle</i>
            </text>
          ) : null}
        </box>

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
          backgroundColor="#0c2b3d"
          paddingLeft={1}
          paddingRight={1}
          alignItems="center"
          flexDirection="row"
          style={{ height: 1, flexShrink: 0 }}
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
