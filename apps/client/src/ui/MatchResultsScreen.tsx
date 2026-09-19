import React, { useState, useMemo } from "react";
import { useKeyboard } from "@opentui/react";
import type { GameState, Player, PlayerMatchResult } from "@conquest/protocol";
import { getLayoutMode, type LayoutMode } from "@conquest/map-engine";

export interface MatchResultsScreenProps {
  state: GameState;
  myPlayerId: string | null;
  onRematch?: (ready: boolean) => void;
  onReturnHome?: () => void;
  onQuit?: () => void;
  onSendChat?: (text: string) => void;
  terminalDimensions?: { columns: number; rows: number };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function MatchResultsScreen({
  state,
  myPlayerId,
  onRematch,
  onReturnHome,
  onQuit,
  onSendChat,
  terminalDimensions,
}: MatchResultsScreenProps) {
  const cols = terminalDimensions?.columns ?? 120;
  const rows = terminalDimensions?.rows ?? 36;
  const isCompact = cols < 100 || rows < 28;

  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");

  const winnerId = state.winnerId;
  const isWinner = Boolean(winnerId && winnerId === myPlayerId);
  const winnerPlayer = state.players.find((p) => p.id === winnerId);
  const winnerName = winnerPlayer?.name ?? state.result?.winnerName ?? "Unknown Commander";

  const myPlayer = state.players.find((p) => p.id === myPlayerId);
  const isMyRematchReady = myPlayer?.rematchReady ?? false;

  const connectedPlayers = state.players.filter((p) => p.connected);
  const readyCount = connectedPlayers.filter((p) => p.rematchReady).length;
  const totalConnected = connectedPlayers.length;

  // Duration
  const durationMs =
    state.result?.durationMs ??
    (state.endedAt && state.startedAt ? Math.max(0, state.endedAt - state.startedAt) : 0);

  // Standings
  const standings: PlayerMatchResult[] = useMemo(() => {
    if (state.result?.players && state.result.players.length > 0) {
      return state.result.players;
    }
    // Fallback if result not pre-computed:
    return state.players.map((p, idx) => {
      const owned = Object.values(state.territories).filter((t) => t.ownerId === p.id);
      const armies = owned.reduce((sum, t) => sum + t.units, 0);
      const isWin = p.id === winnerId;
      return {
        playerId: p.id,
        playerName: p.name,
        placement: isWin ? 1 : idx + 2,
        finalTerritories: owned.length,
        finalArmies: armies,
        eliminated: !p.isAlive || owned.length === 0,
        eliminatedBy: undefined,
      };
    });
  }, [state, winnerId]);

  // Compact mode keeps one line for every commander.  The card chrome takes
  // two rows, so its height grows directly with the number of results instead
  // of clipping the lower placements in larger matches.
  const compactStandingsHeight = standings.length + 2;
  const compactRematchHeight = connectedPlayers.length + 2;

  // Chat messages
  const chatMessages = useMemo(() => {
    return state.history.filter((e) => e.type === "chat_message");
  }, [state.history]);

  // Keyboard navigation
  useKeyboard((key) => {
    if (chatOpen) {
      if (key.name === "escape") {
        setChatOpen(false);
        setChatInput("");
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        if (chatInput.trim()) {
          onSendChat?.(chatInput.trim());
          setChatInput("");
        }
        setChatOpen(false);
        return;
      }
      if (key.name === "backspace") {
        setChatInput((prev) => prev.slice(0, -1));
        return;
      }
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setChatInput((prev) => prev + key.sequence);
        return;
      }
      return;
    }

    if (key.name === "q" || key.name === "Q") {
      onQuit?.();
      return;
    }

    if (key.name === "r" || key.name === "R") {
      onRematch?.(!isMyRematchReady);
      return;
    }

    if (key.name === "h" || key.name === "H") {
      onReturnHome?.();
      return;
    }

    if (key.name === "c" || key.name === "C") {
      setChatOpen(true);
      return;
    }
  });

