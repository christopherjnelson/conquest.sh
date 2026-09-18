import React from "react";
import type { LayoutMode } from "@conquest/map-engine";

export interface FooterProps {
  toastMessage?: string | null;
  toastType?: "info" | "success" | "error";
  activeTab?: number;
  onSelectTab?: (tab: number) => void;
  layoutMode?: LayoutMode;
}

export function Footer({
  toastMessage,
  toastType = "info",
  activeTab = 1,
  onSelectTab,
  layoutMode,
}: FooterProps) {
  let toastColor = "#38bdf8";
  if (toastType === "error") toastColor = "#ff4444";
  if (toastType === "success") toastColor = "#00ff66";
  const isCompact = layoutMode === "compact";

  const pills = [
    { id: 1, label: "Map" },
    { id: 2, label: "Cards" },
    { id: 3, label: "Diplomacy" },
    { id: 4, label: "Chat" },
    { id: 5, label: "Help" },
  ];

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      style={{ width: "100%", height: isCompact ? 1 : 3 }}
      paddingLeft={1}
      paddingRight={1}
      marginTop={0}
    >
      {/* Left Pills matching ref.png */}
      <box flexDirection="row" gap={1} alignItems="center">
        {pills.map((pill) => {
          const isActive = pill.id === activeTab;
          if (isCompact) {
            return (
              <text
                key={pill.id}
                onMouseDown={() => onSelectTab?.(pill.id)}
                fg={isActive ? "#00ff66" : "#64748b"}
              >
                <b>[{pill.id} {pill.label}]</b>
              </text>
            );
          }

          if (isActive) {
            return (
              <box
                key={pill.id}
                border
                borderStyle="single"
                borderColor="#00ff66"
                backgroundColor="#064e3b"
                paddingLeft={1}
                paddingRight={1}
                onMouseDown={() => onSelectTab?.(pill.id)}
              >
                <text fg="#00ff66">
                  <b>{pill.id}   {pill.label}</b>
                </text>
              </box>
            );
          }

          return (
            <box
              key={pill.id}
              border
              borderStyle="single"
              borderColor="#334155"
              backgroundColor="#0b1329"
              paddingLeft={1}
              paddingRight={1}
              onMouseDown={() => onSelectTab?.(pill.id)}
            >
              <text fg="#94a3b8">
                <b>{pill.id}</b>   {pill.label}
              </text>
            </box>
          );
        })}
      </box>

      {/* Right Side Slogan & Game Identifier */}
      <box flexDirection="row" alignItems="center" gap={1}>
        {toastMessage ? (
          <text fg={toastColor}>
            <b>{toastMessage}</b>
          </text>
        ) : (
          <text>
            <span fg="#64748b">{isCompact ? "" : "Play fair. Play bold.  │  "}</span>
            <span fg="#00d2ff"><b>CONQUEST.SH</b></span>
          </text>
        )}
      </box>
    </box>
  );
}
