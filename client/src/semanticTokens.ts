import * as vscode from 'vscode';
import Parser from 'web-tree-sitter';
import * as lxbase from './langExtBase';

const tokenTypes = [
	'comment', 'string', 'keyword', 'number', 'regexp', 'operator', 'namespace',
	'type', 'struct', 'class', 'interface', 'enum', 'typeParameter', 'function',
	'method', 'decorator', 'macro', 'variable', 'parameter', 'property', 'label'
];
const tokenModifiers = [
	'declaration', 'documentation', 'readonly', 'static', 'abstract', 'deprecated',
	'modification', 'async'
];

export const legend = new vscode.SemanticTokensLegend(tokenTypes,tokenModifiers);

export class TSSemanticTokensProvider extends lxbase.LangExtBase implements vscode.DocumentSemanticTokensProvider
{
	tokensBuilder: vscode.SemanticTokensBuilder = new vscode.SemanticTokensBuilder(legend);
	row: number = 0;
	process_escapes(curs: Parser.TreeCursor,rng: vscode.Range,typ: string) {
		const patt = /\\x[0-9a-fA-F][0-9a-fA-F]/g;
		let match;
		let lastPos = rng.start.character;
		while ((match = patt.exec(curs.nodeText)) != null) {
			const newPos = rng.start.character + match.index;
			const emb = new vscode.Range(
				new vscode.Position(rng.start.line, newPos),
				new vscode.Position(rng.start.line, rng.start.character + patt.lastIndex)
			);
			if (newPos > lastPos) {
				const outer = new vscode.Range(
					new vscode.Position(rng.start.line, lastPos),
					new vscode.Position(rng.start.line, newPos)
				);
				this.tokensBuilder.push(outer, typ, []);
			}
			this.tokensBuilder.push(emb, "regexp", []);
			lastPos = rng.start.character + patt.lastIndex;
		}
		const outer = new vscode.Range(
			new vscode.Position(rng.start.line, lastPos),
			rng.end
		);
		this.tokensBuilder.push(outer, typ, []);
	}
	process_node(curs: Parser.TreeCursor): lxbase.WalkerChoice
	{
		const rng = lxbase.curs_to_range(curs,this.row);
		if (["comment_text","statement_rem"].indexOf(curs.nodeType)>-1) // must precede statement handler
		{
			this.process_escapes(curs, rng, "comment");
			//this.tokensBuilder.push(rng,"comment",[]);
			return lxbase.WalkerOptions.gotoSibling;
		}
		if (curs.nodeType.slice(0,3)=="op_")
		{
			this.tokensBuilder.push(rng,"keyword",[]);
			return lxbase.WalkerOptions.gotoSibling;
		}
		if (curs.nodeType.slice(0,10)=="statement_")
		{
			this.tokensBuilder.push(rng,"keyword",[]);
			return lxbase.WalkerOptions.gotoSibling;
		}
		if (curs.nodeType.slice(0,6)=="fcall_")
		{
			this.tokensBuilder.push(rng,"function",[]);
			return lxbase.WalkerOptions.gotoSibling;
		}
		if (curs.nodeType=="linenum")
		{
			this.tokensBuilder.push(rng,"macro",[]);
			return lxbase.WalkerOptions.gotoSibling;
		}
		if (curs.nodeType=="string")
		{
			this.process_escapes(curs, rng, "string");
			//this.tokensBuilder.push(rng,"string",[]);
			return lxbase.WalkerOptions.gotoSibling;
		}
		if (curs.nodeType=="integer")
		{
			const prev = curs.currentNode().previousNamedSibling;
			if (prev && (prev.type=="statement_goto" || prev.type=="statement_gosub" || prev.type=="statement_then_line"))
				this.tokensBuilder.push(rng,"macro",[]);
			else
				this.tokensBuilder.push(rng,"number",[]);
			return lxbase.WalkerOptions.gotoSibling;
		}
		if (lxbase.VariableTypes.indexOf(curs.nodeType)>-1)
		{
			this.tokensBuilder.push(rng,"variable",[]);
			return lxbase.WalkerOptions.gotoChild;
		}
		return lxbase.WalkerOptions.gotoChild;
	}
	provideDocumentSemanticTokens(document:vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens>
	{
		this.tokensBuilder = new vscode.SemanticTokensBuilder(legend);

		const lines = document.getText().split(/\r?\n/);
		for (this.row = 0; this.row < lines.length; this.row++) {
			const syntaxTree = this.parse(lines[this.row],"\n");
			this.walk(syntaxTree, this.process_node.bind(this));
		}
		return this.tokensBuilder.build();
	}
}