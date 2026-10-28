// Pure helpers (no `vscode` import) so they can be unit tested with node:test.

export interface SavedTerminal {
	/** Set only when the user renamed the terminal; otherwise the shell picks its own title. */
	customName?: string;
	cwd?: string;
	shellPath?: string;
	shellArgs?: string[] | string;
}

// Titles a shell or VS Code shows on its own, which must not be mistaken for a rename.
const GENERIC_TITLES = new Set([
	'pwsh', 'powershell', 'windows powershell', 'cmd', 'command prompt',
	'bash', 'git bash', 'zsh', 'sh', 'fish', 'nu', 'wsl', 'terminal',
]);

export function shellTitle(shellPath: string | undefined): string | undefined {
	const base = shellPath?.split(/[\\/]/).pop()?.replace(/\.exe$/i, '').toLowerCase();
	return base || undefined;
}

/** Whether `name` looks like a user-chosen name rather than the shell's default title. */
export function isCustomName(name: string, shellPath: string | undefined): boolean {
	const normalized = name.trim().toLowerCase();
	return normalized !== '' && normalized !== shellTitle(shellPath) && !GENERIC_TITLES.has(normalized);
}

/**
 * Returns the saved terminals that have no counterpart among the terminals already open
 * (for example, the ones VS Code revived itself), preserving the saved order.
 * Renamed terminals claim an open terminal with the same name first; the rest claim any leftover.
 * A saved name may be a title a program set (e.g. Claude Code's "✳ task") that is gone after revive,
 * so renamed terminals without a name match also claim leftovers before being recreated.
 */
export function planRestore(saved: SavedTerminal[], openNames: string[]): SavedTerminal[] {
	const remaining = openNames.map(n => n.trim().toLowerCase());
	const claim = (predicate: (name: string) => boolean): boolean => {
		const index = remaining.findIndex(predicate);
		if (index < 0) {
			return false;
		}
		remaining.splice(index, 1);
		return true;
	};

	const matched = saved.map(s => s.customName !== undefined && claim(n => n === s.customName!.trim().toLowerCase()));
	saved.forEach((s, i) => {
		if (s.customName === undefined) {
			matched[i] = claim(() => true);
		}
	});
	saved.forEach((_, i) => {
		if (!matched[i]) {
			matched[i] = claim(() => true);
		}
	});
	return saved.filter((_, i) => !matched[i]);
}

/** Turns an MSYS/Git Bash style path ("/c/foo" or "\c\foo") into a Windows one ("C:\foo"). */
export function msysToWindowsPath(p: string): string | undefined {
	const match = /^[\\/]([a-zA-Z])(?:[\\/](.*))?$/.exec(p);
	return match ? `${match[1].toUpperCase()}:\\${(match[2] ?? '').replace(/\//g, '\\')}` : undefined;
}

export function sameSnapshot(a: SavedTerminal[], b: SavedTerminal[]): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
