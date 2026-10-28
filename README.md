# keep-terminal-vscode

A VS Code extension that brings back your terminals, with their custom names and working directories, when a workspace is reopened.

## What VS Code already does

VS Code keeps terminals by default (`terminal.integrated.enablePersistentSessions: true`):

- **Window reload**: it reconnects to the same running process.
- **App restart**: it restores the scrollback and working directory and starts a *new* shell. Terminals you renamed keep their names.

There are gaps:

| Gap | Cause |
| --- | --- |
| Closing one window (not the last one, without Quit) loses its terminals | `persistentSessionReviveProcess` defaults to `onExit`. Use `onExitAndWindowClose`. |
| Terminals sometimes don't come back | Saving at shutdown has a time limit and can be cut short. |
| Nothing comes back | `enablePersistentSessions` or revive is turned off. |
| Running programs (dev servers, ssh, REPLs) don't come back | Processes can't survive an app restart. Only the shell is started again. |

## What this extension adds

- It records each workspace's terminals while you work: custom name, current folder, shell path and arguments. Saving happens on terminal events and every 5 seconds, so it doesn't rely on shutdown going smoothly.
- On startup it waits for VS Code's own restore to finish, then creates only the saved terminals that are still missing. It doesn't create duplicates.
- **Keep Terminal: Apply Recommended Built-in Terminal Settings** turns on persistent sessions and sets revive to `onExitAndWindowClose`. VS Code's own restore brings back split layout, colors and icons, which extensions can't read. If these settings aren't set yet, the extension offers to apply them on startup. Choose *Don't Ask Again* or set `keepTerminal.suggestBuiltinSettings: false` to stop the prompt.
- **Keep Terminal: Restore Saved Terminals** / **Forget Saved Terminals** are manual controls.

Settings: `keepTerminal.autoRestore` (default `true`), `keepTerminal.suggestBuiltinSettings` (default `true`), `keepTerminal.restoreDelayMs` (default `2000`).

### Limitations

- The extension API has no rename event and can't tell a rename apart from a title the shell sets. A name counts as custom when it isn't the shell's default title (`pwsh`, `bash`, ...). Titles that appear while a command is running are ignored when shell integration is active.
- It can't restore split layout, tab order, colors or icons changed in the UI, terminals owned by other extensions, or running processes.
- **Tab order:** the API doesn't report tab order, so tabs you dragged into a new position aren't seen. It also can't place a new terminal at a given position, so new terminals always open last. VS Code's own restore keeps your exact order. If VS Code restores no terminals, the extension recreates them in the order they were first created. If VS Code restores only some, the missing ones are added at the end.

## Develop

```sh
npm install
npm test          # compile + unit tests
npm run package   # builds keep-terminal-<version>.vsix
```

Press F5 to launch an Extension Development Host. To install the build, run `code --install-extension keep-terminal-0.1.0.vsix`.
