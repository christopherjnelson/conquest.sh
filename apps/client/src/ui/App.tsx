import React, { useEffect, useState, useCallback } from "react";
import { useKeyboard } from "@opentui/react";
import type { GameEvent, GameState } from "@conquest/protocol";
import { GameClient, type ConnectionStatus } from "../network/client.js";
import { Header } from "./Header.js";
import { MapCanvas } from "./MapCanvas.js";
import { Sidebar } from "./Sidebar.js";
import { EventLog } from "./EventLog.js";
import { Footer } from "./Footer.js";

export interface AppProps {
  client: GameClient;
  onExit?: () => void;
}

const SPATIAL_NAV_IRONREACH: Record<
  string,
  { up?: string; down?: string; left?: string; right?: string }
> = {
  frostfell: { right: "highwatch", down: "iron_hollow" },
  highwatch: { left: "frostfell", down: "stoneveil" },
  iron_hollow: { up: "frostfell", right: "stoneveil", down: "red_basin", left: "frostfell" },
  stoneveil: { up: "highwatch", left: "iron_hollow", down: "mossgate" },
  red_basin: { up: "iron_hollow", right: "sunken_pass", down: "ember_coast" },
  mossgate: { up: "stoneveil", left: "sunken_pass", down: "ashmoor" },
  sunken_pass: { up: "iron_hollow", left: "red_basin", right: "mossgate", down: "hollowmere" },
  ember_coast: { up: "red_basin", right: "hollowmere" },
  ashmoor: { up: "mossgate", left: "hollowmere" },
  hollowmere: { up: "sunken_pass", left: "ember_coast", right: "ashmoor" },
};

