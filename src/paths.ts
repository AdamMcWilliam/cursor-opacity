import * as os from "os";
import * as path from "path";

export function cursorUserDir(): string {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "Cursor");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Cursor");
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "Cursor");
}

export function statePath(): string {
  return path.join(cursorUserDir(), "cursor-opacity.json");
}

export function statusPath(): string {
  return path.join(cursorUserDir(), "cursor-opacity-status.json");
}
