import * as vscode from "vscode";
import { readOpacityStatus, type ApplyResult, type Levels } from "./host";
import { injectLiveRuntime } from "./inject";
import { ensureInstalled, readOpacityState, uninstallHook, writeOpacityState } from "./install";
import { OpacityViewProvider } from "./view";

const MIN = 15;
const MAX = 100;

let levels: Levels = { ide: 100, agent: 100 };
let lastResult: ApplyResult | undefined;
let provider: OpacityViewProvider | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let persistDepth = 0;
let statusText = "Saved opacity loads when Cursor starts.";
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Cursor Opacity");
  // The state file is written on every drag, so it holds the latest value even when saving settings failed.
  const saved = readOpacityState();
  levels = saved ? { ide: clamp(saved.ide), agent: clamp(saved.agent) } : readLevels();
  writeOpacityState(levels);
  const configured = readLevels();
  if (configured.ide !== levels.ide || configured.agent !== levels.agent) void persistLevels();

  const { runtimeFile, hooked } = ensureInstalled(context.extensionPath, output);
  let liveError = "";
  try {
    output.appendLine(`Live hook: ${await injectLiveRuntime(runtimeFile)}`);
  } catch (error) {
    liveError = String(error);
    output.appendLine(`Live hook failed: ${liveError}`);
  }

  provider = new OpacityViewProvider(
    (target, value) => {
      void setLevel(target, value);
    },
    () => {
      void setLevels({ ide: 100, agent: 100 });
    }
  );

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "cursorOpacity.focus";
  statusBar.show();

  const timer = setInterval(refreshFromRuntime, 1000);

  context.subscriptions.push(
    output,
    statusBar,
    vscode.window.registerWebviewViewProvider(OpacityViewProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("cursorOpacity.focus", async () => {
      await vscode.commands.executeCommand("cursorOpacity.panel.focus");
    }),
    vscode.commands.registerCommand("cursorOpacity.reset", () => setLevels({ ide: 100, agent: 100 })),
    vscode.commands.registerCommand("cursorOpacity.setIde", () => promptFor("ide")),
    vscode.commands.registerCommand("cursorOpacity.setAgent", () => promptFor("agent")),
    vscode.commands.registerCommand("cursorOpacity.removeHook", removeStartupHook),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (persistDepth > 0 || !event.affectsConfiguration("cursorOpacity")) return;
      const next = readLevels();
      if (next.ide === levels.ide && next.agent === levels.agent) return;
      levels = next;
      writeOpacityState(levels);
      statusText = "Loaded saved opacity. Backgrounds update live.";
      refresh();
    }),
    { dispose: () => {
      clearInterval(timer);
      if (saveTimer) clearTimeout(saveTimer);
    } }
  );

  statusText = !liveError
    ? "Backgrounds update live. Text and controls stay solid."
    : hooked
      ? "Could not attach live. Quit Cursor and open it again to fade backgrounds."
      : "Could not attach to Cursor. See Output > Cursor Opacity.";
  refresh();
}

async function removeStartupHook(): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    "Remove Cursor Opacity from Cursor's startup? Windows go back to solid now, and the fade stops loading on launch.",
    { modal: true },
    "Remove"
  );
  if (choice !== "Remove") return;
  await setLevels({ ide: 100, agent: 100 });
  const error = uninstallHook();
  if (error) {
    void vscode.window.showErrorMessage(`Could not remove the startup hook: ${error}`);
    return;
  }
  void vscode.window.showInformationMessage(
    "Removed. You can uninstall the extension now. Opening the IDE with it installed adds the hook back."
  );
}

export async function deactivate(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    await persistLevels();
  }
}

function readLevels(): Levels {
  const config = vscode.workspace.getConfiguration("cursorOpacity");
  return {
    ide: clamp(config.get<number>("ide", 100)),
    agent: clamp(config.get<number>("agent", 100)),
  };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(MAX, Math.max(MIN, Math.round(value)));
}

async function setLevel(target: "ide" | "agent", value: number): Promise<void> {
  await setLevels({ ...levels, [target]: value });
}

async function setLevels(next: Levels): Promise<void> {
  levels = { ide: clamp(next.ide), agent: clamp(next.agent) };
  writeOpacityState(levels);
  statusText = "Saving background opacity…";
  refresh();
  scheduleSave();
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    void persistLevels();
  }, 300);
}

async function persistLevels(): Promise<void> {
  const snapshot = { ...levels };
  const config = vscode.workspace.getConfiguration("cursorOpacity");
  persistDepth += 1;
  try {
    await config.update("ide", snapshot.ide, vscode.ConfigurationTarget.Global);
    await config.update("agent", snapshot.agent, vscode.ConfigurationTarget.Global);
  } catch {
    statusText = "Saved. settings.json has unsaved edits in a tab, so it will show the new value after you close that tab.";
    refresh();
    return;
  } finally {
    persistDepth -= 1;
  }
  if (snapshot.ide === levels.ide && snapshot.agent === levels.agent) {
    statusText = "Saved. Backgrounds update live and load on launch. Text and controls stay solid.";
    refresh();
  }
}

async function promptFor(target: "ide" | "agent"): Promise<void> {
  const label = target === "ide" ? "IDE" : "Agent";
  const picked = await vscode.window.showInputBox({
    title: `Cursor ${label} background opacity`,
    prompt: "Enter a percent from 15 to 100. Text and controls stay solid.",
    value: String(levels[target]),
    validateInput: (text) => {
      const value = Number(text);
      if (!Number.isInteger(value) || value < MIN || value > MAX) {
        return "Enter a whole number from 15 to 100";
      }
      return undefined;
    },
  });
  if (picked === undefined) return;
  await setLevel(target, Number(picked));
}

function refreshFromRuntime(): void {
  const status = readOpacityStatus();
  if (status?.running) lastResult = status;
  refresh();
}

function refresh(): void {
  provider?.update(levels, lastResult, statusText);
  if (!statusBar) return;
  statusBar.text = `$(eye) IDE ${levels.ide}% · Agent ${levels.agent}%`;
  statusBar.tooltip = "Background opacity. Text and controls stay solid. Saved values load on launch.";
}
