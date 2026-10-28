import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCustomName, planRestore, shellTitle } from '../snapshot';

test('shellTitle strips directory and .exe', () => {
	assert.equal(shellTitle('C:\\Program Files\\PowerShell\\7\\pwsh.exe'), 'pwsh');
	assert.equal(shellTitle('/bin/zsh'), 'zsh');
	assert.equal(shellTitle(undefined), undefined);
});

test('isCustomName ignores default shell titles', () => {
	assert.equal(isCustomName('pwsh', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'), false);
	assert.equal(isCustomName('PowerShell', undefined), false);
	assert.equal(isCustomName('  ', undefined), false);
	assert.equal(isCustomName('dev server', 'pwsh.exe'), true);
});

test('planRestore creates everything when nothing was revived', () => {
	const saved = [{ customName: 'api' }, {}];
	assert.deepEqual(planRestore(saved, []), saved);
});

test('planRestore skips terminals VS Code already revived', () => {
	const saved = [{ customName: 'api' }, { customName: 'web' }, {}];
	assert.deepEqual(planRestore(saved, ['web', 'pwsh', 'API']), []);
});

test('planRestore lets renamed terminals claim their name before unnamed ones take leftovers', () => {
	const saved = [{}, { customName: 'api' }, { customName: 'web' }];
	// "api" was revived; the fresh default "pwsh" covers the unnamed one; "web" is missing.
	assert.deepEqual(planRestore(saved, ['api', 'pwsh']), [{ customName: 'web' }]);
});
