"use strict";

// Started when Cursor quits, running as plain Node. If an update replaces main.js,
// put the startup hook back before Cursor opens again.
const fs = require("fs");
const path = require("path");

const [outDir, stash] = process.argv.slice(2);
const IMPORT = 'import"./cursor-opacity-runtime.mjs";';
const FILES = ["cursor-opacity-live.cjs", "cursor-opacity-runtime.mjs", "cursor-opacity-guard.cjs", "cursor-opacity-guard.ps1"];
const main = path.join(outDir, "main.js");
const lock = path.join(stash, "guard.lock");

try {
  const pid = Number(fs.readFileSync(lock, "utf8"));
  process.kill(pid, 0);
  process.exit(0);
} catch {
  fs.writeFileSync(lock, String(process.pid));
}

function stamp() {
  try {
    const stat = fs.statSync(main);
    return stat.size + "|" + stat.mtimeMs;
  } catch {
    return "";
  }
}

const initial = stamp();
let deadline = Date.now() + 4 * 60 * 1000;
let last = "";

function finish() {
  try {
    fs.rmSync(lock);
  } catch {
    // Already gone.
  }
  process.exit(0);
}

const timer = setInterval(() => {
  if (Date.now() > deadline) finish();
  const now = stamp();
  if (!now || now === initial) return;
  deadline = Date.now() + 20 * 60 * 1000;
  if (now !== last) {
    last = now;
    return;
  }
  try {
    let text = fs.readFileSync(main, "utf8");
    if (!text.includes(IMPORT)) {
      for (const name of FILES) {
        const from = path.join(stash, name);
        if (fs.existsSync(from)) fs.copyFileSync(from, path.join(outDir, name));
      }
      // Cursor cannot start if main.js imports a file that is missing.
      const ready = ["cursor-opacity-runtime.mjs", "cursor-opacity-live.cjs"].every((name) =>
        fs.existsSync(path.join(outDir, name))
      );
      if (ready) {
        if (!text.endsWith("\n")) text += "\n";
        fs.writeFileSync(main, text + IMPORT + "\n");
      }
    }
    clearInterval(timer);
    finish();
  } catch {
    last = "";
  }
}, 1000);
