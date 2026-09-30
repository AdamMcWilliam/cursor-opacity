import * as fs from "fs";
import { appOutDirFromExecutable, removeHook } from "./hook";
import { statePath, statusPath } from "./paths";

// Runs as plain Node when the extension is uninstalled, after Cursor restarts.
const outDir = appOutDirFromExecutable(process.execPath);
if (outDir) removeHook(outDir);
for (const file of [statePath(), statusPath()]) fs.rmSync(file, { force: true });
