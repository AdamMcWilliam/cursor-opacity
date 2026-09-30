import * as vscode from "vscode";
import type { ApplyResult, Levels } from "./host";

export interface PanelState extends Levels {
  ideWindows: string[];
  agentWindows: string[];
  error: string;
  status: string;
}

export class OpacityViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "cursorOpacity.panel";

  private view: vscode.WebviewView | undefined;
  private state: PanelState = {
    ide: 100,
    agent: 100,
    ideWindows: [],
    agentWindows: [],
    error: "",
    status: "Saved opacity loads when Cursor starts. Text and controls stay solid.",
  };

  constructor(
    private readonly onSet: (target: "ide" | "agent", value: number) => void,
    private readonly onReset: () => void
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = render(this.state);
    webviewView.webview.onDidReceiveMessage((message: { type?: string; target?: "ide" | "agent"; value?: number }) => {
      if (message.type === "set" && (message.target === "ide" || message.target === "agent")) {
        this.onSet(message.target, Number(message.value));
      }
      if (message.type === "reset") this.onReset();
    });
  }

  update(levels: Levels, result: ApplyResult | undefined, status: string): void {
    const errors = result?.error
      ? [result.error, ...(result.errors ?? [])]
      : (result?.errors ?? []);
    this.state = {
      ide: levels.ide,
      agent: levels.agent,
      ideWindows: result?.ideWindows ?? this.state.ideWindows,
      agentWindows: result?.agentWindows ?? this.state.agentWindows,
      error: errors.filter(Boolean).join(" "),
      status,
    };
    this.view?.webview.postMessage({ type: "state", state: this.state });
  }
}

function render(state: PanelState): string {
  const initial = JSON.stringify(state).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<style>
  body {
    margin: 0;
    padding: 16px;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    background: var(--vscode-sideBar-background);
  }
  h2 {
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 600;
  }
  .lead, .hint, .status, .error {
    margin: 0;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    line-height: 1.4;
  }
  .card {
    margin-top: 16px;
    padding: 12px;
    border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.35));
    border-radius: 8px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .percent {
    font-variant-numeric: tabular-nums;
    font-size: 20px;
    font-weight: 600;
  }
  input[type="range"] {
    --pct: 100%;
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 8px;
    margin: 12px 0 8px;
    border-radius: 999px;
    background: linear-gradient(to right, var(--vscode-button-background) var(--pct), var(--vscode-input-background) var(--pct));
    outline: none;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--vscode-button-foreground);
    border: 2px solid var(--vscode-button-background);
    cursor: pointer;
  }
  button {
    margin-top: 16px;
    width: 100%;
    border: none;
    border-radius: 4px;
    padding: 8px 10px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
  }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .status { margin-top: 10px; }
  .error { margin-top: 8px; color: var(--vscode-errorForeground); }
</style>
</head>
<body>
  <h2>Window opacity</h2>
  <p class="lead">Drag a percent bar to fade that window’s backgrounds. Text, buttons, and other controls stay solid. Values are saved and loaded on launch.</p>
  <section class="card">
    <div class="row">
      <label for="ide">IDE window</label>
      <span class="percent" id="ideValue">100%</span>
    </div>
    <input id="ide" type="range" min="15" max="100" step="1" value="100" aria-label="IDE opacity percent" />
    <p class="hint" id="ideHint"></p>
  </section>
  <section class="card">
    <div class="row">
      <label for="agent">Agent window</label>
      <span class="percent" id="agentValue">100%</span>
    </div>
    <input id="agent" type="range" min="15" max="100" step="1" value="100" aria-label="Agent opacity percent" />
    <p class="hint" id="agentHint"></p>
  </section>
  <button id="reset" type="button">Reset both to 100%</button>
  <p class="status" id="status"></p>
  <p class="error" id="error"></p>
  <script>
    const vscode = acquireVsCodeApi();
    const initial = ${initial};
    const ide = document.getElementById("ide");
    const agent = document.getElementById("agent");

    function windowHint(names, waiting) {
      if (!names || names.length === 0) return waiting;
      if (names.length === 1) return names[0];
      return names.length + " windows";
    }

    function paint(state) {
      for (const key of ["ide", "agent"]) {
        const input = document.getElementById(key);
        const pct = String(state[key]) + "%";
        if (document.activeElement !== input) input.value = String(state[key]);
        input.style.setProperty("--pct", pct);
        document.getElementById(key + "Value").textContent = pct;
      }
      document.getElementById("ideHint").textContent = windowHint(state.ideWindows, "Waiting for a Cursor IDE window");
      document.getElementById("agentHint").textContent = windowHint(state.agentWindows, "Waiting for a Cursor Agents window");
      document.getElementById("status").textContent = state.status || "";
      document.getElementById("error").textContent = state.error || "";
    }

    function publish(target, value) {
      const input = document.getElementById(target);
      input.style.setProperty("--pct", value + "%");
      document.getElementById(target + "Value").textContent = value + "%";
      vscode.postMessage({ type: "set", target, value });
    }

    ide.addEventListener("input", () => publish("ide", Number(ide.value)));
    agent.addEventListener("input", () => publish("agent", Number(agent.value)));
    document.getElementById("reset").addEventListener("click", () => {
      vscode.postMessage({ type: "reset" });
    });
    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "state") paint(event.data.state);
    });
    paint(initial);
  </script>
</body>
</html>`;
}
