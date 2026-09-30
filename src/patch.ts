export const RUNTIME_IMPORT = 'import"./cursor-opacity-runtime.mjs";';
export const TRANSPARENT_OPTION = "transparent:globalThis.__cursorOpacityWantsTransparent===!0";

const WINDOW_ANCHOR =
  "experimentalDarkMode:!0};if(n.isGlassWindow===!0&&(m.minHeight=Um.HEIGHT_GLASS";

export interface PatchResult {
  next: string;
  changed: boolean;
  anchored: boolean;
}

export function patchMainJs(source: string): PatchResult {
  let next = source;
  let changed = false;
  const anchored = source.includes(WINDOW_ANCHOR) || source.includes(TRANSPARENT_OPTION);
  if (!next.includes(TRANSPARENT_OPTION) && next.includes(WINDOW_ANCHOR)) {
    next = next.replace(
      WINDOW_ANCHOR,
      `experimentalDarkMode:!0,${TRANSPARENT_OPTION}};if(n.isGlassWindow===!0&&(m.minHeight=Um.HEIGHT_GLASS`
    );
    changed = true;
  }
  if (!next.includes(RUNTIME_IMPORT)) {
    if (!next.endsWith("\n")) next += "\n";
    next += `${RUNTIME_IMPORT}\n`;
    changed = true;
  }
  return { next, changed, anchored };
}

export function unpatchMainJs(source: string): string {
  return source
    .replace(`,${TRANSPARENT_OPTION}`, "")
    .replace(new RegExp(`\\n?${RUNTIME_IMPORT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`), "\n");
}
