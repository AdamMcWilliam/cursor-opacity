import { createRequire } from "node:module";

// Loaded by Cursor's main process from main.js. A failure here must never stop Cursor from starting.
const require = createRequire(import.meta.url);

function report(error) {
  try {
    const fs = require("fs");
    const path = require("path");
    const { app } = require("electron");
    fs.writeFileSync(path.join(app.getPath("userData"), "cursor-opacity-startup-error.txt"), String(error?.stack || error));
  } catch {
    // Nowhere left to report.
  }
}

try {
  const { app } = require("electron");
  // Linux can only show the desktop through a window created with transparent: true.
  if (process.platform === "linux") globalThis.__cursorOpacityWantsTransparent = true;
  app.whenReady().then(() => require("./cursor-opacity-live.cjs").start("startup")).catch(report);
} catch (error) {
  report(error);
}
