import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { patchMainJs } from "./patch";
import { statePath } from "./paths";
import type { Levels } from "./host";

export function readOpacityState(): Levels | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), "utf8")) as Partial<Levels>;
    if (typeof parsed.ide !== "number" || typeof parsed.agent !== "number") return undefined;
    return { ide: parsed.ide, agent: parsed.agent };
  } catch {
    return undefined;
  }
}

export function writeOpacityState(levels: Levels): void {
  const file = statePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = JSON.stringify({ ide: levels.ide, agent: levels.agent });
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (current === next) return;
  fs.writeFileSync(file, next);
}

export async function ensureInstalled(
  extensionPath: string,
  output: vscode.OutputChannel
): Promise<{ runtimeFile: string }> {
  const appRoot = vscode.env.appRoot;
  const outDir = path.join(appRoot, "out");
  const mainFile = path.join(outDir, "main.js");
  const runtimeFile = path.join(outDir, "cursor-opacity-live.cjs");
  fs.copyFileSync(path.join(extensionPath, "media", "live.cjs"), runtimeFile);
  fs.copyFileSync(path.join(extensionPath, "media", "runtime.mjs"), path.join(outDir, "cursor-opacity-runtime.mjs"));
  fs.copyFileSync(path.join(extensionPath, "media", "guard.cjs"), path.join(outDir, "cursor-opacity-guard.cjs"));
  fs.copyFileSync(path.join(extensionPath, "media", "guard.ps1"), path.join(outDir, "cursor-opacity-guard.ps1"));
  fs.copyFileSync(path.join(extensionPath, "media", "clear-layered.ps1"), path.join(outDir, "clear-layered.ps1"));

  if (!fs.existsSync(mainFile)) {
    output.appendLine(`Cursor main process file was not found at ${mainFile}`);
    return { runtimeFile };
  }

  const source = fs.readFileSync(mainFile, "utf8");
  const patched = patchMainJs(source);
  if (!patched.changed) return { runtimeFile };

  const backup = `${mainFile}.cursor-opacity-backup`;
  if (!fs.existsSync(backup)) fs.copyFileSync(mainFile, backup);
  fs.writeFileSync(mainFile, patched.next);
  output.appendLine("Installed the background-opacity startup hook.");
  return { runtimeFile };
}

export function clearWholeWindowFade(): void {
  if (process.platform !== "win32") return;
  const script = path.join(vscode.env.appRoot, "out", "clear-layered.ps1");
  const fallback = path.join(__dirname, "..", "media", "clear-layered.ps1");
  const file = fs.existsSync(script) ? script : fallback;
  if (!fs.existsSync(file)) return;
  spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], {
    windowsHide: true,
    stdio: "ignore",
  });
}
