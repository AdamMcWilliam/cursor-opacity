"use strict";

// Runs inside Cursor's Electron main process. Loaded at startup from main.js,
// and injected into an already running Cursor by the extension.
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const AGENT_TITLE = "Cursor Agents";

const RENDERER_VERSION = 7;
// Fades every background and border color in the page. Text, icons, and images are never touched.
const RENDERER = String.raw`(() => {
  const VERSION = ${RENDERER_VERSION};
  if (window.__cursorOpacity?.version === VERSION) return window.__cursorOpacity;
  window.__cursorOpacity?.dispose?.();

  const PROPS = ["background-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "outline-color"];
  const KEEP = /^(transparent|inherit|initial|unset|revert|revert-layer|currentcolor|none|)$/i;
  const SKIP_SUBTREES = "#cursor-opacity-panel, .view-lines, .view-overlays, .xterm-rows, .monaco-list-rows .monaco-highlighted-label";
  const ruleSaved = new WeakMap();
  const inlineSaved = new Map();
  let percent = 100;
  let ruleCount = -1;
  let dedupeTimer = 0;

  const own = document.createElement("style");
  own.id = "cursor-opacity";
  own.textContent = "html { background: transparent !important; } [data-cursor-opacity-clear] { background-color: transparent !important; }";

  const fade = (value) => "color-mix(in srgb, " + value + " " + percent + "%, transparent)";

  function alphaOf(color) {
    if (!color || color === "transparent") return 0;
    const slash = color.match(/\/\s*([\d.]+)(%?)\s*\)$/);
    if (slash) return slash[2] ? Number(slash[1]) / 100 : Number(slash[1]);
    const rgba = color.match(/^rgba\([^)]*,\s*([\d.]+)\)$/);
    if (rgba) return Number(rgba[1]);
    return 1;
  }

  const panelStyle = document.createElement("style");
  panelStyle.id = "cursor-opacity-panel-style";
  panelStyle.textContent = [
    "#cursor-opacity-panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 260px; box-sizing: border-box; padding: 14px 16px; border-radius: 10px; border: 1px solid #3a3a3a; background: #1e1e1e; color: #e6e6e6; font: 12px/1.4 system-ui, sans-serif; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5); }",
    "#cursor-opacity-panel h3 { margin: 0; font-size: 13px; font-weight: 600; }",
    "#cursor-opacity-panel .co-row { display: flex; justify-content: space-between; margin-top: 12px; }",
    "#cursor-opacity-panel .co-value { font-variant-numeric: tabular-nums; font-weight: 600; }",
    "#cursor-opacity-panel input { display: block; width: 100%; margin: 6px 0 0; accent-color: #81a1c1; }",
    "#cursor-opacity-panel button { display: block; width: 100%; margin-top: 14px; padding: 6px; border: 0; border-radius: 6px; background: #333; color: #e6e6e6; font: inherit; cursor: pointer; }",
    "#cursor-opacity-panel button:hover { background: #3d3d3d; }",
    "#cursor-opacity-panel .co-hint { margin-top: 10px; color: #9a9a9a; }",
  ].join("\n");
  const panelLevels = { ide: 100, agent: 100 };
  let panel = null;

  function paintPanel() {
    if (!panel) return;
    for (const input of panel.querySelectorAll("input")) {
      if (document.activeElement !== input) input.value = String(panelLevels[input.dataset.key]);
    }
    for (const label of panel.querySelectorAll("[data-value]")) label.textContent = panelLevels[label.dataset.value] + "%";
  }

  // The page cannot write files, so the main process listens for this console message.
  // Cursor replaces console.log with a no-op, so this has to be warn.
  function publishPanel() {
    console.warn("__cursorOpacity:" + JSON.stringify(panelLevels));
  }

  function buildPanel() {
    panel = document.createElement("div");
    panel.id = "cursor-opacity-panel";
    const title = document.createElement("h3");
    title.textContent = "Window opacity";
    panel.append(title);
    for (const [key, text] of [["agent", "Agents window"], ["ide", "IDE window"]]) {
      const row = document.createElement("div");
      row.className = "co-row";
      const name = document.createElement("span");
      name.textContent = text;
      const value = document.createElement("span");
      value.className = "co-value";
      value.dataset.value = key;
      row.append(name, value);
      const input = document.createElement("input");
      input.type = "range";
      input.min = "15";
      input.max = "100";
      input.step = "1";
      input.dataset.key = key;
      input.addEventListener("input", () => {
        panelLevels[key] = Number(input.value);
        paintPanel();
        publishPanel();
      });
      panel.append(row, input);
    }
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset both to 100%";
    reset.addEventListener("click", () => {
      panelLevels.ide = 100;
      panelLevels.agent = 100;
      paintPanel();
      publishPanel();
    });
    const hint = document.createElement("div");
    hint.className = "co-hint";
    hint.textContent = "Ctrl+Alt+O or Esc closes this. Ctrl+Alt+= and Ctrl+Alt+- change this window by 5%.";
    panel.append(reset, hint);
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePanel();
    });
  }

  function onOutside(event) {
    if (panel && !panel.contains(event.target)) closePanel();
  }

  function closePanel() {
    panel?.remove();
    panelStyle.remove();
    removeEventListener("mousedown", onOutside, true);
  }

  function togglePanel(levels) {
    Object.assign(panelLevels, levels);
    if (panel?.isConnected) return closePanel();
    if (!panel) buildPanel();
    document.head.append(panelStyle);
    document.body.append(panel);
    addEventListener("mousedown", onOutside, true);
    paintPanel();
    panel.querySelector("input").focus();
  }

  function sheets() {
    return [...document.styleSheets, ...(document.adoptedStyleSheets || [])].filter(
      (s) => s.ownerNode !== own && s.ownerNode !== panelStyle
    );
  }

  function eachStyle(rules, visit) {
    for (const rule of rules) {
      if (rule.style) visit(rule.style);
      if (rule.cssRules && rule.cssRules.length) eachStyle(rule.cssRules, visit);
    }
  }

  function countRules() {
    let total = 0;
    for (const sheet of sheets()) {
      try { total += sheet.cssRules.length; } catch {}
    }
    return total;
  }

  function applyRules(restore) {
    for (const sheet of sheets()) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      eachStyle(rules, (style) => {
        let saved = ruleSaved.get(style);
        for (const prop of PROPS) {
          if (!saved?.[prop]) {
            if (restore) continue;
            let value = style.getPropertyValue(prop).trim();
            // "background: var(--x)" leaves the longhand empty until the variable resolves.
            if (!value && prop === "background-color" && /^var\(--[\w-]+\)$/.test(style.getPropertyValue("background").trim())) {
              value = style.getPropertyValue("background").trim();
            }
            if (KEEP.test(value)) continue;
            if (!saved) { saved = {}; ruleSaved.set(style, saved); }
            saved[prop] = [value, style.getPropertyPriority(prop)];
          }
          const [value, priority] = saved[prop];
          style.setProperty(prop, restore ? value : fade(value), priority);
        }
      });
    }
    ruleCount = countRules();
  }

  function applyInline(restore) {
    for (const [el, saved] of inlineSaved) {
      if (!el.isConnected) { inlineSaved.delete(el); continue; }
      if (!restore) continue;
      for (const prop in saved) {
        if (el.style.getPropertyValue(prop) === saved[prop].written) el.style.setProperty(prop, saved[prop].value, saved[prop].priority);
      }
      inlineSaved.delete(el);
    }
    if (restore) return;
    for (const el of document.querySelectorAll("[style]")) {
      let saved = inlineSaved.get(el);
      for (const prop of PROPS) {
        const current = el.style.getPropertyValue(prop).trim();
        if (KEEP.test(current)) continue;
        const entry = saved?.[prop];
        const value = entry && current === entry.written ? entry.value : current;
        const priority = entry && current === entry.written ? entry.priority : el.style.getPropertyPriority(prop);
        const written = fade(value);
        if (!saved) { saved = {}; inlineSaved.set(el, saved); }
        saved[prop] = { value, priority, written };
        if (current !== written) el.style.setProperty(prop, written, priority);
        saved[prop].written = el.style.getPropertyValue(prop);
      }
    }
  }

  // Nested layers with the same faded color would stack and look darker, so only the lowest one paints.
  // Large layers that are almost fully covered by their children also stop painting.
  function dedupe() {
    dedupeTimer = 0;
    for (const el of document.querySelectorAll("[data-cursor-opacity-clear]")) el.removeAttribute("data-cursor-opacity-clear");
    if (percent >= 100) return;
    const layers = [];
    const byEl = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => (node.matches(SKIP_SUBTREES) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let el = walker.currentNode; el; el = walker.nextNode()) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) continue;
      const color = getComputedStyle(el).backgroundColor;
      if (alphaOf(color) === 0) continue;
      const layer = { el, color, rect, area: rect.width * rect.height, covered: 0, clear: false, parent: null, ref: null };
      for (let p = el.parentElement; p; p = p.parentElement) {
        const parent = byEl.get(p);
        if (parent) { layer.parent = parent; break; }
      }
      layers.push(layer);
      byEl.set(el, layer);
    }
    const painter = (layer) => {
      let below = layer.parent;
      while (below && below.clear) below = below.parent;
      return below;
    };
    for (const layer of layers) {
      layer.ref = painter(layer);
      if (layer.ref && layer.ref.color === layer.color) layer.clear = true;
    }
    const overlap = (a, b) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    for (const layer of layers) {
      if (!layer.clear && layer.parent) layer.parent.covered += overlap(layer.rect, layer.parent.rect);
    }
    const coveredAway = new Set();
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      if (!layer.clear && layer.covered >= layer.area * 0.85) {
        layer.clear = true;
        coveredAway.add(layer);
      }
    }
    for (const layer of layers) {
      if (!layer.clear || coveredAway.has(layer) || !coveredAway.has(layer.ref)) continue;
      const next = painter(layer);
      if (!next || next.color !== layer.color) layer.clear = false;
    }
    for (const layer of layers) {
      if (layer.clear) layer.el.setAttribute("data-cursor-opacity-clear", "");
    }
  }

  function scheduleDedupe() {
    if (!dedupeTimer) dedupeTimer = setTimeout(dedupe, 600);
  }

  function apply() {
    const restore = percent >= 100;
    applyRules(restore);
    applyInline(restore);
    if (restore) own.remove();
    else if (!own.isConnected) document.head.appendChild(own);
    dedupe();
  }

  const observer = new MutationObserver((records) => {
    if (percent >= 100) return;
    let restyle = false;
    let layout = false;
    for (const r of records) {
      if (r.type === "attributes" && r.attributeName === "style") {
        const saved = inlineSaved.get(r.target);
        if (!saved || PROPS.some((p) => saved[p] && r.target.style.getPropertyValue(p) !== saved[p].written)) restyle = true;
        continue;
      }
      const target = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (target && target.closest && target.closest("style, head")) { restyle = true; continue; }
      if (target && target.closest && target.closest(SKIP_SUBTREES)) continue;
      layout = true;
    }
    if (restyle) { applyRules(false); applyInline(false); }
    if (restyle || layout) scheduleDedupe();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
  const poll = setInterval(() => {
    if (percent < 100 && countRules() !== ruleCount) { applyRules(false); scheduleDedupe(); }
  }, 1500);
  addEventListener("resize", scheduleDedupe);

  window.__cursorOpacity = {
    version: VERSION,
    set(next) {
      percent = next;
      apply();
    },
    togglePanel,
    syncPanel(levels) {
      Object.assign(panelLevels, levels);
      paintPanel();
    },
    dispose() {
      closePanel();
      observer.disconnect();
      clearInterval(poll);
      clearTimeout(dedupeTimer);
      removeEventListener("resize", scheduleDedupe);
      percent = 100;
      apply();
    },
  };
  return window.__cursorOpacity;
})()`;

