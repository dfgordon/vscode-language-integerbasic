import * as vsserv from 'vscode-languageserver/node';
import * as vsdoc from 'vscode-languageserver-textdocument';
import * as diag from './diagnostics';
import * as comm from './commands';
import * as hov from './hovers';
import * as compl from './completions';
import * as lxbase from './langExtBase';
import * as Parser from 'web-tree-sitter';
import { defaultSettings } from './settings';

let globalSettings = defaultSettings;
let TSInitResult: [Parser, Parser.Language];
let diagnosticTool: diag.DiagnosticProvider;
let hoverTool: hov.HoverProvider;
let statementTool: compl.StatementCompletionProvider;
let addressTool: compl.AddressCompletionProvider;
let lineCompleter: compl.LineCompletionProvider;
let tokenizer: comm.Tokenizer;
let renumberer: comm.LineNumberTool;

export interface Lines {
	rem: string | undefined;
	primary: vsserv.Range;
	gosubs: vsserv.Range[];
	gotos: vsserv.Range[];
}

/** Pack all information about a variable
 * There are 3 kinds: integers, integer arrays, and strings.
 * A string is an array of characters.
 * There are no arrays of strings.
 * There are two namespaces:
 * 1. Integers and integer arrays share a namespace (A=1 and A(0)=1 refer to the same memory)
 * 2. Strings have their own namespace (A$ = "HELLO" and A=0 refer to different memory)
 * When a string is subscripted, we also label it as an array (`isArray=true`), but this really
 * should be understood as a substring (to repeat, no arrays of strings).
 */
export interface Variable {
	dec: vsserv.Range[];
	def: vsserv.Range[];
	ref: vsserv.Range[];
	isArray: boolean;
	isString: boolean;
	case: Set<string>;
}

export class DocSymbols {
	lines = new Map<number, Lines>();
	vars = new Map<string,Variable>();
}

export let docSymbols = new DocSymbols();

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = vsserv.createConnection(vsserv.ProposedFeatures.all);
const logger: lxbase.Logger = connection.console;

// Create a simple text document manager.
const documents: vsserv.TextDocuments<vsdoc.TextDocument> = new vsserv.TextDocuments(vsdoc.TextDocument);

