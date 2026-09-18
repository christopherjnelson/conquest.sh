import React from "react";
import type { GamePhase, Player, TerritoryState } from "@conquest/protocol";
import { MAP_IRONREACH } from "@conquest/map-engine";

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

  const sectorMap = new Map(MAP_IRONREACH.sectors.map((s) => [s.id, s]));

  return (
    <box
      title="THE IRONREACH ── REALM TERRITORIES"
      titleColor="#00d2ff"
      border
      borderStyle="single"
      borderColor="#334155"
      style={{ position: "relative", width: 68, height: 31 }}
    >
      {/* Regional Domain Banners */}
      <text style={{ position: "absolute", left: 22, top: 0 }} fg="#00d2ff">
        <b>❄ NORTHREACH (+3 Armies)</b>
      </text>
      <text style={{ position: "absolute", left: 22, top: 11 }} fg="#ffaa00">
        <b>⚔ THE MARCHES (+2 Armies)</b>
      </text>
      <text style={{ position: "absolute", left: 22, top: 21 }} fg="#ff3399">
        <b>🌋 EMBERLANDS (+3 Armies)</b>
      </text>

      {/* Frontier Connectors (Mountain Passes & Border Trails) */}
      {/* 1. Frostfell <-> Highwatch (horizontal northern pass) */}
      <text style={{ position: "absolute", left: 22, top: 3 }} fg="#475569">
        ══··══··══··══··══
      </text>

      {/* 2. Frostfell <-> Iron Hollow (diagonal descent) */}
      <text style={{ position: "absolute", left: 20, top: 5 }} fg="#475569">
        ╲╲
      </text>
      <text style={{ position: "absolute", left: 22, top: 6 }} fg="#475569">
        ╲╲
      </text>

      {/* 3. Highwatch <-> Iron Hollow (diagonal descent) */}
      <text style={{ position: "absolute", left: 44, top: 5 }} fg="#475569">
        ╱╱
      </text>
      <text style={{ position: "absolute", left: 43, top: 6 }} fg="#475569">
        ╱╱
      </text>

      {/* 4. Highwatch <-> Stoneveil (vertical eastern cliff pass) */}
      <text style={{ position: "absolute", left: 55, top: 6 }} fg="#475569">
        ││
      </text>

      {/* 5. Iron Hollow <-> Stoneveil (horizontal mid pass) */}
      <text style={{ position: "absolute", left: 43, top: 8 }} fg="#475569">
        ══··
      </text>

      {/* 6. Iron Hollow <-> Red Basin (southwest canyon pass) */}
      <text style={{ position: "absolute", left: 22, top: 10 }} fg="#475569">
        ╱╱
      </text>
      <text style={{ position: "absolute", left: 20, top: 11 }} fg="#475569">
        ╱╱
      </text>

      {/* 7. Stoneveil <-> Red Basin (cross-marches trail) */}
      <text style={{ position: "absolute", left: 43, top: 11 }} fg="#334155">
        ··══··
      </text>

      {/* 8. Stoneveil <-> Mossgate (river gate road) */}
      <text style={{ position: "absolute", left: 55, top: 12 }} fg="#475569">
        ││
      </text>

      {/* 9. Red Basin <-> Sunken Pass (lowland gorge) */}
      <text style={{ position: "absolute", left: 21, top: 16 }} fg="#475569">
        ╲╲
      </text>

      {/* 10. Mossgate <-> Sunken Pass (waterway causeway) */}
      <text style={{ position: "absolute", left: 43, top: 16 }} fg="#475569">
        ╱╱
      </text>

      {/* 11. Mossgate <-> Ashmoor (volcanic border ridge) */}
      <text style={{ position: "absolute", left: 55, top: 18 }} fg="#475569">
        ││
      </text>
      <text style={{ position: "absolute", left: 55, top: 19 }} fg="#475569">
        ··
      </text>
      <text style={{ position: "absolute", left: 55, top: 20 }} fg="#475569">
        ││
      </text>

      {/* 12. Sunken Pass <-> Ember Coast (sulfur descent) */}
      <text style={{ position: "absolute", left: 22, top: 20 }} fg="#475569">
        ╱╱
      </text>
      <text style={{ position: "absolute", left: 20, top: 21 }} fg="#475569">
        ╱╱
      </text>

      {/* 13. Sunken Pass <-> Ashmoor (ashfall passage) */}
      <text style={{ position: "absolute", left: 43, top: 20 }} fg="#475569">
        ╲╲
      </text>
      <text style={{ position: "absolute", left: 44, top: 21 }} fg="#475569">
        ╲╲
      </text>

      {/* 14. Ember Coast <-> Hollowmere (obsidian causeway) */}
      <text style={{ position: "absolute", left: 21, top: 25 }} fg="#475569">
        ══··
      </text>

      {/* 15. Ashmoor <-> Hollowmere (caldera trail) */}
      <text style={{ position: "absolute", left: 43, top: 25 }} fg="#475569">
        ··══
      </text>

      {/* Territorial Realm Boxes */}
      {MAP_IRONREACH.territories.map((def) => {
        const sector = sectorMap.get(def.sectorId);
        const regionName = sector?.name ?? def.sectorId;
        const sectorColor = sector?.colorHex ?? "#00d2ff";

        const tState = territories[def.id];
        const units = tState?.units ?? 2;
        const ownerId = tState?.ownerId;
        const owner = players.find((p) => p.id === ownerId);
        const ownerName = owner?.name ?? "Neutral";
        const ownerColor = owner?.colorHex ?? "#94a3b8";

        const isSelected = selectedTerritoryId === def.id;
        const isTarget = targetTerritoryId === def.id;
        const isNeighbor = Boolean(selectedTerritory?.neighbors.includes(def.id));
        const isEnemy = Boolean(ownerId && ownerId !== myPlayerId);
        const isFriendly = Boolean(ownerId && ownerId === myPlayerId);

        let borderStyle: "single" | "double" | "rounded" | "heavy" = "single";
        let borderColor = sectorColor;
        let backgroundColor = "#0b1329";

        if (isSelected) {
          borderStyle = "double";
          borderColor = "#ffff00"; // High-contrast bright yellow/cyan
          backgroundColor = "#1e293b";
        } else if (isTarget) {
          borderStyle = "double";
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

        const titleText = `⚑ ${def.name.toUpperCase()}`;

        return (
          <box
            key={def.id}
            title={titleText}
            titleColor={
              isSelected
                ? "#ffff00"
                : isTarget
                ? isEnemy
                  ? "#ff4444"
                  : "#00ff66"
                : sectorColor
            }
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
              width: def.render?.width ?? 19,
              height: def.render?.height ?? 5,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            {isSelected ? (
              <text fg="#ffff00">
                <b>► SELECTED ◄</b>
              </text>
            ) : isTarget ? (
              <text fg={isEnemy ? "#ff4444" : "#00ff66"}>
                <b>{isEnemy ? "⚔ TARGET" : "🛡 DEST"}</b>
              </text>
            ) : (
              <text fg={sectorColor}>
                <b>[{regionName}]</b>
              </text>
            )}
            <text fg="#ffffff">
              ⚔ <b>{units} Armies</b>
            </text>
            <text fg={ownerColor}>
              Ruler: <b>{ownerName.slice(0, 9)}</b>
            </text>
          </box>
        );
      })}
    </box>
  );
}
