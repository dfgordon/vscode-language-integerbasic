import * as vsserv from 'vscode-languageserver/node';
import * as vsdoc from 'vscode-languageserver-textdocument';
import * as lxbase from './langExtBase';
import * as a2map from 'a2-memory-map';
import { integerbasicSettings } from './settings';
import { docSymbols } from './server';
import Parser from 'web-tree-sitter';
import { WalkerOptions } from './langExtBase';

export class LineCompletionProvider extends lxbase.LangExtBase
{
	get_linenum(line: string) : number
	{
		const nums = line.match(/^[0-9 ]+/);
		if (nums)
			if (nums.length>0)
			{
				const num = parseInt(nums[0].replace(/ /g,''));
				if (!isNaN(num))
					return num;
			}
		return -1;
	}
	provideCompletionItems(document: vsdoc.TextDocument | undefined, position: vsdoc.Position) : vsserv.CompletionItem[]
	{
		if (!document)
			return [];
		const lines = this.lines(document);
		lines.push('\n');
		if (lines[position.line].trim().length==0 && position.line>1)
		{
			let step = 10;
			const prevNum = this.get_linenum(lines[position.line-1]);
			if (prevNum==-1)
				return [];
			const prevPrevNum = this.get_linenum(lines[position.line-2]);
			if (prevPrevNum!=-1)
				step = prevNum - prevPrevNum;
			const it = vsserv.CompletionItem.create((prevNum + step).toString() + ' ');
			it.kind = vsserv.CompletionItemKind.Constant;
			return [it];
		}
		return [];
	}
}

export class AddressCompletionProvider extends lxbase.LangExtBase
{
	pokeCompletions : Array<vsserv.CompletionItem>;
	peekCompletions : Array<vsserv.CompletionItem>;
	callCompletions : Array<vsserv.CompletionItem>;
	negativeAddr: boolean | undefined;
	constructor(TSInitResult: [Parser,Parser.Language],logger: lxbase.Logger, config: integerbasicSettings)
	{
		super(TSInitResult, logger, config);
		this.pokeCompletions = new Array<vsserv.CompletionItem>();
		this.peekCompletions = new Array<vsserv.CompletionItem>();
		this.callCompletions = new Array<vsserv.CompletionItem>();
		this.rebuild();
	}
	rebuild()
	{
		this.pokeCompletions = new Array<vsserv.CompletionItem>();
		this.peekCompletions = new Array<vsserv.CompletionItem>();
		this.callCompletions = new Array<vsserv.CompletionItem>();
		for (const [addr,obj] of a2map.get_all())
		{
			if (obj.ctx=='Applesoft')
				continue;
			if (obj.type && obj.type.search('soft switch')==-1 && obj.type.search('routine')==-1)
			{
				this.pokeCompletions.push(this.get_completion_item(addr,obj,'',','));
				this.peekCompletions.push(this.get_completion_item(addr,obj,'(',')'));
			}
			if (obj.type=='soft switch')
			{
				this.pokeCompletions.push(this.get_completion_item(addr,obj,'',',0'));
				this.peekCompletions.push(this.get_completion_item(addr,obj,'(',')'));
			}
			if (obj.type && obj.type.search('routine')>=0)
				this.callCompletions.push(this.get_completion_item(addr,obj,'',''));
		}
	}
	get_completion_item(addr: string, addr_entry: a2map.AddressInfo, prefix: string, postfix: string): vsserv.CompletionItem {
		let num_addr = parseInt(addr);
		num_addr = num_addr >= 2 ** 15 ? num_addr - 2 ** 16 : num_addr;
		const it = vsserv.CompletionItem.create(prefix + num_addr + postfix);
		it.kind = vsserv.CompletionItemKind.Constant;
		it.documentation = addr_entry.desc;
		if (addr_entry.brief)
			it.detail = addr_entry.brief;
		else {
			const temp = addr_entry.desc as string;
			const temp2 = temp.lastIndexOf('.') == temp.length - 1 ? temp.substring(0, temp.length - 1) : temp;
			it.detail = temp2;
		}
		if (addr_entry.label) {
			it.insertText = it.label;
			it.insertTextFormat = vsserv.InsertTextFormat.PlainText;
			it.label += ' '.repeat(8-it.label.length) + addr_entry.label;
		}
		return it;
	}
	provideCompletionItems(document: vsdoc.TextDocument | undefined, position: vsdoc.Position) : vsserv.CompletionItem[]
	{
		if (!document)
			return [];
		
		let ans = new Array<vsserv.CompletionItem>();

		if (position.character>4)
		{
			const l = position.line;
			const c = position.character;
			let statement = document.getText(vsserv.Range.create(vsserv.Position.create(l,0),vsserv.Position.create(l,c)));
			if (!this.config.case.caseSensitive)
				statement = statement.toUpperCase();
			if (statement.search(/POKE\s*$/)>-1)
				ans = ans.concat(this.pokeCompletions);
			if (statement.search(/PEEK\s*$/)>-1)
				ans = ans.concat(this.peekCompletions);
			if (statement.search(/CALL\s*$/)>-1)
				ans = ans.concat(this.callCompletions);
		}
		return ans;
	}
}


