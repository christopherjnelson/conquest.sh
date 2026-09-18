import React from "react";
import type { GamePhase, Player, TerritoryState } from "@conquest/protocol";
import { MAP_SECTOR_07 } from "@conquest/map-engine";

export interface MapCanvasProps {
  territories: Record<string, TerritoryState>;
  players: Player[];
  myPlayerId: string | null;
  phase: GamePhase;
  selectedTerritoryId: string | null;
  targetTerritoryId: string | null;
  onSelectTerritory: (territoryId: string) => void;
  onSelectTarget: (territoryId: string) => void;
  onDeselect: () => void;
}

export function MapCanvas({
  territories,
  players,
  myPlayerId,
  phase,
  selectedTerritoryId,
  targetTerritoryId,
  onSelectTerritory,
  onSelectTarget,
  onDeselect,
}: MapCanvasProps) {
  const selectedTerritory = selectedTerritoryId ? territories[selectedTerritoryId] : null;

  const handleTerritoryClick = (territoryId: string) => {
    if (!selectedTerritoryId) {
      onSelectTerritory(territoryId);
      return;
    }

    if (selectedTerritoryId === territoryId) {
      onDeselect();
      return;
    }

    // A territory is already selected
    const isNeighbor = selectedTerritory?.neighbors.includes(territoryId);
    if (isNeighbor) {
      if (targetTerritoryId === territoryId) {
        // Deselect target
        onSelectTarget("");
      } else {
        onSelectTarget(territoryId);
      }
    } else {
      // Select the clicked territory instead
      onSelectTerritory(territoryId);
    }
  };

  const sectorColors: Record<string, string> = {
    wan: "#00d2ff",
    dmz: "#ffaa00",
    core: "#ff3399",
  };

  return (
    <box
      title="TACTICAL NETWORK MAP: SECTOR 07"
      titleColor="#00d2ff"
      border
      borderStyle="single"
      borderColor="#334155"
      style={{ position: "relative", width: 58, height: 18 }}
    >
      {/* Sector Zone Markers */}
      <text style={{ position: "absolute", left: 2, top: 0 }} fg="#00d2ff">
        ◆ WAN SECTOR (+2)
      </text>
      <text style={{ position: "absolute", left: 38, top: 0 }} fg="#ffaa00">
        ◆ DMZ SECTOR (+2)
      </text>
      <text style={{ position: "absolute", left: 10, top: 16 }} fg="#ff3399">
        ◆ CORE SECTOR (+3)
      </text>

      {/* Network Connectors (ASCII / Unicode Adjacency Lines) */}
      {/* A1 <-> B1 horizontal */}
      <text style={{ position: "absolute", left: 30, top: 2 }} fg="#475569">
        ──══──
      </text>

      {/* A1 <-> A2 diagonal */}
      <text style={{ position: "absolute", left: 12, top: 5 }} fg="#475569">
        ╱
      </text>

      {/* A1 <-> A3 diagonal */}
      <text style={{ position: "absolute", left: 21, top: 5 }} fg="#475569">
        ╲
      </text>

      {/* A2 <-> A3 horizontal */}
      <text style={{ position: "absolute", left: 17, top: 7 }} fg="#475569">
        ─────
      </text>

      {/* A2 <-> C1 diagonal */}
      <text style={{ position: "absolute", left: 7, top: 10 }} fg="#475569">
        ╲
      </text>
      <text style={{ position: "absolute", left: 8, top: 11 }} fg="#475569">
        ╲
      </text>

      {/* A3 <-> C1 diagonal */}
      <text style={{ position: "absolute", left: 18, top: 10 }} fg="#475569">
        ╱
      </text>
      <text style={{ position: "absolute", left: 17, top: 11 }} fg="#475569">
        ╱
      </text>

      {/* A3 <-> B2 horizontal */}
      <text style={{ position: "absolute", left: 36, top: 7 }} fg="#475569">
        ──
      </text>

      {/* B1 <-> B2 vertical */}
      <text style={{ position: "absolute", left: 44, top: 5 }} fg="#475569">
        │
      </text>
      <text style={{ position: "absolute", left: 44, top: 6 }} fg="#475569">
        │
      </text>

      {/* B1 <-> C2 diagonal */}
      <text style={{ position: "absolute", left: 36, top: 5 }} fg="#475569">
        ╱
      </text>

      {/* B2 <-> C2 diagonal */}
      <text style={{ position: "absolute", left: 35, top: 11 }} fg="#475569">
        ╱
      </text>

      {/* C1 <-> C2 horizontal */}
      <text style={{ position: "absolute", left: 24, top: 13 }} fg="#475569">
        ══
      </text>

      {/* C2 <-> C3 horizontal */}
      <text style={{ position: "absolute", left: 40, top: 13 }} fg="#475569">
        ══
      </text>

      {/* Territory Nodes */}
      {MAP_SECTOR_07.territories.map((def) => {
        const tState = territories[def.id];
        const units = tState?.units ?? 3;
        const ownerId = tState?.ownerId;
        const owner = players.find((p) => p.id === ownerId);
        const ownerName = owner?.name ?? "Neutral";
        const ownerColor = owner?.colorHex ?? "#94a3b8";
        const sectorColor = sectorColors[def.sectorId] ?? "#00d2ff";

        const isSelected = selectedTerritoryId === def.id;
        const isTarget = targetTerritoryId === def.id;
        const isNeighbor = Boolean(selectedTerritory?.neighbors.includes(def.id));
        const isEnemy = Boolean(ownerId && ownerId !== myPlayerId);
        const isFriendly = Boolean(ownerId && ownerId === myPlayerId);

        let borderStyle: "single" | "double" | "rounded" | "heavy" = "single";
        let borderColor = sectorColor;
        let backgroundColor = "#0b1329";

        if (isSelected) {
          borderStyle = "heavy";
          borderColor = "#ffffff";
          backgroundColor = "#1e293b";
        } else if (isTarget) {
          borderStyle = "rounded";
          borderColor = isEnemy ? "#ff4444" : "#00ff66";
          backgroundColor = isEnemy ? "#2e1018" : "#0d2b1a";
        } else if (isNeighbor) {
          if (phase === "attack" && isEnemy) {
            borderStyle = "single";
            borderColor = "#ff6666";
          } else if (phase === "fortify" && isFriendly) {
            borderStyle = "single";
            borderColor = "#66ff66";
          }
        }

        const titleText = `${def.id}: ${def.name}`;

        return (
          <box
            key={def.id}
            title={titleText}
            titleColor={isSelected ? "#ffffff" : isTarget ? (isEnemy ? "#ff4444" : "#00ff66") : sectorColor}
            titleAlignment="center"
            border
            borderStyle={borderStyle}
            borderColor={borderColor}
            backgroundColor={backgroundColor}
            onMouseDown={() => handleTerritoryClick(def.id)}
            style={{
              position: "absolute",
              left: def.position.x,
              top: def.position.y,
              width: 14,
              height: 4,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <text fg={ownerColor}>
              [ <b>{ownerName.slice(0, 8)}</b> ]
            </text>
            <text fg="#ffffff">
              Units: <b>{units}</b>
            </text>
          </box>
        );
      })}
    </box>
  );
}
