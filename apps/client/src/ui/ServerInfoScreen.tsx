import React, { useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { ServerInfo } from "@conquest/protocol";
import type { GameClient } from "../network/client.js";

export interface ServerInfoScreenProps {
  client: GameClient;
  onBack: () => void;
  terminalDimensions?: { columns: number; rows: number };
}

export function ServerInfoScreen({ client, onBack }: ServerInfoScreenProps) {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    client
      .fetchServerInfo()
      .then((data) => {
        if (mounted) {
          setInfo(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err?.message ?? "Failed to connect to server API");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [client]);

  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "return" || key.name === "enter" || key.name === "b" || key.name === "B") {
      onBack();
    }
  });

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
          <b>! SERVER TOPOLOGY & STATUS</b>
        </text>
        <text fg="#64748b">
          realm host inspection
        </text>
      </box>

      {/* Main Details */}
      <box
        flexDirection="column"
        border
        borderStyle="single"
        borderColor="#1e293b"
        backgroundColor="#091220"
        flexGrow={1}
        marginTop={1}
        marginBottom={1}
        padding={2}
        alignItems="center"
        justifyContent="center"
        gap={1}
      >
        {loading ? (
          <text fg="#38bdf8">
            <i>Querying server metadata...</i>
          </text>
        ) : error ? (
          <box flexDirection="column" alignItems="center" gap={1}>
            <text fg="#ef4444">
              <b>Connection Error: {error}</b>
            </text>
            <text fg="#64748b">
              Ensure server is running and accessible at {client.httpUrl}
            </text>
          </box>
        ) : info ? (
          <box flexDirection="column" style={{ width: 56 }} gap={1}>
            <box flexDirection="row" justifyContent="space-between" border borderStyle="single" borderColor="#1e293b" padding={1}>
              <text fg="#64748b">Server Name:</text>
              <text fg="#00ff66"><b>{info.serverName}</b></text>
            </box>

            <box flexDirection="row" justifyContent="space-between" border borderStyle="single" borderColor="#1e293b" padding={1}>
              <text fg="#64748b">Endpoint URL:</text>
              <text fg="#38bdf8"><b>{client.wsUrl ?? ""}</b></text>
            </box>

            <box flexDirection="row" justifyContent="space-between" border borderStyle="single" borderColor="#1e293b" padding={1}>
              <text fg="#64748b">Protocol Version:</text>
              <text fg="#ffffff"><b>{info.protocolVersion}</b></text>
            </box>

            <box flexDirection="row" justifyContent="space-between" border borderStyle="single" borderColor="#1e293b" padding={1}>
              <text fg="#64748b">Default Map:</text>
              <text fg="#e2e8f0"><b>{info.defaultMap}</b></text>
            </box>

            <box flexDirection="row" justifyContent="space-between" border borderStyle="single" borderColor="#1e293b" padding={1}>
              <text fg="#64748b">Active Rooms:</text>
              <text fg="#38bdf8"><b>{info.roomsCount}</b></text>
            </box>

            <box flexDirection="row" justifyContent="space-between" border borderStyle="single" borderColor="#1e293b" padding={1}>
              <text fg="#64748b">Connected Players:</text>
              <text fg="#00ff66"><b>{info.playersCount}</b></text>
            </box>

            <box flexDirection="row" justifyContent="space-between" border borderStyle="single" borderColor="#1e293b" padding={1}>
              <text fg="#64748b">Max Players / Room:</text>
              <text fg="#ffffff"><b>{info.maxPlayersPerRoom}</b></text>
            </box>
          </box>
        ) : null}
      </box>

      {/* Action Footer */}
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

        <text fg="#64748b">
          [Esc / Enter] Back to Home
        </text>
      </box>
    </box>
  );
}
