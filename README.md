# Cursor Opacity

Make the Cursor IDE and the Cursor Agents window see-through. Every background and border fades, including buttons, inputs, tabs, and bars. Text and icons stay fully opaque, and the desktop behind shows through sharply with no blur. Each window has its own percent bar. The values are saved and applied again every time Cursor starts.

Works on Windows, macOS, and Linux.

## Controls

In any Cursor window, including Cursor Agents:

- **Ctrl+Alt+O** (Cmd+Alt+O on macOS) opens a small panel with both percent bars and a reset button. Press it again, press Esc, or click outside to close it.
- **Ctrl+Alt+=** and **Ctrl+Alt+-** change the focused window by 5%.

In the IDE, the **Opacity** icon in the activity bar has the same bars.

Changes apply immediately and load the next time Cursor starts.

## How it starts

Installing the extension adds one line to Cursor's `resources/app/out/main.js` that loads the opacity runtime when Cursor starts, so the IDE never has to be opened. Cursor updates replace that file. When Cursor quits, a small guard waits for an update to finish and adds the line back.

## Install

```powershell
npm install
npm run compile
npx @vscode/vsce package --allow-missing-repository
cursor --install-extension .\cursor-opacity-0.4.0.vsix
```

Open the IDE once after installing so the extension can add the startup line. It also attaches to the running Cursor right away.

If Cursor does not start after that, open `resources/app/out/main.js` and remove the line `import"./cursor-opacity-runtime.mjs";`, then delete `cursor-opacity-runtime.mjs` beside it.
