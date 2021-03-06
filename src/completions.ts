import * as vscode from 'vscode';
import * as specialAddresses from './specialAddresses.json';

export class LineCompletionProvider implements vscode.CompletionItemProvider
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
	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext)
	{
		if (document.lineAt(position).text.trim().length==0)
		{
			let step = 10;
			const prevNum = this.get_linenum(document.lineAt(position.line-1).text);
			if (prevNum==-1)
				return undefined;
			const prevPrevNum = this.get_linenum(document.lineAt(position.line-2).text);
			if (prevPrevNum!=-1)
				step = prevNum - prevPrevNum;
			return [new vscode.CompletionItem((prevNum + step).toString()+' ',vscode.CompletionItemKind.Constant)];
		}
		return undefined;
	}
}

export class AddressCompletionProvider implements vscode.CompletionItemProvider
{
	pokeCompletions : Array<vscode.CompletionItem>;
	peekCompletions : Array<vscode.CompletionItem>;
	callCompletions : Array<vscode.CompletionItem>;
	negativeAddr: boolean | undefined;
	constructor()
	{
		this.pokeCompletions = new Array<vscode.CompletionItem>();
		this.peekCompletions = new Array<vscode.CompletionItem>();
		this.callCompletions = new Array<vscode.CompletionItem>();
		this.rebuild();
	}
	rebuild()
	{
		this.pokeCompletions = new Array<vscode.CompletionItem>();
		this.peekCompletions = new Array<vscode.CompletionItem>();
		this.callCompletions = new Array<vscode.CompletionItem>();
		const config = vscode.workspace.getConfiguration('integerbasic');
		this.negativeAddr = true;
		for (const addr in specialAddresses)
		{
			const typ = Object(specialAddresses)[addr].type;
			const ctx = Object(specialAddresses)[addr].ctx;
			if (ctx && ctx=='Applesoft')
				continue;
			if (typ && typ.search('soft switch')==-1 && typ.search('routine')==-1)
			{
				this.pokeCompletions.push(this.get_completion_item(addr,'',','));
				this.peekCompletions.push(this.get_completion_item(addr,'(',')'));
			}
			if (typ=='soft switch')
			{
				this.pokeCompletions.push(this.get_completion_item(addr,'',',0'));
				this.peekCompletions.push(this.get_completion_item(addr,'(',')'));
			}
			if (typ && typ.search('routine')>=0)
				this.callCompletions.push(this.get_completion_item(addr,'',''));
		}
	}
	get_completion_item(addr: string,prefix: string,postfix: string) : vscode.CompletionItem
	{
		const addr_entry = Object(specialAddresses)[addr];
		let num_addr = parseInt(addr);
		num_addr = num_addr<0 && !this.negativeAddr ? num_addr+2**16 : num_addr;
		num_addr = num_addr>=2**15 && this.negativeAddr ? num_addr-2**16 : num_addr;
		const it = { 
			description: addr_entry.brief,
			detail: addr_entry.label,
			label: prefix + num_addr + postfix
		};
		if (!it.description)
		{
			const temp = addr_entry.desc as string;
			const temp2 = temp.lastIndexOf('.')==temp.length-1 ? temp.substring(0,temp.length-1) : temp;
			it.description = temp2;
		}
		return new vscode.CompletionItem(it,vscode.CompletionItemKind.Constant);
	}
	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext)
	{
		let ans = new Array<vscode.CompletionItem>();

		if (position.character>4)
		{
			const l = position.line;
			const c = position.character;
			let statement = document.getText(new vscode.Range(new vscode.Position(l,0),new vscode.Position(l,c)));
			if (!vscode.workspace.getConfiguration('integerbasic').get('case.caseSensitive'))
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

export class TSCompletionProvider implements vscode.CompletionItemProvider
{
	config : vscode.WorkspaceConfiguration;
	constructor()
	{
		this.config = vscode.workspace.getConfiguration('integerbasic');
	}
	modify(s:string)
	{
		if (this.config.get('case.lowerCaseCompletions') && !this.config.get('case.caseSensitive'))
			return s.toLowerCase();
		else
			return s;
	}
	add_simple(ans: Array<vscode.CompletionItem>,a2tok: string[])
	{
		a2tok.forEach(s =>
		{
			ans.push(new vscode.CompletionItem(this.modify(s),vscode.CompletionItemKind.Keyword));
		});
	}
	add_funcs(ans: Array<vscode.CompletionItem>,a2tok: string[],expr_typ: string)
	{
		a2tok.forEach(s =>
		{
			s = this.modify(s);
			ans.push(new vscode.CompletionItem(s+' ('+expr_typ+')',vscode.CompletionItemKind.Function));
			ans[ans.length-1].insertText = new vscode.SnippetString(s+'(${0})');
		});
	}
	add_procs(ans: Array<vscode.CompletionItem>,a2tok: string[],expr_typ: string)
	{
		a2tok.forEach(s =>
		{
			s = this.modify(s);
			ans.push(new vscode.CompletionItem(s+' '+expr_typ,vscode.CompletionItemKind.Keyword));
			ans[ans.length-1].insertText = new vscode.SnippetString(s+' ${0}');
		});
	}
	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext)
	{
		this.config = vscode.workspace.getConfiguration('integerbasic');
		const ans = new Array<vscode.CompletionItem>();

		this.add_simple(ans,['END','GR','INPUT',
			'NEXT','NOTRACE','POP','PRINT','REM','RETURN',
			'TEXT','TRACE']);
		this.add_funcs(ans,['ABS','PDL','PEEK','RND','SGN'],'aexpr');
		this.add_funcs(ans,['ASC','LEN'],'sexpr');
		this.add_procs(ans,['CALL','COLOR =','IN#','PR#','VTAB'],'aexpr');

		ans.push(new vscode.CompletionItem(this.modify('CALL special (enter, space)')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('CALL'));
	
		ans.push(new vscode.CompletionItem(this.modify('DSP name')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('DSP ${0:name}'));
	
		ans.push(new vscode.CompletionItem(this.modify('DIM name (subscript)')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('DIM ${1:name} (${0:subscript})'));

		ans.push(new vscode.CompletionItem(this.modify('FOR index = first TO last: statement: NEXT')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('FOR ${1:I} = ${2:1} TO ${3:last}: ${0}: NEXT'));
		ans.push(new vscode.CompletionItem(this.modify('FOR index = first TO last STEP s: statement: NEXT')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('FOR ${1:I} = ${2:1} TO ${3:last} STEP ${4:step}: ${0}: NEXT'));

		ans.push(new vscode.CompletionItem(this.modify('GOSUB linenum')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('GOSUB ${0:linenum}'));

		ans.push(new vscode.CompletionItem(this.modify('GOTO linenum')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('GOTO ${0:linenum}'));

		ans.push(new vscode.CompletionItem(this.modify('HLIN aexpr,aexpr AT aexpr')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('HLIN ${1:x1},${2:x2} AT ${0:y}'));

		ans.push(new vscode.CompletionItem(this.modify('IF expr THEN statement')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('IF ${1} THEN ${0}'));

		ans.push(new vscode.CompletionItem(this.modify('LET var = expr')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('LET ${1:var} = ${0:expr}'));
		
		ans.push(new vscode.CompletionItem(this.modify('LIST linenum, linenum')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('LIST ${1:first}, ${0:last}'));

		ans.push(new vscode.CompletionItem(this.modify('NODSP name')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('NODSP ${0:name}'));

		ans.push(new vscode.CompletionItem(this.modify('PEEK (special) (enter, space)')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('PEEK'));

		ans.push(new vscode.CompletionItem(this.modify('PLOT aexpr,aexpr')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('PLOT ${1:x},${0:y}'));

		ans.push(new vscode.CompletionItem(this.modify('POKE aexpr,aexpr')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('POKE ${1:addr},${0:val}'));

		ans.push(new vscode.CompletionItem(this.modify('POKE special (enter, space)')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('POKE'));
		
		ans.push(new vscode.CompletionItem(this.modify('SCRN (aexpr,aexpr)')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('SCRN (${1:x},${0:y})'));

		ans.push(new vscode.CompletionItem(this.modify('VLIN aexpr,aexpr AT aexpr')));
		ans[ans.length-1].insertText = new vscode.SnippetString(this.modify('VLIN ${1:y1},${2:y2} AT ${0:x}'));

		return ans;
	}
}
