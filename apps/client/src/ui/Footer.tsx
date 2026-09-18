import React from "react";

export interface FooterProps {
  toastMessage?: string | null;
  toastType?: "info" | "success" | "error";
}

export function Footer({ toastMessage, toastType = "info" }: FooterProps) {
  let toastColor = "#38bdf8";
  if (toastType === "error") toastColor = "#ff4444";
  if (toastType === "success") toastColor = "#00ff66";

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      border
      borderStyle="single"
      borderColor="#334155"
      paddingLeft={1}
      paddingRight={1}
      height={3}
    >
      <text>
        <span fg="#00d2ff"><b>[Tab]</b> Select  </span>
        <span fg="#00d2ff"><b>[Arrows]</b> Move  </span>
        <span fg="#00ff66"><b>[D]</b> Deploy  </span>
        <span fg="#ff4444"><b>[A]</b> Attack  </span>
        <span fg="#9966ff"><b>[F]</b> Fortify  </span>
        <span fg="#ffaa00"><b>[E]</b> End Turn  </span>
        <span fg="#ff3399"><b>[C]</b> Chat  </span>
        <span fg="#64748b"><b>[Esc]</b> Clear  </span>
        <span fg="#ff4444"><b>[Q]</b> Quit</span>
      </text>

      {toastMessage ? (
        <text fg={toastColor}>
          <b>{toastMessage}</b>
        </text>
      ) : (
        <text fg="#475569">
          <i>Sector 07 Perimeter Protocol Active</i>
        </text>
      )}
    </box>
  );
}
