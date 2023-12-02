import * as vscode from 'vscode';
import Parser from 'web-tree-sitter';
import * as path from 'path';

export const VariableTypes = [
	'str_name',
	'int_name',
];

export const WalkerOptions = {
	gotoChild: 0,
	gotoSibling: 1,
	gotoParentSibling: 2,
	exit: 3
} as const;

export type WalkerChoice = typeof WalkerOptions[keyof typeof WalkerOptions];

export function curs_to_range(curs: Parser.TreeCursor,row: number): vscode.Range
{
	const start_pos = new vscode.Position(row+curs.startPosition.row, curs.startPosition.column);
	const end_pos = new vscode.Position(row+curs.endPosition.row, curs.endPosition.column);
	return new vscode.Range(start_pos, end_pos);
}

export async function TreeSitterInit(): Promise<[Parser,Parser.Language]>
{
	await Parser.init({
		locateFile(scriptName: string, scriptDirectory: string) {
			return path.join(__dirname,'tree-sitter.wasm');
		}
	});
	const parser = new Parser();
	const IntegerBasic = await Parser.Language.load(path.join(__dirname,'tree-sitter-integerbasic.wasm'));
	parser.setLanguage(IntegerBasic);
	return [parser,IntegerBasic];
}

export class LangExtBase
{
	parser : Parser;
	IntegerBasic : Parser.Language;
	config : vscode.WorkspaceConfiguration;
	constructor(TSInitResult : [Parser,Parser.Language])
	{
		this.parser = TSInitResult[0];
		this.IntegerBasic = TSInitResult[1];
		this.config = vscode.workspace.getConfiguration('integerbasic');
	}
	verify_document() : {ed:vscode.TextEditor,doc:vscode.TextDocument} | undefined
	{
		const textEditor = vscode.window.activeTextEditor;
		if (!textEditor)
			return undefined;
		const document = textEditor.document;
		if (!document || document.languageId!='integerbasic')
			return undefined;
		return {ed:textEditor,doc:document};
	}
	parse(txt: string,append: string) : Parser.Tree
	{
		return this.parser.parse(txt+append);
	}
	walk(syntaxTree: Parser.Tree,visit: (node: Parser.TreeCursor) => WalkerChoice)
	{
		const curs = syntaxTree.walk();
		let choice : WalkerChoice = WalkerOptions.gotoChild;
		do
		{
			if (choice==WalkerOptions.gotoChild && curs.gotoFirstChild())
				choice = visit(curs);
			else if (choice==WalkerOptions.gotoParentSibling && curs.gotoParent() && curs.gotoNextSibling())
				choice = visit(curs);
			else if (choice==WalkerOptions.gotoSibling && curs.gotoNextSibling())
				choice = visit(curs);
			else if (curs.gotoNextSibling())
				choice = visit(curs);
			else if (curs.gotoParent())
				choice = WalkerOptions.gotoSibling;
			else
				choice = WalkerOptions.exit;
		} while (choice!=WalkerOptions.exit);
	}
}
