import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { installHook, removeHook } from "./hook";
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

function appOutDir(): string {
  return path.join(vscode.env.appRoot, "out");
}

export function ensureInstalled(
  extensionPath: string,
  output: vscode.OutputChannel
): { runtimeFile: string; hooked: boolean } {
  const mediaDir = path.join(extensionPath, "media");
  const result = installHook(mediaDir, appOutDir());
  if (result.error) {
    // Cursor's app folder can be read-only, as in /Applications on macOS. Opacity still works while
    // Cursor is open, but it cannot load on launch until the IDE opens again.
    output.appendLine(`Could not install the startup hook: ${result.error}`);
    return { runtimeFile: path.join(mediaDir, "live.cjs"), hooked: false };
  }
  if (result.changed) output.appendLine("Installed the startup hook.");
  return { runtimeFile: path.join(appOutDir(), "cursor-opacity-live.cjs"), hooked: true };
}

export function uninstallHook(): string | undefined {
  return removeHook(appOutDir()).error;
}
