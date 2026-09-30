const INSPECTOR_PORT = 9229;

interface InspectorTarget {
  webSocketDebuggerUrl?: string;
}

async function inspectorUrl(pid: number): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${INSPECTOR_PORT}/json/list`);
      const targets = (await response.json()) as InspectorTarget[];
      if (targets[0]?.webSocketDebuggerUrl) return targets[0].webSocketDebuggerUrl;
    } catch {
      if (attempt === 0) (process as unknown as { _debugProcess(pid: number): void })._debugProcess(pid);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Cursor's main process did not accept the live hook");
}

// Loads the runtime into the already running Cursor main process so opacity applies without a restart.
export async function injectLiveRuntime(runtimeFile: string): Promise<string> {
  const mainPid = process.ppid;
  const expression = `(() => {
    if (process.pid !== ${mainPid} || process.type !== "browser") return "wrong process";
    const req = process.getBuiltinModule("module").createRequire(process.execPath);
    setTimeout(() => req("inspector").close(), 1000);
    const file = ${JSON.stringify(runtimeFile)};
    delete req.cache[req.resolve(file)];
    return req(file).start();
  })()`;

  const socket = new WebSocket(await inspectorUrl(mainPid));
  try {
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    const reply = await new Promise<{ result?: { result?: { value?: string }; exceptionDetails?: unknown } }>(
      (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Live hook timed out")), 5000);
        socket.onmessage = (event) => {
          const message = JSON.parse(String(event.data));
          if (message.id !== 1) return;
          clearTimeout(timer);
          resolve(message);
        };
        socket.send(JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true },
        }));
      }
    );
    if (reply.result?.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails));
    return reply.result?.result?.value ?? "";
  } finally {
    socket.close();
  }
}
