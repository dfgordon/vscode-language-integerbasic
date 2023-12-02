import * as vsserv from 'vscode-languageserver/node';
import * as vsdoc from 'vscode-languageserver-textdocument';
import Parser from 'web-tree-sitter';
import * as path from 'path';
import { integerbasicSettings } from './settings';

export const SIMPLE_VAR_TYPES = [
	"str_name",
	"int_name",
];

export const LEXPR = [
	"str_name",
	"int_name",
	"str_array",
	"int_array"
	// str_slice is not an lexpr
]

export const REXPR = [
	"str_name",
	"int_name",
	"str_array",
	"int_array",
	"str_slice"
]

export const ARRAY_OPEN = [
	"open_str",
	"open_int",
	"open_slice",
	"open_dim_str",
	"open_dim_int"
]

export type Logger = vsserv.RemoteConsole & vsserv._ | Console;

export const WalkerOptions = {
	gotoChild: 0,
	gotoSibling: 1,
	gotoParentSibling: 2,
	exit: 3
} as const;

export type WalkerChoice = typeof WalkerOptions[keyof typeof WalkerOptions];

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

function is_hex(x_neg: number): boolean
{
	const x = x_neg - 128;
	return x >= 48 && x <= 57 || x >= 65 && x <= 70 || x >= 97 && x <= 102;
}

export function hex_from_bytes(buf: number[]) : string
{
	return [...buf].map(b => b.toString(16).toUpperCase().padStart(2,"0")).join("");
}

/**
 * Escape the bytes in some negative ASCII stringlike context.  The escape value is not inverted.
 * @param escapes byte values that should be escaped, all values < 128 and > 254 are escaped unconditionally
 * @param bytes bytes to escape, literal hex escapes will hex-escape the backslash (`\x5c`)
 * @param offset index to start of this context, one past the triggering byte
 * @param terminator characters that close the context
 * @returns escaped string and index to the terminator, terminator is not included in string
 */
export function bytes_to_escaped_string(escapes: number[], bytes: number[], offset: number, terminator: number[]): [string,number]
{
	const BACKSLASH = 128 + 92;
	let ans = "";
	let idx = offset;
	while (idx < bytes.length) {
		if (terminator.includes(bytes[idx]))
			break;
		if (bytes[idx] == BACKSLASH && idx + 3 < bytes.length) {
			if (bytes[idx + 1] == 128+120 && is_hex(bytes[idx + 2]) && is_hex(bytes[idx + 3]))
				ans += "\\x5c";
			else
				ans += "\\";
		}
		else if (escapes.includes(bytes[idx]) || bytes[idx] > 254 || bytes[idx] < 128)
			ans += '\\x' + bytes[idx].toString(16).padStart(2,'0'); 
		else
			ans += String.fromCharCode(bytes[idx]-128);
		 idx += 1;
	}
	return [ans,idx];
}
/**
 * Put string with possible escapes into negative ascii and all caps
 * @param txt string with possible hex escapes, sign of escapes will not be changed
 * @returns array of bytes in integer basic format
 */
export function escaped_string_to_bytes(txt: string): number[]  {
	const seq1 = [/\\/, /x/, /[0-9a-fA-F]/, /[0-9a-fA-F]/];
	let ans = new Array<number>();
	let matches1 = 0;
	let stack = "";
	for (let i = 0; i < txt.length; i++) {
		let matching = false;
		if (txt.charAt(i).search(seq1[matches1])>=0) {
			matches1++;
			matching = true;
		} else {
			matches1 = 0;
		}
		if (matching)
			stack += txt.charAt(i);
		else {
			if (stack.length > 0) {
				for (const char of stack) {
					ans.push(char.toUpperCase().charCodeAt(0)+128);
				}
				stack = "";
				i--;
			} else {
				ans.push(txt.toUpperCase().charCodeAt(i)+128);
			}
		}
		if (matches1 == 4) {
			ans.push(parseInt(txt.slice(i-1,i+1),16));
			matches1 = 0;
			stack = "";
		}
	}
	for (const char of stack) {
		ans.push(char.toUpperCase().charCodeAt(0)+128);
	}
	return ans;
}