export class StatementCompletionProvider extends lxbase.LangExtBase
{
	pos: vsdoc.Position = vsserv.Position.create(0, 0);
	inExpr: boolean = false;
	inStr: boolean = false;
	inStatement: boolean = false;
	modify(s:string)
	{
		if (this.config.case.lowerCaseCompletions && !this.config.case.caseSensitive)
			return s.toLowerCase();
		else
			return s;
	}
	add_simple(ans: Array<vsserv.CompletionItem>,a2tok: string[])
	{
		a2tok.forEach(s =>
		{
			s = this.modify(s);
			ans.push(vsserv.CompletionItem.create(this.modify(s)));
			ans[ans.length - 1].kind = vsserv.CompletionItemKind.Keyword;
		});
	}
	add_funcs(ans: Array<vsserv.CompletionItem>,a2tok: string[],expr_typ: string)
	{
		a2tok.forEach(s =>
		{
			s = this.modify(s);
			ans.push(vsserv.CompletionItem.create(s+' ('+expr_typ+')'));
			ans[ans.length - 1].kind = vsserv.CompletionItemKind.Function;
			ans[ans.length - 1].insertText = s + '(${1})';
			ans[ans.length - 1].insertTextFormat = vsserv.InsertTextFormat.Snippet;
		});
	}
	add_procs(ans: Array<vsserv.CompletionItem>,a2tok: string[],expr_typ: string)
	{
		a2tok.forEach(s =>
		{
			s = this.modify(s);
			ans.push(vsserv.CompletionItem.create(s + ' ' + expr_typ));
			ans[ans.length - 1].kind = vsserv.CompletionItemKind.Keyword;
			ans[ans.length - 1].insertText = s + ' ${0}';
			ans[ans.length - 1].insertTextFormat = vsserv.InsertTextFormat.Snippet;
		});
	}
	add_snippet(ans: Array<vsserv.CompletionItem>, lab: string, snip: string)
	{
		ans.push(vsserv.CompletionItem.create(this.modify(lab)));
		ans[ans.length - 1].insertText = this.modify(snip);
		ans[ans.length - 1].insertTextFormat = vsserv.InsertTextFormat.Snippet;
	}
	visit_statement(curs: Parser.TreeCursor): lxbase.WalkerChoice
	{
		const rng = lxbase.curs_to_range(curs, this.pos.line);
		if (!lxbase.rangeContainsPos(rng, this.pos))
			return WalkerOptions.gotoSibling;
		if (curs.nodeType == 'statement') {
			if (curs.currentNode().childCount == 0) {
				this.inStatement = true;
				return WalkerOptions.exit;
			} else {
				return WalkerOptions.gotoChild;
			}
		}
		if (curs.nodeType == 'string') {
			this.inStr = true;
			return WalkerOptions.exit;
		}
		const prev3 = curs.currentNode().previousNamedSibling?.type.substring(0, 3);
		const prev = curs.currentNode().previousNamedSibling?.type;
		if (prev == 'statement' || prev == 'linenum') {
			this.inStatement = true;
			return WalkerOptions.exit;
		}
		if (prev3 == 'sta' || prev3 == 'str' || prev3 == 'op_' || prev3 == 'fca' || prev3 == 'sep') {
			this.inExpr = true;
			return WalkerOptions.exit;
		}
		return WalkerOptions.gotoChild;
	}
	provideCompletionItems(document: vsdoc.TextDocument | undefined, position: vsdoc.Position): vsserv.CompletionItem[] {
		const ans = new Array<vsserv.CompletionItem>();
		this.inExpr = false;
		this.inStr = false;
		this.inStatement = false;
		this.pos = position;

		if (!document)
			return ans;

		const currLine = this.lines(document)[position.line];
		const tree = this.parse(currLine, '\n');
		this.walk(tree, this.visit_statement.bind(this));

		if (this.inStr) {
			return ans;
		}

		if (this.inExpr || this.inStatement) {
			for (const [k, v] of docSymbols.vars) {
				for (const c of v.case) {
					// don't use add_snippet (would modify case)
					ans.push(vsserv.CompletionItem.create(c));
					if (v.isArray && !v.isString) {
						ans[ans.length - 1].insertText = c.substring(0, c.length) + '(${1:subscript})';
						ans[ans.length - 1].insertTextFormat = vsserv.InsertTextFormat.Snippet;
					} else {
						ans[ans.length - 1].kind = vsserv.CompletionItemKind.Variable;
					}
				}
			}
			this.add_funcs(ans, ['ABS', 'PDL', 'PEEK', 'RND', 'SGN'], 'aexpr');
			this.add_funcs(ans, ['ASC', 'LEN'], 'sexpr');
			this.add_snippet(ans, 'PEEK (special) (enter, space)', 'PEEK');
			this.add_snippet(ans, 'SCRN (aexpr,aexpr)', 'SCRN (${1:x},${0:y})');
		}

		if (this.inStatement) {
	
			this.add_simple(ans, ['END', 'GR', 'INPUT',
				'NEXT', 'NOTRACE', 'POP', 'PRINT', 'REM', 'RETURN',
				'TEXT', 'TRACE']);
			this.add_procs(ans, ['CALL', 'COLOR =', 'IN#', 'PR#', 'VTAB'], 'aexpr');

			this.add_snippet(ans, 'CALL special (enter, space)', 'CALL');
		
			this.add_snippet(ans, 'DSP name', 'DSP ${0:name}');
		
			this.add_snippet(ans, 'DIM name (subscript)', 'DIM ${1:name} (${0:subscript})');

			this.add_snippet(ans, 'FOR index = first TO last: statement: NEXT', 'FOR ${1:I} = ${2:1} TO ${3:last}: ${0}: NEXT');
			this.add_snippet(ans, 'FOR index = first TO last STEP s: statement: NEXT', 'FOR ${1:I} = ${2:1} TO ${3:last} STEP ${4:step}: ${0}: NEXT');

			this.add_snippet(ans, 'GOSUB linenum', 'GOSUB ${0:linenum}');

			this.add_snippet(ans, 'GOTO linenum', 'GOTO ${0:linenum}');

			this.add_snippet(ans, 'HLIN aexpr,aexpr AT aexpr', 'HLIN ${1:x1},${2:x2} AT ${0:y}');

			this.add_snippet(ans, 'IF expr THEN statement', 'IF ${1} THEN ${0}');

			this.add_snippet(ans, 'LET var = expr', 'LET ${1:var} = ${0:expr}');
			
			this.add_snippet(ans, 'LIST linenum, linenum', 'LIST ${1:first}, ${0:last}');

			this.add_snippet(ans, 'NODSP name', 'NODSP ${0:name}');

			this.add_snippet(ans, 'PLOT aexpr,aexpr', 'PLOT ${1:x},${0:y}');

			this.add_snippet(ans, 'POKE aexpr,aexpr', 'POKE ${1:addr},${0:val}');

			this.add_snippet(ans, 'POKE special (enter, space)', 'POKE');
			
			this.add_snippet(ans, 'VLIN aexpr,aexpr AT aexpr', 'VLIN ${1:y1},${2:y2} AT ${0:x}');
		}
		
		return ans;
	}
}
