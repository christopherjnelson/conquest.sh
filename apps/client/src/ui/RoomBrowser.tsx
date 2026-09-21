import React, { useEffect, useState, useCallback } from "react";
import { useKeyboard } from "@opentui/react";
import type { RoomSummary } from "@conquest/protocol";
import type { GameClient } from "../network/client.js";

export interface RoomBrowserProps {
  client: GameClient;
  onJoinRoom: (roomCode: string) => void;
  onBack: () => void;
  terminalDimensions?: { columns: number; rows: number };
}

export function RoomBrowser({ client, onJoinRoom, onBack }: RoomBrowserProps) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const fetchRooms = useCallback(async () => {
    try {
      setError(null);
      const data = await client.fetchRooms();
      setRooms(data);
    } catch (err: any) {
      setError(err?.message ?? "Failed to fetch public rooms");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 4000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  // Adjust selectedIndex if rooms change
  useEffect(() => {
    if (rooms.length > 0 && selectedIndex >= rooms.length) {
      setSelectedIndex(rooms.length - 1);
    }
  }, [rooms.length, selectedIndex]);

  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "b" || key.name === "B") {
      onBack();
      return;
    }
    if (key.name === "r" || key.name === "R") {
      setLoading(true);
      fetchRooms();
      return;
    }
    if (rooms.length > 0) {
      if (key.name === "up" || key.name === "k") {
        setSelectedIndex((prev) => (prev - 1 + rooms.length) % rooms.length);
        return;
      }
      if (key.name === "down" || key.name === "j") {
        setSelectedIndex((prev) => (prev + 1) % rooms.length);
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        const selected = rooms[selectedIndex];
        if (selected && selected.playersCount < selected.maxPlayers && selected.phase === "lobby") {
          onJoinRoom(selected.roomCode);
        }
        return;
      }
    }
  });

  const selectedRoom = rooms[selectedIndex];
  const canJoinSelected = Boolean(
    selectedRoom &&
      selectedRoom.playersCount < selectedRoom.maxPlayers &&
      selectedRoom.phase === "lobby"
  );

  return (
    <box
      flexDirection="column"
      backgroundColor="#080f1a"
      style={{ width: "100%", height: "100%" }}
      padding={1}
      justifyContent="space-between"
    >
      {/* Title Bar */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        border
        borderStyle="single"
        borderColor="#00d2ff"
        backgroundColor="#0c1929"
        paddingLeft={2}
        paddingRight={2}
      >
        <text fg="#00d2ff">
          <b>! PUBLIC GAMES BROWSER</b>
        </text>
        <text fg="#64748b">
          Server: <span fg="#38bdf8">{(client.wsUrl || "").replace(/^wss?:\/\//, "")}</span>
        </text>
      </box>

      {/* Main Table Container */}
      <box
        flexDirection="column"
        border
        borderStyle="single"
        borderColor="#1e293b"
        backgroundColor="#091220"
        flexGrow={1}
        marginTop={1}
        marginBottom={1}
        padding={1}
      >
        {/* Table Header */}
        <box
          flexDirection="row"
          justifyContent="space-between"
          paddingBottom={1}
          border
          borderStyle="single"
          borderColor="#334155"
        >
          <text fg="#64748b" style={{ width: 8 }}>
            <b>CODE</b>
          </text>
          <text fg="#64748b" style={{ width: 28 }}>
            <b>ROOM NAME</b>
          </text>
          <text fg="#64748b" style={{ width: 14 }}>
            <b>PLAYERS</b>
          </text>
          <text fg="#64748b" style={{ width: 16 }}>
            <b>MAP</b>
          </text>
          <text fg="#64748b" style={{ width: 16 }}>
            <b>STATUS</b>
          </text>
        </box>

        {/* Room Rows or Empty / Loading State */}
        {loading && rooms.length === 0 ? (
          <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
            <text fg="#38bdf8">
              <i>Scanning realms for active public battles...</i>
            </text>
          </box>
        ) : error ? (
          <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
            <text fg="#ef4444">
              <b>Error: {error}</b>
            </text>
            <text fg="#64748b" marginTop={1}>
              Press [R] to retry connection.
            </text>
          </box>
        ) : rooms.length === 0 ? (
          <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} gap={1}>
            <text fg="#94a3b8">
              <b>No public rooms found.</b>
            </text>
            <text fg="#64748b">
              Create a game to open a new public lobby.
            </text>
          </box>
        ) : (
          <box flexDirection="column" flexGrow={1} marginTop={1} gap={0}>
            {rooms.map((room, idx) => {
              const isSelected = idx === selectedIndex;
              const isFull = room.playersCount >= room.maxPlayers;
              const isInProgress = room.phase !== "lobby";

              let statusText = "Waiting";
              let statusColor = "#00ff66";
              if (room.phase === "game_over") {
                statusText = "Finished";
                statusColor = "#a78bfa";
              } else if (isFull) {
                statusText = "Full";
                statusColor = "#f59e0b";
              } else if (isInProgress) {
                statusText = `Turn ${room.turnNumber}`;
                statusColor = "#38bdf8";
              }

              const rowBg = isSelected ? "#0c2b3d" : idx % 2 === 0 ? "#080f1a" : "#0d1726";
              const rowBorder = isSelected ? "#00d2ff" : "#1e293b";

              return (
                <box
                  key={room.roomCode}
                  flexDirection="row"
                  justifyContent="space-between"
                  alignItems="center"
                  backgroundColor={rowBg}
                  border
                  borderStyle="single"
                  borderColor={rowBorder}
                  paddingLeft={1}
                  paddingRight={1}
                  onMouseDown={() => {
                    setSelectedIndex(idx);
                    if (!isFull && !isInProgress) {
                      onJoinRoom(room.roomCode);
                    }
                  }}
                >
                  <text fg={isSelected ? "#00ffff" : "#38bdf8"} style={{ width: 8 }}>
                    <b>{room.roomCode}</b>
                  </text>
                  <text fg={isSelected ? "#ffffff" : "#e2e8f0"} style={{ width: 28 }}>
                    {room.displayName}
                  </text>
                  <text fg={isFull ? "#f59e0b" : "#94a3b8"} style={{ width: 14 }}>
                    {room.playersCount} / {room.maxPlayers}
                  </text>
                  <text fg="#94a3b8" style={{ width: 16 }}>
                    {room.mapName}
                  </text>
                  <text fg={statusColor} style={{ width: 16 }}>
                    ● <b>{statusText}</b>
                  </text>
                </box>
              );
            })}
          </box>
        )}
      </box>

      {/* Action Buttons & Key Legend */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        border
        borderStyle="single"
        borderColor="#1e293b"
        backgroundColor="#0b1320"
        paddingLeft={2}
        paddingRight={2}
      >
        <box flexDirection="row" gap={2}>
          <box
            border
            borderStyle="single"
            borderColor={canJoinSelected ? "#00ff66" : "#334155"}
            backgroundColor={canJoinSelected ? "#052e16" : "#1e293b"}
            paddingLeft={2}
            paddingRight={2}
            onMouseDown={() => {
              if (canJoinSelected && selectedRoom) {
                onJoinRoom(selectedRoom.roomCode);
              }
            }}
          >
            <text fg={canJoinSelected ? "#00ff66" : "#64748b"}>
              <b>[ Enter: Join Room ]</b>
            </text>
          </box>

          <box
            border
            borderStyle="single"
            borderColor="#38bdf8"
            backgroundColor="#0c2b3d"
            paddingLeft={2}
            paddingRight={2}
            onMouseDown={() => {
              setLoading(true);
              fetchRooms();
            }}
          >
            <text fg="#38bdf8">
              <b>[ R: Refresh ]</b>
            </text>
          </box>

          <box
            border
            borderStyle="single"
            borderColor="#64748b"
            backgroundColor="#1e293b"
            paddingLeft={2}
            paddingRight={2}
            onMouseDown={onBack}
          >
            <text fg="#cbd5e1">
              <b>[ Esc: Back ]</b>
            </text>
          </box>
        </box>

        <text fg="#64748b">
          Auto-refreshing every 4s  │  [↑/↓] Select Row
        </text>
      </box>
    </box>
  );
}
