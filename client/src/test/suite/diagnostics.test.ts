import * as vscode from 'vscode';
import * as assert from 'assert';
import * as path from 'path';

async function diagnosticTester(progName: string, expectedMessages: RegExp[]) {
	while (vscode.window.activeTextEditor)
		await vscode.commands.executeCommand("workbench.action.closeActiveEditor", vscode.window.activeTextEditor.document.uri);
	const progPath = path.resolve(__dirname, '..', '..', '..', '..', 'sample', progName);
	const doc = await vscode.workspace.openTextDocument(progPath);
	const ed = await vscode.window.showTextDocument(doc);
	if (!ed)
		assert.fail('no active text editor');
	let collections: [vscode.Uri,vscode.Diagnostic[]][];
	do {
		collections = vscode.languages.getDiagnostics();
	} while (!collections);
	for (const collection of collections)
	{
		if (collection[0].path!=doc.uri.path)
			continue;
		const diagList = collection[1];
		assert.strictEqual(diagList.length, expectedMessages.length);
		for (let i = 0; i < expectedMessages.length; i++)
			assert.match(diagList[i].message, expectedMessages[i]);
	}
}

describe('Diagnostics', function() {
	it('Long Line', async function () {
		await diagnosticTester('breakout.ibas', [
			/Line may be too long/
		]);
	});
	it('Collisions', async function () {
		await diagnosticTester('test-collisions.ibas', [
			/illegal variable name/,
			/illegal variable name/,
			/illegal variable name/,
			/illegal variable name/,
			/string is never DIM'd/,
			/illegal variable name/,
			/string is never DIM'd/,
			/illegal variable name/,
		]);
	});
	it('Functions', async function () {
		await diagnosticTester('test-functions.ibas', [
			/\(ERROR/,
			/\(ERROR/,
			/\(ERROR/,
			/\(ERROR/,
			/\(ERROR/,
			/\(ERROR/,
		]);
	});
	it('Lines', async function () {
		await diagnosticTester('test-lines.ibas', [
			// first pass
			/Line number out of order/,
			// second pass
			/\(ERROR/,
			/Line does not exist/,
			/Line does not exist/,
			/Line does not exist/,
		]);
	});
	it('Ranges', async function () {
		await diagnosticTester('test-ranges.ibas', [
			/Out of range/,
			/Out of range/,
			/Out of range/,
			/Out of range/,
			/Out of range/,
		]);
	});
	it('Unassigned', async function () {
		await diagnosticTester('test-unassigned.ibas', [
			/variable is never assigned/,
			/variable is never assigned/,
			/variable is never assigned/,
			/variable is never assigned/,
			/variable is never assigned/,
		]);
	});
	it('Undeclared', async function () {
		await diagnosticTester('test-undeclared.ibas', [
			/array is never DIM'd/,
			/variable is never assigned/,
			/array is never DIM'd/,
			/variable is never assigned/,
			/unsubscripted integer array/,
			/variable is never assigned/,
			/string is never DIM'd/,
			/array is never DIM'd/,
			/array is never DIM'd/,
			/variable is never assigned/,
			/unsubscripted integer array/,
		]);
	});
});

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}