export function curs_to_range(curs: Parser.TreeCursor,row: number): vsserv.Range
{
	const start_pos = vsserv.Position.create(row+curs.startPosition.row, curs.startPosition.column);
	const end_pos = vsserv.Position.create(row+curs.endPosition.row, curs.endPosition.column);
	return vsserv.Range.create(start_pos, end_pos);
}
export function node_to_range(node: Parser.SyntaxNode,row: number): vsserv.Range
{
	const start_pos = vsserv.Position.create(row+node.startPosition.row,node.startPosition.column);
	const end_pos = vsserv.Position.create(row+node.endPosition.row,node.endPosition.column);
	return vsserv.Range.create(start_pos,end_pos);
}

/**
 * Gather key information for a variable.
 * @param node must be inner type, `str_name` or `int_name`
 * @returns [normalized name,specific name,is_array,is_str], key name includes `$` if a string
 */
export function var_to_key(node: Parser.SyntaxNode): [string,string,boolean,boolean]
{
	const next = node.nextNamedSibling;
	const child = node.firstNamedChild;
	const isArray: boolean = next ? ARRAY_OPEN.includes(next.type) : false;
	const isString: boolean = child ? child.type == "dollar" : false;
	let n = node.text;
	n = n.replace(/ /g, '');
	return [n.toUpperCase(),n,isArray,isString];
}

/**
 * Calls var_to_key, going down to find the inner name if necessary
 * @param node can be any LEXPR type
 * @param row current row being analyzed
 * @returns [normalized name,specific name,is_array,is_str,inner range], key name includes `$` if a string
 */
export function lexpr_to_key(node: Parser.SyntaxNode,row:number): [string, string, boolean, boolean, vsserv.Range]
{
	if (SIMPLE_VAR_TYPES.includes(node.type))
		return [...var_to_key(node),node_to_range(node,row)];
	const child = node.firstNamedChild;
	if (child)
		return [...var_to_key(child),node_to_range(child,row)];
	return ["", "", false, false,vsserv.Range.create(0,0,0,0)];
}

export function rangeContainsPos(rng: vsserv.Range, pos: vsserv.Position) : boolean // is this built in somewhere?
{
	if (pos.line < rng.start.line || pos.line > rng.end.line)
		return false;
	if (pos.line == rng.start.line && pos.character < rng.start.character)
		return false;
	if (pos.line == rng.end.line && pos.character > rng.end.character)
		return false;
	return true;
}

export function rangeContainsRange(outer: vsserv.Range, inner: vsserv.Range) : boolean // is this built in somewhere?
{
	if (inner.start.line < outer.start.line || inner.end.line > outer.end.line)
		return false;
	if (inner.start.line == outer.start.line && inner.start.character < outer.start.character)
		return false;
	if (inner.end.line == outer.end.line && inner.end.character > outer.end.character)
		return false;
	return true;
}

export class LangExtBase
{
	logger: Logger;
	parser : Parser;
	IntegerBasic : Parser.Language;
    config: integerbasicSettings;
    depth: number;
	constructor(TSInitResult : [Parser,Parser.Language], connection: Logger, settings: integerbasicSettings)
	{
		this.logger = connection;
		this.parser = TSInitResult[0];
		this.IntegerBasic = TSInitResult[1];
        this.config = settings;
        this.depth = 0;
	}
	configure(settings: integerbasicSettings) {
		this.config = settings;
	}
	lines(document: vsdoc.TextDocument) : string[]
	{
		return document.getText().split(/\r?\n/);
	}
	parse(txt: string,append: string) : Parser.Tree
	{
		return this.parser.parse(txt+append);
	}
	walk(syntaxTree: Parser.Tree,visit: (node: Parser.TreeCursor) => WalkerChoice)
	{
		this.depth = 0;
		const curs = syntaxTree.walk();
		let choice : WalkerChoice = WalkerOptions.gotoChild;
		do
		{
			if (choice == WalkerOptions.gotoChild && curs.gotoFirstChild()) {
				this.depth++;
				choice = visit(curs);
			}
			else if (choice == WalkerOptions.gotoParentSibling && curs.gotoParent() && curs.gotoNextSibling()) {
				this.depth--;
				choice = visit(curs);
			}
			else if (choice==WalkerOptions.gotoSibling && curs.gotoNextSibling())
				choice = visit(curs);
			else if (curs.gotoNextSibling())
				choice = visit(curs);
			else if (curs.gotoParent()) {
				this.depth--;
				choice = WalkerOptions.gotoSibling;
			}
			else
				choice = WalkerOptions.exit;
		} while (choice!=WalkerOptions.exit);
	}
}
