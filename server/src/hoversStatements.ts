import * as vsserv from 'vscode-languageserver/node';

function MarkdownString(s: string): vsserv.MarkupContent
{
	return { kind: 'markdown', value: s}
}

function exampleString(examples: string[]) : vsserv.MarkupContent
{
	return MarkdownString('#### examples\n\n    ' + examples.join('\n    '));
}

export class StatementHovers
{
	hmap: Map<string,Array<vsserv.MarkupContent>>;

	constructor()
	{
		this.hmap = new Map<string,Array<vsserv.MarkupContent>>();
			
		this.hmap.set("fcall_abs",[
			MarkdownString('absolute value'),
			MarkdownString('`ABS (aexpr)`')
		]);
		this.hmap.set("fcall_ascp",[
			MarkdownString('ASCII code of first character'),
			MarkdownString('`ASC (sexpr)`')
		]);
		this.hmap.set("statement_call",[
			MarkdownString('Call machine language subroutine at decimal address.'),
			MarkdownString('`CALL aexpr`'),
			exampleString(['CALL 768'])
		]);
		this.hmap.set("statement_coloreq",[
			MarkdownString('Set the low resolution color'),
			MarkdownString('`COLOR = aexpr`')
		]);
		this.hmap.set("statement_dim",[
			MarkdownString('allocate space for arrays or strings'),
			MarkdownString('`DIM name[$] (aexpr) [{,name[$] (aexpr)}]`')
		]);
		this.hmap.set("statement_dsp",[
			MarkdownString('watch variable during execution'),
			MarkdownString('`DSP name[$]`')
		]);
		this.hmap.set("statement_end",[
			MarkdownString('stop program execution'),
			MarkdownString('`END`')
		]);
		this.hmap.set("statement_for",[
			MarkdownString('start a loop indexing on the given variable'),
			MarkdownString('`FOR name = aexpr TO aexpr [STEP aexpr]`')
		]);
		this.hmap.set("statement_gosub",[
			MarkdownString('Execute the subroutine starting at the given line number, which can be an expression.'),
			MarkdownString('`GOSUB aexpr`')
		]);
		this.hmap.set("statement_goto",[
			MarkdownString('Branch to the given line number, which can be an expression.'),
			MarkdownString('`GOTO aexpr`')
		]);
		this.hmap.set("statement_gr",[
			MarkdownString('Switch to low resolution graphics and clear the screen.'),
			MarkdownString('`GR`')
		]);
		this.hmap.set("statement_hlin",[
			MarkdownString('Draw a horizontal line on the low resolution screen.'),
			MarkdownString('`HLIN aexpr,aexpr AT aexpr`')
		]);
		this.hmap.set("statement_if",[
			MarkdownString('Execute statement following `THEN` if the condition is true. If `THEN` does not branch, a trailing statment always executes.'),
			MarkdownString('`IF expr THEN statement[{:statement}]`'),
			exampleString([
				'IF X<Y THEN X = 0: Y = 0',
				'IF A$ = "Y" THEN GOTO 100',
				'IF A$ = "Y" THEN 100'])
		]);
		this.hmap.set("statement_inn",[
			MarkdownString('Switch input to a numbered expansion slot.'),
			MarkdownString('`IN# aexpr`')
		]);
		this.hmap.set("statement_input",[
			MarkdownString('Read from the current input device, optionally with prompt'),
			MarkdownString('`INPUT [sexpr,]var[{,var}]`'),
			exampleString([
				'INPUT PRICE',
				'INPUT "WHAT IS YOUR PASSWORD? ", PASSWD$'])
		]);
		this.hmap.set("fcall_lenp",[
			MarkdownString('length of a string'),
			MarkdownString('`LEN (sexpr)`')
		]);
		this.hmap.set("statement_let",[
			MarkdownString('`LET` is optional in assignments. It can widen the range of acceptable variable names.')
		]);
		this.hmap.set("statement_list",[
			MarkdownString('output program listing to current device'),
			MarkdownString('`LIST [linenum] [,linenum]`')
		]);
		this.hmap.set("statement_next",[
			MarkdownString('Mark the end of a loop.'),
			MarkdownString('`NEXT avar[{,avar}]`')
		]);
		this.hmap.set("statement_nodsp",[
			MarkdownString('Do not watch variable during execution.'),
			MarkdownString('`NODSP name[$]`')
		]);
		this.hmap.set("statement_notrace",[
			MarkdownString('cancel display of line numbers during execution'),
			MarkdownString('`NOTRACE`')
		]);
		this.hmap.set("fcall_pdl",[
			MarkdownString('Read the dial on the given game paddle.'),
			MarkdownString('`PDL (aexpr)`')
		]);
		this.hmap.set("fcall_peek",[
			MarkdownString('byte value at the given decimal address'),
			MarkdownString('`PEEK (aexpr)`')
		]);
		this.hmap.set("statement_plot",[
			MarkdownString('display low resolution pixel'),
			MarkdownString('`PLOT aexpr,aexpr`')
		]);
		this.hmap.set("statement_poke",[
			MarkdownString('set byte value at the given decimal address'),
			MarkdownString('`POKE aexpr,aexpr`')
		]);
		this.hmap.set("statement_pop",[
			MarkdownString('remove the most recent return address from the stack'),
			MarkdownString('`POP`')
		]);
		this.hmap.set("statement_prn",[
			MarkdownString('switch output to the given numbered expansion slot'),
			MarkdownString('`PR# aexpr`')
		]);
		this.hmap.set("statement_print",[
			MarkdownString('Write to the current output device.'),
			MarkdownString('`PRINT [expr[{,expr|;expr|,|;}]]`'),
			exampleString([
				'PRINT',
				'PRINT A$, "X = ";X'])
		]);
		this.hmap.set("statement_rem",[
			MarkdownString('start of a comment (remark)'),
			MarkdownString('`REM {character}`')
		]);
		this.hmap.set("statement_return",[
			MarkdownString('return from subroutine'),
			MarkdownString('`RETURN`')
		]);
		this.hmap.set("fcall_rnd",[
			MarkdownString('Uniform deviate between 0 and aexpr-1 if aexpr>0, between 0 and aexpr+1 otherwise.'),
			MarkdownString('`RND (aexpr)`')
		]);
		this.hmap.set("fcall_scrnp",[
			MarkdownString('color code at position on low resolution graphics screen'),
			MarkdownString('`SCRN (aexpr,aexpr)`')
		]);
		this.hmap.set("fcall_sgn",[
			MarkdownString('sign function, gives -1,0, or 1'),
			MarkdownString('`SGN (aexpr)`')
		]);
		this.hmap.set("statement_tab",[
			MarkdownString('move text cursor to given column, numbered from 1'),
			MarkdownString('`TAB aexpr`')
		]);
		this.hmap.set("statement_text",[
			MarkdownString('switch display to text'),
			MarkdownString('`TEXT`')
		]);
		this.hmap.set("statement_then",[
			MarkdownString('see `IF`'),
		]);
		this.hmap.set("statement_trace",[
			MarkdownString('display each line number during execution'),
			MarkdownString('`TRACE`')
		]);
		this.hmap.set("statement_vlin",[
			MarkdownString('draw a vertical line on the low resolution screen'),
			MarkdownString('`VLIN aexpr,aexpr AT aexpr`')
		]);
		this.hmap.set("statement_vtab",[
			MarkdownString('move text cursor to the given row, numbered from 1'),
			MarkdownString('`VTAB aexpr`')
		]);
	}
	get(tok : string) : Array<vsserv.MarkupContent> | undefined
	{
		const parts = tok.split('_');
		if (parts.length>1)
			return this.hmap.get(parts[0]+'_'+parts[1]);
		return undefined;
	}
}