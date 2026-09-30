import { createRequire } from "node:module";

// Loaded by Cursor's main process from main.js. A failure here must never stop Cursor from starting.
try {
  const require = createRequire(import.meta.url);
  const { app } = require("electron");
  // Linux can only show the desktop through a window created with transparent: true.
  if (process.platform === "linux") globalThis.__cursorOpacityWantsTransparent = true;
  app.whenReady().then(() => require("./cursor-opacity-live.cjs").start()).catch(() => {});
} catch {
  // Background opacity is optional.
}
