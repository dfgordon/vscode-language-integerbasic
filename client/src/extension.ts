import * as vscode from 'vscode';
import * as tok from './semanticTokens';
import * as com from './commands';
import * as dimg from './diskImage';
import * as lxbase from './langExtBase';
import * as vsclnt from 'vscode-languageclient/node';
import * as path from 'path';

export let client: vsclnt.LanguageClient;

/// This function runs when the extension loads.
/// It creates the parser object and sets up the providers.
export function activate(context: vscode.ExtensionContext)
{
	const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
	const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };
	const serverOptions: vsclnt.ServerOptions = {
		run: { module: serverModule, transport: vsclnt.TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: vsclnt.TransportKind.ipc,
			options: debugOptions
		}
	};
	const clientOptions: vsclnt.LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'integerbasic' }],
		synchronize: {
			fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	client = new vsclnt.LanguageClient('integerbasic', 'Integer BASIC', serverOptions, clientOptions);
	client.start();
	lxbase.TreeSitterInit().then( TSInitResult =>
	{
		const selector = { language: 'integerbasic' };
		const renumberer = new com.RenumberTool(TSInitResult);
		const viiEntry = new com.ViiEntryTool(TSInitResult);
		const appleWin = new com.AppleWinTool(TSInitResult);
		const a2kit = new dimg.A2KitTool(TSInitResult);
		const tokenizer = new com.TokenizationTool(TSInitResult);
		const highlighter = new tok.TSSemanticTokensProvider(TSInitResult);
		vscode.languages.registerDocumentSemanticTokensProvider(selector, highlighter, tok.legend);

		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.runNewVii",viiEntry.runNewVirtualII,viiEntry));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.runFrontVii",viiEntry.runFrontVirtualII,viiEntry));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.enterNewVii",viiEntry.enterNewVirtualII,viiEntry));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.enterFrontVii",viiEntry.enterFrontVirtualII,viiEntry));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.getFrontVii",viiEntry.getFrontVirtualII,viiEntry));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.getAppleWinSaveState",appleWin.getAppleWinSaveState,appleWin));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.setAppleWinSaveState",appleWin.setAppleWinSaveState,appleWin));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.getFromDiskImage", a2kit.getIntegerFile, a2kit));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.saveToDiskImage", a2kit.putIntegerFile, a2kit));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.showTokenizedProgram",tokenizer.showTokenizedProgram,tokenizer));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.renumber",renumberer.command,renumberer));
		context.subscriptions.push(vscode.commands.registerTextEditorCommand("integerbasic.commentLines",com.commentLinesCommand));
	});
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
