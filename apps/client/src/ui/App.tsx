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

const TERRITORY_IDS = ["A1", "A2", "A3", "B1", "B2", "C1", "C2", "C3"];

const SPATIAL_NAV: Record<string, { up?: string; down?: string; left?: string; right?: string }> = {
  A1: { left: "A2", down: "A3", right: "B1" },
  A2: { up: "A1", right: "A3", down: "C1" },
  A3: { up: "A1", left: "A2", right: "B2", down: "C1" },
  B1: { left: "A1", down: "B2" },
  B2: { up: "B1", left: "A3", down: "C2" },
  C1: { up: "A2", right: "C2" },
  C2: { up: "A3", left: "C1", right: "C3" },
  C3: { up: "B2", left: "C2" },
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
      if (key.shift) {
        // Cycle backward
        if (!selectedTerritoryId) {
          setSelectedTerritoryId(TERRITORY_IDS[TERRITORY_IDS.length - 1]);
        } else {
          const idx = TERRITORY_IDS.indexOf(selectedTerritoryId);
          const prevIdx = (idx - 1 + TERRITORY_IDS.length) % TERRITORY_IDS.length;
          setSelectedTerritoryId(TERRITORY_IDS[prevIdx]);
        }
      } else {
        // Cycle forward
        if (!selectedTerritoryId) {
          setSelectedTerritoryId(TERRITORY_IDS[0]);
        } else {
          const idx = TERRITORY_IDS.indexOf(selectedTerritoryId);
          const nextIdx = (idx + 1) % TERRITORY_IDS.length;
          setSelectedTerritoryId(TERRITORY_IDS[nextIdx]);
        }
      }
      setTargetTerritoryId(null);
      return;
    }

    // Arrow keys spatial navigation
    if (["up", "down", "left", "right"].includes(key.name)) {
      if (!selectedTerritoryId) {
        setSelectedTerritoryId("A1");
        return;
      }
      const nav = SPATIAL_NAV[selectedTerritoryId];
      if (nav) {
        const nextId = nav[key.name as "up" | "down" | "left" | "right"];
        if (nextId) {
          setSelectedTerritoryId(nextId);
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

      {/* Main Tactical Area */}
      <box flexDirection="row" flexGrow={1} style={{ marginTop: 0, marginBottom: 0 }}>
        <box flexDirection="column" flexGrow={1}>
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
        />
      </box>

      {/* Bottom Footer & Keybindings */}
      <Footer toastMessage={toastMessage} toastType={toastType} />
    </box>
  );
}
