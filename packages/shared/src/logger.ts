import { ANSI } from "./colors.js";

export const logger = {
  info(msg: string, ...args: unknown[]) {
    const time = new Date().toISOString().slice(11, 19);
    console.log(`${ANSI.dim}[${time}]${ANSI.reset} ${ANSI.cyan}INFO${ANSI.reset} ${msg}`, ...args);
  },
  warn(msg: string, ...args: unknown[]) {
    const time = new Date().toISOString().slice(11, 19);
    console.warn(`${ANSI.dim}[${time}]${ANSI.reset} ${ANSI.yellow}WARN${ANSI.reset} ${msg}`, ...args);
  },
  error(msg: string, ...args: unknown[]) {
    const time = new Date().toISOString().slice(11, 19);
    console.error(`${ANSI.dim}[${time}]${ANSI.reset} ${ANSI.red}ERROR${ANSI.reset} ${msg}`, ...args);
  },
  debug(msg: string, ...args: unknown[]) {
    if (process.env.DEBUG) {
      const time = new Date().toISOString().slice(11, 19);
      console.log(`${ANSI.dim}[${time}] DEBUG ${msg}`, ...args);
    }
  },
};
