import * as vscode from 'vscode';
import * as lxbase from './langExtBase';
import { TSHoverProvider } from './hovers';
import { TSDiagnosticProvider } from './diagnostics';
import { TSSemanticTokensProvider, legend } from './semanticTokens';
import * as completions from './completions';
import * as com from './commands';

/// This function runs when the extension loads.
/// It creates the parser object and sets up the providers.
export function activate(context: vscode.ExtensionContext)
{
	lxbase.TreeSitterInit().then( TSInitResult =>
	{
		const selector = { language: 'integerbasic' };
		const collection = vscode.languages.createDiagnosticCollection('integerbasic-file');
		const diagnostics = new TSDiagnosticProvider(TSInitResult);
		const tokens = new TSSemanticTokensProvider(TSInitResult);
		const hovers = new TSHoverProvider(TSInitResult);
		const snippetCompletions = new completions.TSCompletionProvider();
		const lineCompletions = new completions.LineCompletionProvider();
		const addressCompletions = new completions.AddressCompletionProvider();
		const renumberer = new com.RenumberTool(TSInitResult);
		const viiEntry = new com.ViiEntryTool(TSInitResult);
		const tokenizer = new com.TokenizationTool(TSInitResult);
		if (vscode.window.activeTextEditor)
		{
			diagnostics.update(vscode.window.activeTextEditor.document, collection);
		}
		vscode.languages.registerDocumentSemanticTokensProvider(selector,tokens,legend);
		vscode.languages.registerHoverProvider(selector,hovers);
		vscode.languages.registerCompletionItemProvider(selector,snippetCompletions);
		vscode.languages.registerCompletionItemProvider(selector,lineCompletions,'\n');
		vscode.languages.registerCompletionItemProvider(selector,addressCompletions,' ');

		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.runNewVii",viiEntry.runNewVirtualII,viiEntry));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.runFrontVii",viiEntry.runFrontVirtualII,viiEntry));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.enterNewVii",viiEntry.enterNewVirtualII,viiEntry));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.enterFrontVii",viiEntry.enterFrontVirtualII,viiEntry));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.getFrontVii",tokenizer.getFrontVirtualII,tokenizer));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.getAppleWinSaveState",tokenizer.getAppleWinSaveState,tokenizer));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.setAppleWinSaveState",tokenizer.setAppleWinSaveState,tokenizer));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.showTokenizedProgram",tokenizer.showTokenizedProgram,tokenizer));
		context.subscriptions.push(vscode.commands.registerCommand("integerbasic.renumber",renumberer.command,renumberer));
		context.subscriptions.push(vscode.commands.registerTextEditorCommand("integerbasic.commentLines",com.commentLinesCommand));

		context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor)
				diagnostics.update(editor.document, collection);
		}));
		context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(editor => {
			if (editor)
				diagnostics.update(editor.document, collection);
		}));
		context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(listener => {
			if (listener)
				addressCompletions.rebuild();
		}));
	});
}
