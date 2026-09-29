import { spawn } from "node:child_process";

export const DISCORD_INVITE_URL = "https://discord.gg/XrGAErGqm";

export function openDiscordInvite(): Promise<void> {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "rundll32"
      : "xdg-open";
  const args = process.platform === "win32"
    ? ["url.dll,FileProtocolHandler", DISCORD_INVITE_URL]
    : [DISCORD_INVITE_URL];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