function userDir() {
  return app.getPath("userData");
}

const clamp = (v) => (Number.isFinite(Number(v)) ? Math.min(100, Math.max(15, Math.round(Number(v)))) : 100);

function readLevels() {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(userDir(), "cursor-opacity.json"), "utf8"));
    return { ide: clamp(parsed.ide), agent: clamp(parsed.agent) };
  } catch {
    return { ide: 100, agent: 100 };
  }
}

// Cursor updates replace the app folder, so keep a copy of the hook files where the guard can reach them.
function stashHookFiles() {
  const stash = path.join(userDir(), "cursor-opacity");
  fs.mkdirSync(stash, { recursive: true });
  for (const name of ["cursor-opacity-live.cjs", "cursor-opacity-runtime.mjs", "cursor-opacity-guard.cjs", "cursor-opacity-guard.ps1"]) {
    const from = path.join(__dirname, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(stash, name));
  }
  return stash;
}

// After Cursor quits, the guard waits for an update to replace main.js, then puts the startup hook back.
function spawnGuard(stash) {
  const guard = path.join(stash, "cursor-opacity-guard.cjs");
  if (!fs.existsSync(guard)) return;
  const outDir = __dirname;
  const { spawn } = require("child_process");
  const child = process.platform === "win32"
    // Running Cursor.exe as the guard would lock it and block the updater, so Windows uses PowerShell.
    ? spawn("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
        "-File", path.join(stash, "cursor-opacity-guard.ps1"), "-OutDir", outDir, "-Stash", stash,
      ], { detached: true, stdio: "ignore", windowsHide: true })
    : spawn(process.execPath, [guard, outDir, stash], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      });
  child.unref();
}

