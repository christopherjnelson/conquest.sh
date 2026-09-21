import React, { useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { ConnectionStatus, SessionData } from "../network/client.js";

export interface HomeScreenProps {
  serverName?: string | null;
  serverHost: string;
  connectionStatus: ConnectionStatus;
  playerName: string;
  cachedSession?: SessionData | null;
  errorMessage?: string | null;
  onBrowseGames: () => void;
  onCreateGame: () => void;
  onJoinByCode: () => void;
  onResumeGame?: (roomCode: string) => void;
  onServerInfo: () => void;
  onQuit: () => void;
  terminalDimensions?: { columns: number; rows: number };
}

interface MenuItem {
  id: string;
  label: string;
  description: string;
  shortcut: string;
  action: () => void;
}

export function HomeScreen({
  serverName,
  serverHost,
  connectionStatus,
  playerName,
  cachedSession,
  errorMessage,
  onBrowseGames,
  onCreateGame,
  onJoinByCode,
  onResumeGame,
  onServerInfo,
  onQuit,
}: HomeScreenProps) {
  const menuItems: MenuItem[] = [];

  // Resume item appears first if active cached session exists
  if (cachedSession?.roomCode && onResumeGame) {
    const roomCode = cachedSession.roomCode;
    menuItems.push({
      id: "resume",
      label: `RESUME [${roomCode}]`,
      description: `Resume active battle in room ${roomCode}`,
      shortcut: "R",
      action: () => onResumeGame(roomCode),
    });
  }

  menuItems.push(
    {
      id: "browse",
      label: "BROWSE GAMES",
      description: "View and join active public games on this server",
      shortcut: "1",
      action: onBrowseGames,
    },
    {
      id: "create",
      label: "CREATE GAME",
      description: "Host a custom public or unlisted battle (2-6 players)",
      shortcut: "2",
      action: onCreateGame,
    },
    {
      id: "join",
      label: "JOIN BY CODE",
      description: "Enter an explicit 4-character room code to join",
      shortcut: "3",
      action: onJoinByCode,
    },
    {
      id: "server",
      label: "SERVER INFO",
      description: "Inspect server topology, active realms, and status",
      shortcut: "4",
      action: onServerInfo,
    },
    {
      id: "quit",
      label: "QUIT",
      description: "Exit conquest.sh",
      shortcut: "Q",
      action: onQuit,
    }
  );

  const [selectedIndex, setSelectedIndex] = useState(0);

  useKeyboard((key) => {
    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
      return;
    }
    if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) => (prev + 1) % menuItems.length);
      return;
    }
    if (key.name === "return" || key.name === "enter" || key.name === "space") {
      menuItems[selectedIndex]?.action();
      return;
    }
    if (key.name === "q" || key.name === "Q") {
      onQuit();
      return;
    }
    if (key.name === "escape") {
      onQuit();
      return;
    }
    if (cachedSession?.roomCode && (key.name === "r" || key.name === "R")) {
      onResumeGame?.(cachedSession.roomCode);
      return;
    }

    // Number shortcuts
    const num = parseInt(key.name, 10);
    if (!isNaN(num)) {
      const match = menuItems.find((item) => item.shortcut === String(num));
      if (match) {
        match.action();
      }
    }
  });

  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting" || connectionStatus === "reconnecting";

  return (
    <box
      flexDirection="column"
      backgroundColor="#080f1a"
      style={{ width: "100%", height: "100%" }}
      padding={1}
    >
      {/* Top Header Bar */}
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
        style={{ height: 3 }}
      >
        <box flexDirection="row" alignItems="center" gap={2}>
          <text fg="#00ffff">
            <b>! CONQUEST.SH</b>
          </text>
          <text fg="#334155">│</text>
          <text fg="#22d3ee">
            <b>CONQUER • NEGOTIATE • SURVIVE</b>
          </text>
        </box>

        <box flexDirection="row" gap={2} alignItems="center">
          <text fg="#94a3b8">
            Commander: <span fg="#00ff66"><b>{playerName}</b></span>
          </text>
          <text fg="#334155">│</text>
          <text fg="#94a3b8">
            Server: <span fg="#38bdf8">{serverHost}</span>
          </text>
        </box>
      </box>

      {/* Error Message Toast if present */}
      {errorMessage && (
        <box
          flexDirection="row"
          justifyContent="center"
          alignItems="center"
          border
          borderStyle="single"
          borderColor="#ef4444"
          backgroundColor="#2a0d12"
          height={3}
          flexShrink={0}
          marginTop={1}
        >
          <text fg="#ef4444">
            <b>⚠️  {errorMessage}</b>
          </text>
        </box>
      )}

      {/* Central Menu Area */}
      <box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        flexGrow={1}
        gap={1}
        marginTop={1}
        marginBottom={1}
      >
        <box height={1} alignItems="center" justifyContent="center" marginBottom={1}>
          <text fg="#64748b">
            ─── SELECT OPERATION ───
          </text>
        </box>

        {menuItems.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          const isResume = item.id === "resume";

          const borderColor = isSelected
            ? isResume
              ? "#00ff66"
              : "#00d2ff"
            : isResume
            ? "#166534"
            : "#1e293b";

          const bgColor = isSelected
            ? isResume
              ? "#052e16"
              : "#0c2b3d"
            : "#0b1524";

          const labelColor = isSelected
            ? isResume
              ? "#00ff66"
              : "#ffffff"
            : isResume
            ? "#4ade80"
            : "#cbd5e1";

          return (
            <box
              key={item.id}
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              border
              borderStyle="single"
              borderColor={borderColor}
              backgroundColor={bgColor}
              width={56}
              height={3}
              flexShrink={0}
              paddingLeft={2}
              paddingRight={2}
              onMouseDown={() => {
                setSelectedIndex(idx);
                item.action();
              }}
            >
              <box flexDirection="row" gap={1} alignItems="center">
                <text fg={isSelected ? (isResume ? "#00ff66" : "#00d2ff") : "#475569"}>
                  {isSelected ? "▶" : " "}
                </text>
                <text fg={labelColor}>
                  <b>[ {item.label} ]</b>
                </text>
              </box>
              <text fg="#64748b">
                <span fg={isSelected ? "#00d2ff" : "#475569"}>({item.shortcut})</span>
              </text>
            </box>
          );
        })}

        {/* Selected Item Description */}
        <box marginTop={1} height={1} flexShrink={0}>
          <text fg="#94a3b8">
            <i>{menuItems[selectedIndex]?.description ?? ""}</i>
          </text>
        </box>
      </box>

      {/* Footer Status Bar */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        border
        borderStyle="single"
        borderColor="#1e293b"
        backgroundColor="#0b1320"
        height={3}
        flexShrink={0}
        paddingLeft={2}
        paddingRight={2}
      >
        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={isConnected ? "#00ff66" : isConnecting ? "#f59e0b" : "#ef4444"}>
            ●
          </text>
          <text fg="#e2e8f0">
            <b>{serverName ?? serverHost}</b>
          </text>
          <text fg="#64748b">
            ({connectionStatus})
          </text>
        </box>

        <box flexDirection="row" gap={2}>
          <text fg="#64748b">
            [↑/↓] Navigate  │  [Enter] Select  │  [Q] Quit
          </text>
        </box>
      </box>
    </box>
  );
}
