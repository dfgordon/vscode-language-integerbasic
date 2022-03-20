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

function get_lang_path(caseSens: boolean|undefined) : string
{
	let lang = 'tree-sitter-integerbasic';
	if (caseSens)
		lang += 'casesens';
	return path.join(__dirname,lang+'.wasm');
}

export async function TreeSitterInit(): Promise<[Parser,Parser.Language,Parser.Language,boolean]>
{
	const config = vscode.workspace.getConfiguration('integerbasic');
	const caseSens = (c => c==undefined?false:c)(config.get('case.caseSensitive')); 
	await Parser.init();
	const parser = new Parser();
	const IntegerBasic = await Parser.Language.load(get_lang_path(false));
	const IntegerBasicCaseSens = await Parser.Language.load(get_lang_path(true));
	if (caseSens)
		parser.setLanguage(IntegerBasicCaseSens);
	else
		parser.setLanguage(IntegerBasic);
	return [parser,IntegerBasic,IntegerBasicCaseSens,caseSens];
}

export class LangExtBase
{
	parser : Parser;
	IntegerBasic : Parser.Language;
	IntegerBasicCaseSens : Parser.Language;
	config : vscode.WorkspaceConfiguration;
	caseSens: boolean;
	constructor(TSInitResult : [Parser,Parser.Language,Parser.Language,boolean])
	{
		this.parser = TSInitResult[0];
		this.IntegerBasic = TSInitResult[1];
		this.IntegerBasicCaseSens = TSInitResult[2];
		this.caseSens = TSInitResult[3];
		this.config = vscode.workspace.getConfiguration('integerbasic');
	}
	curs_to_range(curs: Parser.TreeCursor): vscode.Range
	{
		const start_pos = new vscode.Position(curs.startPosition.row,curs.startPosition.column);
		const end_pos = new vscode.Position(curs.endPosition.row,curs.endPosition.column);
		return new vscode.Range(start_pos,end_pos);
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
		this.config = vscode.workspace.getConfiguration('integerbasic');
		const caseSens = (c => c==undefined?false:c)(this.config.get('case.caseSensitive')); 
		if (caseSens!=this.caseSens)
		{
			this.caseSens = caseSens;
			if (caseSens)
				this.parser.setLanguage(this.IntegerBasicCaseSens);
			else
				this.parser.setLanguage(this.IntegerBasic);
		}
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

export class LineNumberTool extends LangExtBase
{
	nums : Array<number>;
	rngs : Array<vscode.Range>;
	leading_space : Array<number>;
	trailing_space : Array<number>;
	constructor(TSInitResult : [Parser,Parser.Language,Parser.Language,boolean])
	{
		super(TSInitResult);
		this.nums = new Array<number>();
		this.rngs = new Array<vscode.Range>();
		this.leading_space = new Array<number>();
		this.trailing_space = new Array<number>();
	}
	clear()
	{
		this.nums = new Array<number>();
		this.rngs = new Array<vscode.Range>();
		this.leading_space = new Array<number>();
		this.trailing_space = new Array<number>();
	}
	push_linenum(curs: Parser.TreeCursor)
	{
		const rng = this.curs_to_range(curs);
		const leading = curs.nodeText.length - curs.nodeText.trimLeft().length;
		const trailing = curs.nodeText.length - curs.nodeText.trimRight().length;
		const parsed = parseInt(curs.nodeText.replace(/ /g,''));
		if (!isNaN(parsed))
		{
			this.nums.push(parsed);
			this.rngs.push(rng);
			this.leading_space.push(leading);
			this.trailing_space.push(trailing);
		}
	}
	visitPrimaryLineNumber(curs:Parser.TreeCursor) : WalkerChoice
	{
		const parent = curs.currentNode().parent;
		if (curs.nodeType=="linenum" && parent)
			if (parent.type=="line")
			{
				this.push_linenum(curs);
				return WalkerOptions.gotoParentSibling;
			}
		return WalkerOptions.gotoChild;
	}
	visitSecondaryLineNumber(curs:Parser.TreeCursor) : WalkerChoice
	{
		const prev = curs.currentNode().previousNamedSibling;
		if (curs.nodeType=="integer" && prev)
			if (["statement_goto","statement_gosub","statement_then_line"].indexOf(prev.type)>=0)
			{
				this.push_linenum(curs);
				return WalkerOptions.gotoSibling;
			}
		const parent = curs.currentNode().parent;
		if (curs.nodeType=="linenum" && parent)
			if (parent.type!="line")
			{
				this.push_linenum(curs);
				return WalkerOptions.gotoSibling;
			}
		return WalkerOptions.gotoChild;
	}
	get_primary_nums(tree: Parser.Tree) : Array<number>
	{
		this.clear();
		this.walk(tree,this.visitPrimaryLineNumber.bind(this));
		return this.nums;
	}
	apply_mapping(i: number,mapping: Map<number,number>,editBuilder: vscode.TextEditorEdit)
	{
		const new_num =  mapping.get(this.nums[i]);
		if (new_num!=undefined)
		{
			let fmt_num = ' '.repeat(this.leading_space[i]);
			fmt_num += new_num.toString();
			fmt_num += ' '.repeat(this.trailing_space[i]);
			editBuilder.replace(this.rngs[i],fmt_num);
		}
	}
	renumber(sel: vscode.Range | undefined,updateRefs: boolean,tree: Parser.Tree,mapping: Map<number,number>,editBuilder: vscode.TextEditorEdit)
	{
		// Modify primary line numbers only in selected range
		this.clear();
		this.walk(tree,this.visitPrimaryLineNumber.bind(this));
		for (let i=0;i<this.nums.length;i++)
			if (sel==undefined || sel.contains(this.rngs[i]))
				this.apply_mapping(i,mapping,editBuilder);
		// Modify line number references globally
		if (updateRefs)
		{
			this.clear();
			this.walk(tree,this.visitSecondaryLineNumber.bind(this));
			for (let i=0;i<this.nums.length;i++)
				this.apply_mapping(i,mapping,editBuilder);
		}
	}
	add_linenum_diagnostics(diag: Array<vscode.Diagnostic>)
	{
		const n = this.nums.length;
		for (let i=1;i<n;i++)
			if (this.nums[i]<=this.nums[i-1])
				diag.push(new vscode.Diagnostic(this.rngs[i],'Line number out of order'));
	}
}