function start() {
  globalThis.__cursorOpacityLive?.stop();

  // Survives re-injection, because after the first fade getBackgroundColor no longer reports the theme color.
  const original = (globalThis.__cursorOpacityOriginal ??= new Map());
  const applied = new Map();
  const stateFile = path.join(userDir(), "cursor-opacity.json");
  let levels = readLevels();
  const errors = [];

  function percentFor(win) {
    return win.getTitle() === AGENT_TITLE ? levels.agent : levels.ide;
  }

  function setNative(win, percent) {
    if (!original.has(win.id)) original.set(win.id, win.getBackgroundColor());
    // No backdrop material: acrylic and vibrancy blur the desktop, and acrylic turns solid when unfocused.
    if (process.platform === "win32") win.setBackgroundMaterial("none");
    else if (process.platform === "darwin") win.setVibrancy(null);
    win.setBackgroundColor(percent < 100 ? "#00000000" : original.get(win.id) || "#000000");
  }

  function applyWindow(win, force) {
    if (win.isDestroyed()) return;
    const percent = percentFor(win);
    const last = applied.get(win.id);
    if (!force && last === percent) return;
    applied.set(win.id, percent);
    try {
      if (!(last === undefined && percent >= 100)) setNative(win, percent);
    } catch (error) {
      errors.push(String(error));
    }
    win.webContents
      .executeJavaScript(RENDERER + ".set(" + percent + ")", true)
      .catch((error) => errors.push(String(error)));
  }

  function writeStatus() {
    const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
    const titles = windows.map((w) => w.getTitle());
    const body = {
      running: true,
      live: true,
      ide: levels.ide,
      agent: levels.agent,
      ideWindows: titles.filter((t) => t !== AGENT_TITLE),
      agentWindows: titles.filter((t) => t === AGENT_TITLE),
      error: errors.slice(-1)[0] || "",
    };
    try {
      fs.writeFileSync(path.join(userDir(), "cursor-opacity-status.json"), JSON.stringify(body));
    } catch {
      // Status is informational.
    }
  }

  function applyAll(force) {
    for (const win of BrowserWindow.getAllWindows()) applyWindow(win, force);
    writeStatus();
  }

  function setLevels(next) {
    levels = { ide: clamp(next.ide), agent: clamp(next.agent) };
    try {
      fs.writeFileSync(stateFile, JSON.stringify(levels));
    } catch (error) {
      errors.push(String(error));
    }
    applyAll(false);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents
        .executeJavaScript("window.__cursorOpacity && window.__cursorOpacity.syncPanel(" + JSON.stringify(levels) + ")", true)
        .catch(() => {});
    }
  }

  const listeners = new Map();
  function watchWindow(win) {
    if (listeners.has(win.id)) return;
    const contents = win.webContents;
    const onLoad = () => applyWindow(win, true);
    const onTitle = () => setTimeout(() => applyWindow(win, false), 0);
    const onConsole = (event, _level, legacyMessage) => {
      const message = typeof legacyMessage === "string" ? legacyMessage : event?.message;
      if (typeof message !== "string" || !message.startsWith("__cursorOpacity:")) return;
      try {
        setLevels(JSON.parse(message.slice("__cursorOpacity:".length)));
      } catch {
        // Ignore malformed messages.
      }
    };
    const onKey = (event, input) => {
      if (input.type !== "keyDown" || !input.alt || !(input.control || input.meta)) return;
      const which = win.getTitle() === AGENT_TITLE ? "agent" : "ide";
      if (input.code === "KeyO") {
        event.preventDefault();
        contents.executeJavaScript(RENDERER + ".togglePanel(" + JSON.stringify(levels) + ")", true).catch(() => {});
      } else if (input.code === "Equal" || input.code === "Minus") {
        event.preventDefault();
        setLevels({ ...levels, [which]: levels[which] + (input.code === "Equal" ? 5 : -5) });
      }
    };
    contents.on("did-finish-load", onLoad);
    contents.on("console-message", onConsole);
    contents.on("before-input-event", onKey);
    win.on("page-title-updated", onTitle);
    listeners.set(win.id, () => {
      if (win.isDestroyed()) return;
      contents.off("did-finish-load", onLoad);
      contents.off("console-message", onConsole);
      contents.off("before-input-event", onKey);
      win.off("page-title-updated", onTitle);
    });
    win.once("closed", () => {
      listeners.delete(win.id);
      applied.delete(win.id);
      original.delete(win.id);
    });
  }

  const onCreated = (_event, win) => {
    watchWindow(win);
    applyWindow(win, false);
    writeStatus();
  };
  app.on("browser-window-created", onCreated);
  for (const win of BrowserWindow.getAllWindows()) watchWindow(win);

  const onState = () => {
    levels = readLevels();
    applyAll(false);
  };
  fs.watchFile(stateFile, { interval: 100 }, onState);
  applyAll(true);

  let stash = "";
  try {
    stash = stashHookFiles();
  } catch (error) {
    errors.push(String(error));
  }
  const onQuit = () => {
    try {
      if (stash) spawnGuard(stash);
    } catch {
      // Cursor is quitting either way.
    }
  };
  app.on("will-quit", onQuit);

  globalThis.__cursorOpacityLive = {
    stop() {
      fs.unwatchFile(stateFile, onState);
      app.off("will-quit", onQuit);
      app.off("browser-window-created", onCreated);
      for (const off of listeners.values()) off();
    },
  };
  return "started";
}

module.exports = { start };