export function App({ client, onExit }: AppProps) {
  const [state, setState] = useState<GameState | null>(client.state);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(client.myPlayerId);
  const [status, setStatus] = useState<ConnectionStatus>(client.status);
  const [events, setEvents] = useState<GameEvent[]>(client.state?.history ?? []);

  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  const [targetTerritoryId, setTargetTerritoryId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"info" | "success" | "error">("info");

  const showToast = useCallback((msg: string, type: "info" | "success" | "error" = "info") => {
    setToastMessage(msg);
    setToastType(type);
  }, []);

  // Listen to GameClient updates
  useEffect(() => {
    const unsubSnapshot = client.onSnapshot((newState, newPlayerId) => {
      setState(newState);
      setMyPlayerId(newPlayerId);
      setEvents(newState.history ?? []);
    });

    const unsubEvent = client.onEvent((newEvent) => {
      setEvents((prev) => [...prev, newEvent]);
    });

    const unsubStatus = client.onStatusChange((newStatus, error) => {
      setStatus(newStatus);
      if (error) {
        showToast(error, "error");
      }
    });

    const unsubError = client.onError((errMsg) => {
      showToast(errMsg, "error");
    });

    return () => {
      unsubSnapshot();
      unsubEvent();
      unsubStatus();
      unsubError();
    };
  }, [client, showToast]);

  const activePlayer = state ? state.players[state.activePlayerIndex] : undefined;
  const isMyTurn = Boolean(activePlayer && activePlayer.id === myPlayerId);
  const phase = state?.phase ?? "lobby";
  const territoryIds = state?.territories ? Object.keys(state.territories) : [];

  // Action Dispatchers
  const handleDeploy = useCallback(() => {
    if (!state || !selectedTerritoryId) {
      showToast("Select a territory to deploy troops to", "error");
      return;
    }
    const territory = state.territories[selectedTerritoryId];
    if (!territory || territory.ownerId !== myPlayerId) {
      showToast("You can only deploy to territories you control", "error");
      return;
    }
    if (state.pendingReinforcements <= 0) {
      showToast("No reinforcements available", "error");
      return;
    }

    client.deploy(selectedTerritoryId, state.pendingReinforcements);
    showToast(`Deployed ${state.pendingReinforcements} reinforcements to ${selectedTerritoryId}`, "success");
  }, [client, state, selectedTerritoryId, myPlayerId, showToast]);

  const handleAttack = useCallback(() => {
    if (!state || !selectedTerritoryId) {
      showToast("Select a friendly territory to attack from", "error");
      return;
    }
    const source = state.territories[selectedTerritoryId];
    if (!source || source.ownerId !== myPlayerId) {
      showToast("You must control the attacking territory", "error");
      return;
    }
    if (source.units < 2) {
      showToast("Need at least 2 units to attack", "error");
      return;
    }
    if (!targetTerritoryId) {
      showToast("Select an adjacent enemy territory to attack", "info");
      return;
    }
    const target = state.territories[targetTerritoryId];
    if (!target || target.ownerId === myPlayerId) {
      showToast("Cannot attack your own territory", "error");
      return;
    }
    if (!source.neighbors.includes(targetTerritoryId)) {
      showToast(`${target.name} is not adjacent to ${source.name}`, "error");
      return;
    }

    client.attack(selectedTerritoryId, targetTerritoryId);
    showToast(`Attacking ${targetTerritoryId} from ${selectedTerritoryId}...`, "info");
  }, [client, state, selectedTerritoryId, targetTerritoryId, myPlayerId, showToast]);

  const handleFortify = useCallback(() => {
    if (!state || !selectedTerritoryId) {
      showToast("Select a friendly territory to fortify from", "error");
      return;
    }
    const source = state.territories[selectedTerritoryId];
    if (!source || source.ownerId !== myPlayerId) {
      showToast("You must control the source territory", "error");
      return;
    }
    if (source.units < 2) {
      showToast("Must leave at least 1 unit behind", "error");
      return;
    }
    if (!targetTerritoryId) {
      showToast("Select a friendly connected territory to move troops to", "info");
      return;
    }
    const target = state.territories[targetTerritoryId];
    if (!target || target.ownerId !== myPlayerId) {
      showToast("Target territory must also be controlled by you", "error");
      return;
    }

    const unitsToMove = Math.max(1, source.units - 1);
    client.fortify(selectedTerritoryId, targetTerritoryId, unitsToMove);
    showToast(`Fortified ${unitsToMove} units to ${targetTerritoryId}`, "success");
    setSelectedTerritoryId(null);
    setTargetTerritoryId(null);
  }, [client, state, selectedTerritoryId, targetTerritoryId, myPlayerId, showToast]);

  const handleSkipPhase = useCallback(() => {
    client.skipPhase();
    showToast("Skipped phase", "info");
  }, [client, showToast]);

  const handleEndTurn = useCallback(() => {
    client.endTurn();
    showToast("Ended turn", "info");
    setSelectedTerritoryId(null);
    setTargetTerritoryId(null);
  }, [client, showToast]);

  const handleReady = useCallback(() => {
    client.ready(true);
    showToast("Marked ready! Waiting for game start...", "success");
  }, [client, showToast]);

  // Keyboard navigation
  useKeyboard((key) => {
    // When chat input is open, only intercept Escape to close it
    if (chatOpen) {
      if (key.name === "escape") {
        setChatOpen(false);
      }
      return;
    }

    // Global quit
    if (key.name === "q" || key.name === "Q") {
      onExit?.();
      return;
    }

    // Toggle chat
    if (key.name === "c" || key.name === "C") {
      setChatOpen(true);
      return;
    }

    // Deselect / clear
    if (key.name === "escape") {
      if (targetTerritoryId) {
        setTargetTerritoryId(null);
      } else {
        setSelectedTerritoryId(null);
      }
      return;
    }

    // Tab territory cycling
    if (key.name === "tab") {
      if (territoryIds.length === 0) return;
      if (key.shift) {
        // Cycle backward
        if (!selectedTerritoryId) {
          setSelectedTerritoryId(territoryIds[territoryIds.length - 1]);
        } else {
          const idx = territoryIds.indexOf(selectedTerritoryId);
          const prevIdx = (idx - 1 + territoryIds.length) % territoryIds.length;
          setSelectedTerritoryId(territoryIds[prevIdx]);
        }
      } else {
        // Cycle forward
        if (!selectedTerritoryId) {
          setSelectedTerritoryId(territoryIds[0]);
        } else {
          const idx = territoryIds.indexOf(selectedTerritoryId);
          const nextIdx = (idx + 1) % territoryIds.length;
          setSelectedTerritoryId(territoryIds[nextIdx]);
        }
      }
      setTargetTerritoryId(null);
      return;
    }

    // Arrow keys spatial navigation
    if (["up", "down", "left", "right"].includes(key.name)) {
      if (territoryIds.length === 0) return;
      if (!selectedTerritoryId) {
        setSelectedTerritoryId(territoryIds[0]);
        return;
      }
      const dir = key.name as "up" | "down" | "left" | "right";
      const nav = SPATIAL_NAV_IRONREACH[selectedTerritoryId];
      if (nav && nav[dir] && state?.territories[nav[dir]!]) {
        setSelectedTerritoryId(nav[dir]!);
        setTargetTerritoryId(null);
        return;
      }

      // Fallback: geometric spatial calculation or neighbor traversal
      const current = state?.territories[selectedTerritoryId];
      if (current) {
        let bestTarget: string | null = null;
        let bestScore = Infinity;

        for (const tid of territoryIds) {
          if (tid === selectedTerritoryId) continue;
          const target = state?.territories[tid];
          if (!target) continue;

          const dx = target.position.x - current.position.x;
          const dy = target.position.y - current.position.y;

          let matchesDir = false;
          if (dir === "right" && dx > 0 && Math.abs(dx) >= Math.abs(dy) * 0.4) matchesDir = true;
          if (dir === "left" && dx < 0 && Math.abs(dx) >= Math.abs(dy) * 0.4) matchesDir = true;
          if (dir === "down" && dy > 0 && Math.abs(dy) >= Math.abs(dx) * 0.3) matchesDir = true;
          if (dir === "up" && dy < 0 && Math.abs(dy) >= Math.abs(dx) * 0.3) matchesDir = true;

          if (matchesDir) {
            const dist = dx * dx + dy * dy;
            if (dist < bestScore) {
              bestScore = dist;
              bestTarget = tid;
            }
          }
        }

        if (bestTarget) {
          setSelectedTerritoryId(bestTarget);
          setTargetTerritoryId(null);
        } else if (current.neighbors.length > 0) {
          setSelectedTerritoryId(current.neighbors[0]);
          setTargetTerritoryId(null);
        }
      }
      return;
    }

    // Actions shortcuts
    if (key.name === "d" || key.name === "D") {
      handleDeploy();
      return;
    }

    if (key.name === "a" || key.name === "A") {
      handleAttack();
      return;
    }

    if (key.name === "f" || key.name === "F") {
      handleFortify();
      return;
    }

    if (key.name === "e" || key.name === "E") {
      if (phase === "attack") {
        handleSkipPhase();
      } else {
        handleEndTurn();
      }
      return;
    }

    if (key.name === "r" || key.name === "R") {
      if (phase === "lobby") {
        handleReady();
      }
      return;
    }
  });

  return (
    <box flexDirection="column" width="100%" height="100%" padding={0}>
      {/* Top Header */}
      <Header
        roomCode={client.roomCode}
        turnNumber={state?.turnNumber ?? 0}
        activePlayer={activePlayer}
        phase={phase}
        pendingReinforcements={state?.pendingReinforcements ?? 0}
        connectionStatus={status}
        isMyTurn={isMyTurn}
      />

      {/* Main Tactical Area: MapCanvas dominant central layout */}
      <box flexDirection="row" flexGrow={1} style={{ marginTop: 0, marginBottom: 0 }}>
        <box flexDirection="column" flexGrow={1} style={{ marginRight: 1 }}>
          <MapCanvas
            territories={state?.territories ?? {}}
            players={state?.players ?? []}
            myPlayerId={myPlayerId}
            phase={phase}
            selectedTerritoryId={selectedTerritoryId}
            targetTerritoryId={targetTerritoryId}
            onSelectTerritory={(id) => {
              setSelectedTerritoryId(id);
              setTargetTerritoryId(null);
            }}
            onSelectTarget={(id) => setTargetTerritoryId(id)}
            onDeselect={() => {
              setSelectedTerritoryId(null);
              setTargetTerritoryId(null);
            }}
          />

          <EventLog
            events={events}
            chatOpen={chatOpen}
            players={state?.players ?? []}
            onToggleChat={() => setChatOpen(!chatOpen)}
            onSendChat={(text) => client.sendChat(text)}
          />
        </box>

        {/* Right Intel & Actions Sidebar */}
        <Sidebar
          state={state}
          myPlayerId={myPlayerId}
          selectedTerritoryId={selectedTerritoryId}
          targetTerritoryId={targetTerritoryId}
          onDeploy={handleDeploy}
          onAttack={handleAttack}
          onFortify={handleFortify}
          onSkipPhase={handleSkipPhase}
          onEndTurn={handleEndTurn}
          onReady={handleReady}
          onSelectTarget={(id) => setTargetTerritoryId(id)}
        />
      </box>

      {/* Bottom Footer & Keybindings */}
      <Footer toastMessage={toastMessage} toastType={toastType} />
    </box>
  );
}
