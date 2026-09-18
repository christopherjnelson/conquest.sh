export interface PlayerColorDef {
  name: string;
  ansi: string;
  hex: string;
  fgAnsi: string;
  bgAnsi: string;
}

export const PLAYER_COLORS: PlayerColorDef[] = [
  {
    name: "CYAN",
    ansi: "\x1b[36m",
    hex: "#00d2ff",
    fgAnsi: "\x1b[38;2;0;210;255m",
    bgAnsi: "\x1b[48;2;0;70;90m",
  },
  {
    name: "AMBER",
    ansi: "\x1b[33m",
    hex: "#ffaa00",
    fgAnsi: "\x1b[38;2;255;170;0m",
    bgAnsi: "\x1b[48;2;90;60;0m",
  },
  {
    name: "MAGENTA",
    ansi: "\x1b[35m",
    hex: "#ff3399",
    fgAnsi: "\x1b[38;2;255;51;153m",
    bgAnsi: "\x1b[48;2;90;20;55m",
  },
  {
    name: "GREEN",
    ansi: "\x1b[32m",
    hex: "#00ff66",
    fgAnsi: "\x1b[38;2;0;255;102m",
    bgAnsi: "\x1b[48;2;0;80;35m",
  },
  {
    name: "PURPLE",
    ansi: "\x1b[34m",
    hex: "#9966ff",
    fgAnsi: "\x1b[38;2;153;102;255m",
    bgAnsi: "\x1b[48;2;50;30;85m",
  },
  {
    name: "RED",
    ansi: "\x1b[31m",
    hex: "#ff4444",
    fgAnsi: "\x1b[38;2;255;68;68m",
    bgAnsi: "\x1b[48;2;90;25;25m",
  },
];

export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  inverse: "\x1b[7m",
  gray: "\x1b[90m",
  white: "\x1b[97m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

export function getPlayerColor(index: number): PlayerColorDef {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}