async function startServer()
{
	documents.listen(connection);
	connection.listen();
	TSInitResult = await lxbase.TreeSitterInit();
	globalSettings = await connection.workspace.getConfiguration('integerbasic');
	diagnosticTool = new diag.DiagnosticProvider(TSInitResult, logger, globalSettings);
	hoverTool = new hov.HoverProvider(TSInitResult, logger, globalSettings);
	statementTool = new compl.StatementCompletionProvider(TSInitResult, logger, globalSettings);
	addressTool = new compl.AddressCompletionProvider(TSInitResult, logger, globalSettings);
	lineCompleter = new compl.LineCompletionProvider(TSInitResult, logger, globalSettings);
	tokenizer = new comm.Tokenizer(TSInitResult, logger, globalSettings);
	renumberer = new comm.LineNumberTool(TSInitResult, logger, globalSettings);
}

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: vsserv.InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: vsserv.InitializeResult = {
		capabilities: {
			textDocumentSync: vsserv.TextDocumentSyncKind.Full,
			completionProvider: {
				resolveProvider: false,
				triggerCharacters: ['\n',' ']
			},
			declarationProvider: true,
			definitionProvider: true,
			referencesProvider: true,
			hoverProvider: true,
			documentSymbolProvider: true,
			renameProvider: true
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(vsserv.DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

connection.onDidChangeConfiguration(change => {
	connection.workspace.getConfiguration('integerbasic').then(settings => {
		globalSettings = settings;
		diagnosticTool.configure(globalSettings);
		hoverTool.configure(globalSettings);
		statementTool.configure(globalSettings);
		addressTool.configure(globalSettings);
		lineCompleter.configure(globalSettings);
		tokenizer.configure(globalSettings);
		renumberer.configure(globalSettings);
	}).then(() => {
		// Revalidate all open text documents
		// TODO: for this to work we might need to store DocSymbols for all open documents
		documents.all().forEach(validateTextDocument);
	});
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

connection.onDeclaration(params => {
	for (const [name, vars] of docSymbols.vars) {
		for (const rng of vars.ref)
			if (lxbase.rangeContainsPos(rng, params.position)) {
				const ans = new Array<vsserv.Location>();
				for (const decRange of vars.dec)
					ans.push(vsserv.Location.create(params.textDocument.uri, decRange));
				return ans;
			}
	}
});

connection.onDefinition(params => {
	for (const [num, line] of docSymbols.lines) {
		for (const rng of line.gosubs.concat(line.gotos))
			if (lxbase.rangeContainsPos(rng, params.position))
				return [vsserv.Location.create(params.textDocument.uri, line.primary)];
	}
	for (const [name, vars] of docSymbols.vars) {
		for (const rng of vars.ref)
			if (lxbase.rangeContainsPos(rng, params.position)) {
				const ans = new Array<vsserv.Location>();
				for (const defRange of vars.def)
					ans.push(vsserv.Location.create(params.textDocument.uri, defRange));
				return ans;
			}
	}
});

connection.onDocumentSymbol(params => {
	const ans = new Array<vsserv.DocumentSymbol>();
	for (const [num, line] of docSymbols.lines) {
		if (line.gosubs.length > 0)
			ans.push(vsserv.DocumentSymbol.create(num.toString(), line.rem, vsserv.SymbolKind.Function, line.primary, line.primary));
		else if (line.gotos.length > 0)
			ans.push(vsserv.DocumentSymbol.create(num.toString(), line.rem, vsserv.SymbolKind.Constant, line.primary, line.primary));
	}
	for (const [name, vars] of docSymbols.vars) {
		for (const rng of vars.dec) {
			if (vars.isString)
				ans.push(vsserv.DocumentSymbol.create(name, undefined, vsserv.SymbolKind.String, rng, rng));
			else if (vars.isArray)
				ans.push(vsserv.DocumentSymbol.create(name, undefined, vsserv.SymbolKind.Array, rng, rng));
		}
		for (const rng of vars.def) {
			if (vars.isString)
				ans.push(vsserv.DocumentSymbol.create(name, undefined, vsserv.SymbolKind.String, rng, rng));
			else if (vars.isArray)
				ans.push(vsserv.DocumentSymbol.create(name, undefined, vsserv.SymbolKind.Array, rng, rng));
			else
				ans.push(vsserv.DocumentSymbol.create(name, undefined, vsserv.SymbolKind.Variable, rng, rng));
		}
	}
	return ans;
});

function referencesFromVariable(map: Map<string,Variable>, params: vsserv.ReferenceParams): Array<vsserv.Location> | undefined {
	for (const [name, vars] of map) {
		const ans = new Array<vsserv.Location>();
		let clicked = false;
		for (const rng of vars.ref) {
			ans.push(vsserv.Location.create(params.textDocument.uri, rng));
			clicked = clicked || lxbase.rangeContainsPos(rng, params.position);
		}
		if (clicked)
			return ans;
	}
}

connection.onReferences(params => {
	for (const [num, line] of docSymbols.lines) {
		const ans = new Array<vsserv.Location>();
		let clicked = false;
		for (const rng of line.gosubs.concat(line.gotos).concat(line.primary)) {
			ans.push(vsserv.Location.create(params.textDocument.uri, rng));
			clicked = clicked || lxbase.rangeContainsPos(rng, params.position);
		}
		if (clicked)
			return ans;
	}
	const ans = referencesFromVariable(docSymbols.vars, params);
	if (ans)
		return ans;
});

connection.onHover(params => {
	if (hoverTool)
	{
		return hoverTool.provideHover(documents.get(params.textDocument.uri), params.position);
	}
});

connection.onCompletion((params: vsserv.CompletionParams): vsserv.CompletionItem[] => {
	let ans = new Array<vsserv.CompletionItem>();
	if (statementTool && params.context?.triggerKind==1)
	{
		ans = ans.concat(statementTool.provideCompletionItems(documents.get(params.textDocument.uri), params.position));	
	}
	if (addressTool && params.context?.triggerCharacter==' ')
	{
		ans = ans.concat(addressTool.provideCompletionItems(documents.get(params.textDocument.uri), params.position));	
	}
	if (lineCompleter && params.context?.triggerCharacter=='\n')
	{
		ans = ans.concat(lineCompleter.provideCompletionItems(documents.get(params.textDocument.uri), params.position));	
	}
	return ans;
});

function findRenamable(map: Map<string,Variable>, params: vsserv.RenameParams): Array<vsserv.Location> | undefined {
	for (const [name, vars] of map) {
		const ans = new Array<vsserv.Location>();
		let clicked = false;
		for (const rng of vars.ref) {
			ans.push(vsserv.Location.create(params.textDocument.uri, rng));
			clicked = clicked || lxbase.rangeContainsPos(rng, params.position);
		}
		if (clicked) {
			return ans;
		}
	}
}

connection.onRenameRequest((params: vsserv.RenameParams): vsserv.WorkspaceEdit | undefined => {
	const locs = findRenamable(docSymbols.vars, params);
	if (locs) {
		const edits = new Array<vsserv.TextEdit>();
		for (const loc of locs) {
			edits.push(vsserv.TextEdit.replace(loc.range, params.newName));
		}
		return { changes: { [params.textDocument.uri]: edits } };
	}
});

connection.onExecuteCommand((params: vsserv.ExecuteCommandParams): any => {
	if (params.command == 'integerbasic.tokenize') {
		if (params.arguments)
			return tokenizer.tokenize(params.arguments[0]);
	}
	else if (params.command == 'integerbasic.detokenize') {
		if (params.arguments)
			return tokenizer.detokenize(params.arguments);
	}
	else if (params.command == 'integerbasic.renumber') {
		if (params.arguments) {
			const doc: vsserv.TextDocumentItem = params.arguments[0];
			const sel: vsserv.Range | null = params.arguments[1];
			const start: string = params.arguments[2];
			const step: string = params.arguments[3];
			const updateRefs: boolean = params.arguments[4];
			const result = renumberer.renumber(doc, sel, start, step, updateRefs);
			if (result[0])
				connection.workspace.applyEdit({ documentChanges: [result[0]] });
			return result[1];
		}
	}
});

async function validateTextDocument(textDocument: vsdoc.TextDocument): Promise<void> {
	while (!diagnosticTool) {
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	const diagnostics = diagnosticTool.update(textDocument);
	docSymbols = diagnosticTool.workingSymbols;
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}
startServer();
