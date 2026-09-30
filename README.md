# Cursor Opacity

Make the Cursor IDE and the Cursor Agents window see-through. Every background and border fades, including buttons, inputs, tabs, and bars. Text and icons stay fully opaque, and the desktop behind shows through sharply with no blur.

Each window has its own percent, from 15% to 100%. Changes apply immediately and load every time Cursor starts, including when you only use the Agents window.

## Install

1. Download `cursor-opacity-<version>.vsix` from the [latest release](https://github.com/AdamMcWilliam/cursor-opacity/releases/latest).
2. In Cursor, open the Command Palette and run **Extensions: Install from VSIX...**, then pick the file. Or run `cursor --install-extension cursor-opacity-<version>.vsix`.
3. Open a Cursor IDE window once. The extension attaches to the running Cursor right away and adds itself to Cursor's startup, so after this the Agents window fades on launch without the IDE.

## Controls

In any Cursor window, including Cursor Agents:

- **Ctrl+Alt+O** (Cmd+Alt+O on macOS) opens a panel with both percent bars and a reset button. Press it again, press Esc, or click outside to close it.
- **Ctrl+Alt+=** and **Ctrl+Alt+-** change the focused window by 5%.

In the IDE, the **Opacity** icon in the activity bar has the same bars.

## How it works

Cursor extensions can't change window transparency, and they don't run in the Agents window, so this extension adds one line to Cursor's `resources/app/out/main.js` that loads a small runtime when Cursor starts. The runtime makes each window's native background transparent and fades page background and border colors to your percent. It never changes text or icon colors.

Cursor updates replace `main.js`. When Cursor quits, a small guard process waits a few minutes for an update and adds the line back if one ran. If the fade ever doesn't load after an update, open the IDE once.

Settings are stored in `cursor-opacity.json` in Cursor's user data folder (`%APPDATA%\Cursor` on Windows, `~/Library/Application Support/Cursor` on macOS, `~/.config/Cursor` on Linux).

## Platform notes

- **Windows:** fully supported.
- **macOS:** if Cursor lives in a folder you can't write to, the startup hook can't be installed. Opacity still works while the IDE has attached it, but won't load on launch.
- **Linux:** windows need to be created transparent, so the first fade needs one full restart of Cursor. Some window managers don't support transparency.

## Uninstall

Run **Cursor Opacity: Remove From Cursor Startup** from the Command Palette, then uninstall the extension. Uninstalling also removes the startup line the next time Cursor restarts.

If Cursor ever fails to start, open `resources/app/out/main.js` in Cursor's install folder, delete the last line `import"./cursor-opacity-runtime.mjs";`, and delete the `cursor-opacity-*` files beside it.

## Build from source

```sh
npm install
npm run package
```

This produces `cursor-opacity-<version>.vsix` in the project folder.

## License

MIT
