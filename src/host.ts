import * as fs from "fs";
import { statusPath } from "./paths";

export interface Levels {
  ide: number;
  agent: number;
}

export interface ApplyResult {
  id: number;
  ok: boolean;
  ide: number;
  agent: number;
  ideCount: number;
  agentCount: number;
  ideWindows: string[];
  agentWindows: string[];
  errors: string[];
  error?: string;
  running?: boolean;
}

export function readOpacityStatus(): ApplyResult | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(statusPath(), "utf8")) as {
      running?: boolean;
      ide?: number;
      agent?: number;
      ideWindows?: string[];
      agentWindows?: string[];
      error?: string;
    };
    const ideWindows = parsed.ideWindows ?? [];
    const agentWindows = parsed.agentWindows ?? [];
    return {
      id: 0,
      ok: !parsed.error,
      ide: parsed.ide ?? 100,
      agent: parsed.agent ?? 100,
      ideCount: ideWindows.length,
      agentCount: agentWindows.length,
      ideWindows,
      agentWindows,
      errors: parsed.error ? [parsed.error] : [],
      error: parsed.error,
      running: parsed.running === true,
    };
  } catch {
    return undefined;
  }
}
