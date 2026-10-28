import * as fs from 'fs';
import * as vscode from 'vscode';
import { SavedTerminal, isCustomName, msysToWindowsPath, planRestore, sameSnapshot } from './snapshot';

const STORAGE_KEY = 'keepTerminal.terminals';
const DONT_SUGGEST_KEY = 'keepTerminal.dontSuggestBuiltinSettings';
// Renames fire no API event, so the snapshot is also refreshed on a timer.
const SAVE_INTERVAL_MS = 5000;
const MAX_STARTUP_WAIT_MS = 15000;

export function activate(context: vscode.ExtensionContext): void {
	// Saving stays off until startup restore is done, so the startup state can't overwrite the snapshot.
	let saving = false;
	const runningCommands = new WeakMap<vscode.Terminal, number>();
	const lastCustomName = new WeakMap<vscode.Terminal, string | undefined>();

	const describe = (terminal: vscode.Terminal): SavedTerminal | undefined => {
		const options = terminal.creationOptions;
		// Extension-owned pseudoterminals can't be recreated from outside their extension.
		if ('pty' in options || options.hideFromUser || options.isTransient) {
			return undefined;
		}
		// While a command runs, the title shows that program (e.g. "node"), not a rename, so keep the last idle value.
		if (!runningCommands.get(terminal)) {
			const shellPath = options.shellPath ?? vscode.env.shell;
			lastCustomName.set(terminal, isCustomName(terminal.name, shellPath) ? terminal.name : undefined);
		}
		const initialCwd = typeof options.cwd === 'string' ? options.cwd : options.cwd?.fsPath;
		return {
			customName: lastCustomName.get(terminal),
			cwd: terminal.shellIntegration?.cwd?.fsPath ?? initialCwd,
			shellPath: options.shellPath,
			shellArgs: options.shellArgs,
		};
	};

	const save = (): void => {
		if (!saving) {
			return;
		}
		const snapshot = vscode.window.terminals.flatMap(t => describe(t) ?? []);
		if (!sameSnapshot(context.workspaceState.get<SavedTerminal[]>(STORAGE_KEY, []), snapshot)) {
			void context.workspaceState.update(STORAGE_KEY, snapshot);
		}
	};

	const interval = setInterval(save, SAVE_INTERVAL_MS);
	context.subscriptions.push(
		{ dispose: () => clearInterval(interval) },
		vscode.window.onDidOpenTerminal(save),
		vscode.window.onDidChangeActiveTerminal(save),
		vscode.window.onDidChangeTerminalShellIntegration(save),
		vscode.window.onDidCloseTerminal(terminal => {
			// Terminals closing because the window is going away must stay in the snapshot.
			if (terminal.exitStatus?.reason === vscode.TerminalExitReason.Shutdown) {
				saving = false;
				return;
			}
			save();
		}),
		vscode.window.onDidStartTerminalShellExecution(e => {
			runningCommands.set(e.terminal, (runningCommands.get(e.terminal) ?? 0) + 1);
		}),
		vscode.window.onDidEndTerminalShellExecution(e => {
			runningCommands.set(e.terminal, Math.max(0, (runningCommands.get(e.terminal) ?? 1) - 1));
			save();
		}),
		vscode.commands.registerCommand('keepTerminal.restore', () => restore(context)),
		vscode.commands.registerCommand('keepTerminal.clear', async () => {
			await context.workspaceState.update(STORAGE_KEY, []);
			vscode.window.showInformationMessage('Keep Terminal: saved terminals forgotten for this workspace.');
		}),
		vscode.commands.registerCommand('keepTerminal.applyRecommendedSettings', applyRecommendedSettings),
	);

	void suggestRecommendedSettings(context);

	void (async () => {
		const config = vscode.workspace.getConfiguration('keepTerminal');
		if (config.get<boolean>('autoRestore', true)) {
			await waitForTerminalsToSettle(config.get<number>('restoreDelayMs', 2000));
			restore(context);
		}
		saving = true;
		save();
	})();
}

export function deactivate(): void { }

/** Shells like Fish under MSYS2 report "/c/..." paths, which Windows can't open as-is. */
function existingCwd(cwd: string | undefined): string | undefined {
	if (!cwd) {
		return undefined;
	}
	if (fs.existsSync(cwd)) {
		return cwd;
	}
	const converted = process.platform === 'win32' ? msysToWindowsPath(cwd) : undefined;
	return converted && fs.existsSync(converted) ? converted : undefined;
}

function restore(context: vscode.ExtensionContext): void {
	const saved = context.workspaceState.get<SavedTerminal[]>(STORAGE_KEY, []);
	const openNames = vscode.window.terminals.filter(t => !('pty' in t.creationOptions)).map(t => t.name);
	for (const terminal of planRestore(saved, openNames)) {
		vscode.window.createTerminal({
			name: terminal.customName,
			cwd: existingCwd(terminal.cwd),
			shellPath: terminal.shellPath,
			shellArgs: terminal.shellArgs,
		});
	}
}

/** Resolves once no terminal has opened for `quietMs`, so VS Code's own revive finishes before we compare. */
function waitForTerminalsToSettle(quietMs: number): Promise<void> {
	return new Promise(resolve => {
		const finish = () => {
			clearTimeout(quietTimer);
			clearTimeout(maxTimer);
			listener.dispose();
			resolve();
		};
		let quietTimer = setTimeout(finish, quietMs);
		const maxTimer = setTimeout(finish, MAX_STARTUP_WAIT_MS);
		const listener = vscode.window.onDidOpenTerminal(() => {
			clearTimeout(quietTimer);
			quietTimer = setTimeout(finish, quietMs);
		});
	});
}

/**
 * VS Code's own revive restores split layout, colors and icons, which the extension API can't read,
 * so offer to switch it on for every way a window can close.
 */
async function suggestRecommendedSettings(context: vscode.ExtensionContext): Promise<void> {
	if (!vscode.workspace.getConfiguration('keepTerminal').get<boolean>('suggestBuiltinSettings', true)
		|| context.globalState.get<boolean>(DONT_SUGGEST_KEY)) {
		return;
	}
	const terminalConfig = vscode.workspace.getConfiguration('terminal.integrated');
	if (terminalConfig.get<boolean>('enablePersistentSessions') === true
		&& terminalConfig.get<string>('persistentSessionReviveProcess') === 'onExitAndWindowClose') {
		return;
	}
	const enable = 'Enable';
	const never = "Don't Ask Again";
	const choice = await vscode.window.showInformationMessage(
		"Keep Terminal: let VS Code also restore split layout, colors and icons, including when a single window is closed?",
		enable, never);
	if (choice === enable) {
		await applyRecommendedSettings();
	} else if (choice === never) {
		await context.globalState.update(DONT_SUGGEST_KEY, true);
	}
}

async function applyRecommendedSettings(): Promise<void> {
	const terminalConfig = vscode.workspace.getConfiguration('terminal.integrated');
	await terminalConfig.update('enablePersistentSessions', true, vscode.ConfigurationTarget.Global);
	await terminalConfig.update('persistentSessionReviveProcess', 'onExitAndWindowClose', vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage(
		'Keep Terminal: enabled persistent sessions and set revive to "onExitAndWindowClose" in your user settings.');
}
