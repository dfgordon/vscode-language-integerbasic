import * as vscode from 'vscode';

function exampleString(examples: string[]) : vscode.MarkdownString
{
	const result = new vscode.MarkdownString();
	examples.forEach(s => result.appendCodeblock(s,'integerbasic'));
	return result;
}

export class StatementHovers
{
	hmap: Map<string,Array<vscode.MarkdownString>>;

	constructor()
	{
		this.hmap = new Map<string,Array<vscode.MarkdownString>>();
			
		this.hmap.set("fcall_abs",[
			new vscode.MarkdownString('absolute value'),
			new vscode.MarkdownString('`ABS (aexpr)`')
		]);
		this.hmap.set("fcall_ascp",[
			new vscode.MarkdownString('ASCII code of first character'),
			new vscode.MarkdownString('`ASC (sexpr)`')
		]);
		this.hmap.set("statement_call",[
			new vscode.MarkdownString('Call machine language subroutine at decimal address.  The optional string argument is only for specialized object code like `CHAIN`.'),
			new vscode.MarkdownString('`CALL aexpr [string]`'),
			exampleString([
				'CALL 768',
				'CALL 520"NEXT PROGRAM"'])
		]);
		this.hmap.set("statement_coloreq",[
			new vscode.MarkdownString('Set the low resolution color'),
			new vscode.MarkdownString('`COLOR = aexpr`')
		]);
		this.hmap.set("statement_dim",[
			new vscode.MarkdownString('allocate space for arrays or strings'),
			new vscode.MarkdownString('`DIM name[$] (aexpr) [{,name[$] (aexpr)}]`')
		]);
		this.hmap.set("statement_dsp",[
			new vscode.MarkdownString('watch variable during execution'),
			new vscode.MarkdownString('`DSP name[$]`')
		]);
		this.hmap.set("statement_end",[
			new vscode.MarkdownString('stop program execution'),
			new vscode.MarkdownString('`END`')
		]);
		this.hmap.set("statement_for",[
			new vscode.MarkdownString('start a loop indexing on the given variable'),
			new vscode.MarkdownString('`FOR name = aexpr TO aexpr [STEP aexpr]`')
		]);
		this.hmap.set("statement_gosub",[
			new vscode.MarkdownString('Execute the subroutine starting at the given line number.  Variables cannot be used.'),
			new vscode.MarkdownString('`GOSUB linenum`')
		]);
		this.hmap.set("statement_goto",[
			new vscode.MarkdownString('Branch to the given line number.  Variables cannot be used.'),
			new vscode.MarkdownString('`GOTO linenum`')
		]);
		this.hmap.set("statement_gr",[
			new vscode.MarkdownString('Switch to low resolution graphics and clear the screen.'),
			new vscode.MarkdownString('`GR`')
		]);
		this.hmap.set("statement_hlin",[
			new vscode.MarkdownString('Draw a horizontal line on the low resolution screen.'),
			new vscode.MarkdownString('`HLIN aexpr,aexpr AT aexpr`')
		]);
		this.hmap.set("statement_if",[
			new vscode.MarkdownString('Execute statement following `THEN` if the condition is true. If `THEN` does not branch, a trailing statment always executes.'),
			new vscode.MarkdownString('`IF expr THEN statement[{:statement}]`'),
			exampleString([
				'IF X<Y THEN X = 0: Y = 0',
				'IF A$ = "Y" THEN GOTO 100',
				'IF A$ = "Y" THEN 100'])
		]);
		this.hmap.set("statement_inn",[
			new vscode.MarkdownString('Switch input to a numbered expansion slot.'),
			new vscode.MarkdownString('`IN# aexpr`')
		]);
		this.hmap.set("statement_input",[
			new vscode.MarkdownString('Read from the current input device, optionally with prompt'),
			new vscode.MarkdownString('`INPUT [sexpr,]var[{,var}]`'),
			exampleString([
				'INPUT PRICE',
				'INPUT "WHAT IS YOUR PASSWORD? ", PASSWD$'])
		]);
		this.hmap.set("fcall_len",[
			new vscode.MarkdownString('length of a string'),
			new vscode.MarkdownString('`LEN (sexpr)`')
		]);
		this.hmap.set("statement_let",[
			new vscode.MarkdownString('`LET` is optional in assignments')
		]);
		this.hmap.set("statement_list",[
			new vscode.MarkdownString('output program listing to current device'),
			new vscode.MarkdownString('`LIST [linenum] [,linenum]`')
		]);
		this.hmap.set("statement_next",[
			new vscode.MarkdownString('Mark the end of a loop.'),
			new vscode.MarkdownString('`NEXT [avar[{,avar}]]`')
		]);
		this.hmap.set("statement_nodsp",[
			new vscode.MarkdownString('Do not watch variable during execution.'),
			new vscode.MarkdownString('`NODSP name[$]`')
		]);
		this.hmap.set("statement_notrace",[
			new vscode.MarkdownString('cancel display of line numbers during execution'),
			new vscode.MarkdownString('`NOTRACE`')
		]);
		this.hmap.set("fcall_pdl",[
			new vscode.MarkdownString('Read the dial on the given game paddle.'),
			new vscode.MarkdownString('`PDL (aexpr)`')
		]);
		this.hmap.set("fcall_peek",[
			new vscode.MarkdownString('byte value at the given decimal address'),
			new vscode.MarkdownString('`PEEK (aexpr)`')
		]);
		this.hmap.set("statement_plot",[
			new vscode.MarkdownString('display low resolution pixel'),
			new vscode.MarkdownString('`PLOT aexpr,aexpr`')
		]);
		this.hmap.set("statement_poke",[
			new vscode.MarkdownString('set byte value at the given decimal address'),
			new vscode.MarkdownString('`POKE aexpr,aexpr`')
		]);
		this.hmap.set("statement_pop",[
			new vscode.MarkdownString('remove the most recent return address from the stack'),
			new vscode.MarkdownString('`POP`')
		]);
		this.hmap.set("statement_prn",[
			new vscode.MarkdownString('switch output to the given numbered expansion slot'),
			new vscode.MarkdownString('`PR# aexpr`')
		]);
		this.hmap.set("statement_print",[
			new vscode.MarkdownString('Write to the current output device.'),
			new vscode.MarkdownString('`PRINT [{expr,|expr;}]`'),
			exampleString([
				'PRINT',
				'PRINT A$, "X = ";X'])
		]);
		this.hmap.set("statement_rem",[
			new vscode.MarkdownString('start of a comment (remark)'),
			new vscode.MarkdownString('`REM {character}`')
		]);
		this.hmap.set("statement_return",[
			new vscode.MarkdownString('return from subroutine'),
			new vscode.MarkdownString('`RETURN`')
		]);
		this.hmap.set("fcall_rnd",[
			new vscode.MarkdownString('Uniform deviate between 0 and aexpr-1 if aexpr>0, between 0 and aexpr+1 otherwise.'),
			new vscode.MarkdownString('`RND (aexpr)`')
		]);
		this.hmap.set("fcall_scrnp",[
			new vscode.MarkdownString('color code at position on low resolution graphics screen'),
			new vscode.MarkdownString('`SCRN (aexpr,aexpr)`')
		]);
		this.hmap.set("fcall_sgn",[
			new vscode.MarkdownString('sign function, gives -1,0, or 1'),
			new vscode.MarkdownString('`SGN (aexpr)`')
		]);
		this.hmap.set("statement_tab",[
			new vscode.MarkdownString('move text cursor to given column, numbered from 1'),
			new vscode.MarkdownString('`TAB aexpr`')
		]);
		this.hmap.set("statement_text",[
			new vscode.MarkdownString('switch display to text'),
			new vscode.MarkdownString('`TEXT`')
		]);
		this.hmap.set("statement_then",[
			new vscode.MarkdownString('see `IF`'),
		]);
		this.hmap.set("statement_trace",[
			new vscode.MarkdownString('display each line number during execution'),
			new vscode.MarkdownString('`TRACE`')
		]);
		this.hmap.set("statement_vlin",[
			new vscode.MarkdownString('draw a vertical line on the low resolution screen'),
			new vscode.MarkdownString('`VLIN aexpr,aexpr AT aexpr`')
		]);
		this.hmap.set("statement_vtab",[
			new vscode.MarkdownString('move text cursor to the given row, numbered from 1'),
			new vscode.MarkdownString('`VTAB aexpr`')
		]);
	}
	get(tok : string) : Array<vscode.MarkdownString> | undefined
	{
		const parts = tok.split('_');
		if (parts.length>1)
			return this.hmap.get(parts[0]+'_'+parts[1]);
		return undefined;
	}
}