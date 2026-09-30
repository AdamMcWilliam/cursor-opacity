import * as fs from "fs";
import * as path from "path";
import { patchMainJs, unpatchMainJs } from "./patch";
import { cursorUserDir } from "./paths";

// Files copied next to Cursor's main.js, keyed by their name in the extension's media folder.
const HOOK_FILES: Record<string, string> = {
  "live.cjs": "cursor-opacity-live.cjs",
  "runtime.mjs": "cursor-opacity-runtime.mjs",
  "guard.cjs": "cursor-opacity-guard.cjs",
  "guard.ps1": "cursor-opacity-guard.ps1",
};

export interface HookResult {
  installed: boolean;
  changed: boolean;
  error?: string;
}

export function installHook(mediaDir: string, outDir: string): HookResult {
  const mainFile = path.join(outDir, "main.js");
  try {
    if (!fs.existsSync(mainFile)) return { installed: false, changed: false, error: `${mainFile} was not found` };
    for (const [from, to] of Object.entries(HOOK_FILES)) {
      fs.copyFileSync(path.join(mediaDir, from), path.join(outDir, to));
    }
    const patched = patchMainJs(fs.readFileSync(mainFile, "utf8"));
    if (patched.changed) fs.writeFileSync(mainFile, patched.next);
    return { installed: true, changed: patched.changed };
  } catch (error) {
    return { installed: false, changed: false, error: String(error) };
  }
}

// Removes the startup line first, so Cursor never imports a file that is already gone.
export function removeHook(outDir: string): HookResult {
  try {
    const mainFile = path.join(outDir, "main.js");
    let changed = false;
    if (fs.existsSync(mainFile)) {
      const source = fs.readFileSync(mainFile, "utf8");
      const next = unpatchMainJs(source);
      if (next !== source) {
        fs.writeFileSync(mainFile, next);
        changed = true;
      }
    }
    for (const name of Object.values(HOOK_FILES)) fs.rmSync(path.join(outDir, name), { force: true });
    fs.rmSync(path.join(cursorUserDir(), "cursor-opacity"), { recursive: true, force: true });
    return { installed: false, changed };
  } catch (error) {
    return { installed: true, changed: false, error: String(error) };
  }
}

// Cursor's app folder, found from the executable when the vscode API is not available.
export function appOutDirFromExecutable(execPath: string): string | undefined {
  const candidates = [
    path.join(path.dirname(execPath), "resources", "app", "out"),
  ];
  const contents = execPath.lastIndexOf(`${path.sep}Contents${path.sep}`);
  if (contents >= 0) candidates.push(path.join(execPath.slice(0, contents), "Contents", "Resources", "app", "out"));
  return candidates.find((dir) => fs.existsSync(path.join(dir, "main.js")));
}