  return (
    <box
      flexDirection="column"
      backgroundColor="#080f1a"
      style={{ width: "100%", height: "100%" }}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={0}
      paddingBottom={0}
      gap={1}
    >
      {/* 1. TOP HEADER BANNER */}
      {isWinner ? (
        <box
          border
          borderStyle="double"
          borderColor="#00ff66"
          backgroundColor="#062e1a"
          flexDirection="column"
          alignItems="center"
          paddingTop={0}
          paddingBottom={0}
          paddingLeft={1}
          paddingRight={1}
          style={{ height: isCompact ? 3 : 4, flexShrink: 0 }}
        >
          <text fg="#00ff66">
            <b>★ ★ ★  VICTORY ACHIEVED ─ TOTAL CONQUEST  ★ ★ ★</b>
          </text>
          {!isCompact && (
            <text fg="#6ee7b7">
              <b>Sovereign {winnerName}, you have brought all realms of the Ironreach under your banner!</b>
            </text>
          )}
        </box>
      ) : (
        <box
          border
          borderStyle="double"
          borderColor="#ef4444"
          backgroundColor="#240c0f"
          flexDirection="column"
          alignItems="center"
          paddingTop={0}
          paddingBottom={0}
          paddingLeft={1}
          paddingRight={1}
          style={{ height: isCompact ? 3 : 4, flexShrink: 0 }}
        >
          <text fg="#ef4444">
            <b>⚔  WAR OVER ─ REALM CONQUERED  ⚔</b>
          </text>
          {!isCompact && (
            <text fg="#fca5a5">
              <b>{winnerName} has achieved total domination over the Ironreach.</b>
            </text>
          )}
        </box>
      )}

      {/* 2. MAIN CONTENT AREA */}
      <box
        flexDirection={isCompact ? "column" : "row"}
        flexGrow={1}
        gap={1}
        style={{ width: "100%" }}
      >
        {/* Left Column: Final Standings & Match Intel */}
        <box
          flexDirection="column"
          style={{ width: isCompact ? "100%" : "58%" }}
          gap={1}
        >
          {/* FINAL STANDINGS CARD */}
          <box
            title="! FINAL STANDINGS"
            titleColor="#00d2ff"
            border
            borderStyle="single"
            borderColor="#00d2ff"
            backgroundColor="#0b1528"
            flexDirection="column"
            paddingLeft={1}
            paddingRight={1}
            style={{ height: isCompact ? compactStandingsHeight : 12, flexShrink: 0 }}
          >
            {/* Table Header */}
            {!isCompact && (
              <box flexDirection="row" justifyContent="space-between" marginBottom={0}>
                <text fg="#64748b">
                  Rank  Commander
                </text>
                <text fg="#64748b">Territories   Armies       Status</text>
              </box>
            )}

            {/* Rows */}
            {standings.map((p) => {
              const isLocal = p.playerId === myPlayerId;
              const isChamp = p.placement === 1;
              const playerObj = state.players.find((pl) => pl.id === p.playerId);
              const colorHex = playerObj?.colorHex ?? "#94a3b8";

              let statusText = "Defeated";
              let statusFg = "#ef4444";
              if (isChamp) {
                statusText = "VICTORIOUS";
                statusFg = "#00ff66";
              } else if (p.eliminatedBy) {
                const eliminator = state.players.find((pl) => pl.id === p.eliminatedBy);
                statusText = `Fell to ${eliminator?.name ?? "Enemy"}`;
                statusFg = "#f87171";
              } else if (!p.eliminated) {
                statusText = "Survivor";
                statusFg = "#38bdf8";
              }

              return (
                <box
                  key={p.playerId}
                  flexDirection="row"
                  justifyContent="space-between"
                  alignItems="center"
                  backgroundColor={isLocal ? (isChamp ? "#064e3b" : "#1e293b") : undefined}
                  paddingLeft={0}
                  paddingRight={0}
                >
                  <text>
                    <span fg={isChamp ? "#facc15" : "#94a3b8"}>
                      <b>#{p.placement}</b>{"   "}
                    </span>
                    <span fg={colorHex}>● </span>
                    <span fg={isChamp ? "#00ff66" : "#e2e8f0"}>
                      <b>{p.playerName.padEnd(12, " ")}</b>
                    </span>
                    {isLocal && <span fg="#00ff66"> (You)</span>}
                  </text>

                  <text>
                    <span fg="#e2e8f0">
                      {isCompact
                        ? `${String(p.finalTerritories).padStart(5, " ")}  ${String(p.finalArmies).padStart(6, " ")}   `
                        : `${String(p.finalTerritories).padStart(8, " ")}     ${String(p.finalArmies).padStart(8, " ")}   `}
                    </span>
                    <span fg={statusFg}>
                      <b>{statusText}</b>
                    </span>
                  </text>
                </box>
              );
            })}
          </box>

          {/* MATCH INTEL CARD */}
          <box
            title="! CAMPAIGN INTEL"
            titleColor="#f59e0b"
            border
            borderStyle="single"
            borderColor="#f59e0b"
            backgroundColor="#0b1528"
            flexDirection="column"
            paddingLeft={1}
            paddingRight={1}
            style={{ height: isCompact ? 3 : 6, flexShrink: 0 }}
          >
            <box flexDirection="row" justifyContent="space-between">
              <text fg="#94a3b8">
                Victory Reason: <span fg="#00ff66"><b>Total Conquest</b></span>
              </text>
              <text fg="#94a3b8">
                Match Number: <span fg="#00d2ff"><b>#{state.matchNumber ?? 1}</b></span>
              </text>
            </box>
            {!isCompact && (
              <box flexDirection="row" justifyContent="space-between">
                <text fg="#94a3b8">
                  Total Turns: <span fg="#f59e0b"><b>{state.turnNumber}</b></span>
                </text>
                <text fg="#94a3b8">
                  Campaign Duration: <span fg="#38bdf8"><b>{formatDuration(durationMs)}</b></span>
                </text>
              </box>
            )}
            {!isCompact && (
              <box flexDirection="row" justifyContent="space-between">
                <text fg="#94a3b8">
                  Battleground: <span fg="#e2e8f0"><b>Ironreach Realm (Sector 07)</b></span>
                </text>
                <text fg="#94a3b8">
                  Room Code: <span fg="#00d2ff"><b>{state.roomCode}</b></span>
                </text>
              </box>
            )}
          </box>
        </box>

        {/* Right Column: Rematch Voting & Post-Match Chat */}
        <box
          flexDirection="column"
          style={{ width: isCompact ? "100%" : "40%", flexShrink: 0 }}
          gap={1}
        >
          {/* REMATCH PANEL */}
          <box
            title={isCompact ? `! REMATCH PROTOCOL ${readyCount}/${totalConnected}` : "! REMATCH PROTOCOL"}
            titleColor="#38bdf8"
            border
            borderStyle="single"
            borderColor="#38bdf8"
            backgroundColor="#0b1528"
            flexDirection="column"
            paddingLeft={1}
            paddingRight={1}
            style={{ height: isCompact ? compactRematchHeight : 9, flexShrink: 0 }}
            gap={0}
          >
            {!isCompact && (
              <text fg="#94a3b8">
                Rematch Readiness: <span fg={readyCount === totalConnected && totalConnected >= 2 ? "#00ff66" : "#f59e0b"}><b>{readyCount}/{totalConnected} Commanders Agreed</b></span>
              </text>
            )}

            <box flexDirection="column" marginTop={isCompact ? 0 : 1} gap={0}>
              {connectedPlayers.map((p) => {
                const isReady = p.rematchReady;
                return (
                  <box key={p.id} flexDirection="row" justifyContent="space-between">
                    <text>
                      <span fg={p.colorHex}>● </span>
                      <span fg="#e2e8f0">{p.name}</span>
                      {p.id === myPlayerId && <span fg="#38bdf8"> (You)</span>}
                    </text>
                    <text fg={isReady ? "#00ff66" : "#64748b"}>
                      <b>{isReady ? "✔ READY" : "· WAITING"}</b>
                    </text>
                  </box>
                );
              })}
            </box>

            {!isCompact && (
              <box marginTop={1}>
                <text fg="#64748b">
                  <i>{readyCount === totalConnected && totalConnected >= 2 ? "Launching rematch with rotated turn order..." : "Waiting for all connected commanders to agree..."}</i>
                </text>
              </box>
            )}
          </box>

          {/* POST-GAME CHAT CARD */}
          <box
            title={isCompact ? "! CHAT [C]" : "! POST-GAME COUNCIL CHAT"}
            titleColor="#e879f9"
            border
            borderStyle="single"
            borderColor="#e879f9"
            backgroundColor="#0b1528"
            flexDirection="column"
            paddingLeft={1}
            paddingRight={1}
            style={{ height: isCompact ? 3 : 9, flexShrink: 0 }}
            gap={0}
          >
            {!chatOpen && (
              <box flexDirection="column" style={{ height: isCompact ? 1 : 5 }} overflow="hidden">
                {chatMessages.length === 0 ? (
                  <text fg="#64748b">
                    <i>No post-game communications yet. Press [C] to send GG!</i>
                  </text>
                ) : (
                  chatMessages.slice(isCompact ? -2 : -4).map((c, i) => (
                    <text key={i}>
                      <span fg="#e879f9"><b>{c.type === "chat_message" ? c.senderName : "Anon"}: </b></span>
                      <span fg="#f1f5f9">{c.type === "chat_message" ? c.text : ""}</span>
                    </text>
                  ))
                )}
              </box>
            )}

            {chatOpen ? (
              isCompact ? (
                <text fg="#00ffff">
                  <b>&gt; </b>
                  <span fg="#ffffff">{chatInput}</span>
                  <span fg="#00ffff">█</span>
                </text>
              ) : (
                <box
                  border
                  borderStyle="single"
                  borderColor="#00ffff"
                  backgroundColor="#0f172a"
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <text fg="#00ffff">
                    <b>&gt; </b>
                    <span fg="#ffffff">{chatInput}</span>
                    <span fg="#00ffff">█</span>
                  </text>
                </box>
              )
            ) : !isCompact && (
              <box marginTop={0}>
                <text fg="#64748b">
                  Press <span fg="#e879f9"><b>[C]</b></span> to chat with commanders.
                </text>
              </box>
            )}
          </box>
        </box>
      </box>

      {/* 3. BOTTOM ACTION BAR */}
      <box
        border
        borderStyle="single"
        borderColor="#334155"
        backgroundColor="#0f172a"
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        paddingLeft={1}
        paddingRight={1}
        style={{ height: 3, flexShrink: 0 }}
      >
        <box flexDirection="row" gap={2}>
          {/* Rematch Button */}
          <box
            border
            borderStyle="single"
            borderColor={isMyRematchReady ? "#00ff66" : "#38bdf8"}
            backgroundColor={isMyRematchReady ? "#064e3b" : "#0c2b3d"}
            paddingLeft={1}
            paddingRight={1}
            onMouseDown={() => onRematch?.(!isMyRematchReady)}
          >
            <text fg={isMyRematchReady ? "#00ff66" : "#38bdf8"}>
              <b>{isMyRematchReady ? "[ R ] CANCEL REMATCH" : "[ R ] REQUEST REMATCH"}</b>
            </text>
          </box>

          {/* Return Home Button */}
          <box
            border
            borderStyle="single"
            borderColor="#f59e0b"
            backgroundColor="#291c06"
            paddingLeft={1}
            paddingRight={1}
            onMouseDown={() => onReturnHome?.()}
          >
            <text fg="#f59e0b">
              <b>[ H ] RETURN HOME</b>
            </text>
          </box>

          {/* Chat Button */}
          <box
            border
            borderStyle="single"
            borderColor="#e879f9"
            backgroundColor="#2b0a3d"
            paddingLeft={1}
            paddingRight={1}
            onMouseDown={() => setChatOpen(true)}
          >
            <text fg="#e879f9">
              <b>[ C ] CHAT</b>
            </text>
          </box>
        </box>

        {/* Quit Button */}
        <box
          border
          borderStyle="single"
          borderColor="#ef4444"
          backgroundColor="#240c0f"
          paddingLeft={1}
          paddingRight={1}
          onMouseDown={() => onQuit?.()}
        >
          <text fg="#ef4444">
            <b>[ Q ] QUIT</b>
          </text>
        </box>
      </box>
    </box>
  );
}
