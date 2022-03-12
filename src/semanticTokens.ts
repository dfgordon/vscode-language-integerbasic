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
	tokensBuilder : vscode.SemanticTokensBuilder = new vscode.SemanticTokensBuilder(legend);
	process_node(curs: Parser.TreeCursor): lxbase.WalkerChoice
	{
		const rng = this.curs_to_range(curs);
		if (["comment_text","statement_rem"].indexOf(curs.nodeType)>-1) // must precede statement handler
		{
			this.tokensBuilder.push(rng,"comment",[]);
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
			this.tokensBuilder.push(rng,"string",[]);
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

		const tree = this.parse(document.getText()+"\n");
		this.walk(tree,this.process_node.bind(this));
		return this.tokensBuilder.build();
	}
}