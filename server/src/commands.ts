import Parser from 'web-tree-sitter';
import * as vsserv from 'vscode-languageserver';
import * as lxbase from './langExtBase';
import * as detokenize_map from './detokenize_map.json';
import * as tokenize_map from './tokenize_map.json';

export class LineNumberTool extends lxbase.LangExtBase
{
	// TODO: make this parse line by line
	nums = new Array<number>();
	rngs = new Array<vsserv.Range>();
	leading_space = new Array<number>();
	trailing_space = new Array<number>();
	clear()
	{
		this.nums = new Array<number>();
		this.rngs = new Array<vsserv.Range>();
		this.leading_space = new Array<number>();
		this.trailing_space = new Array<number>();
	}
	push_linenum(curs: Parser.TreeCursor)
	{
		const rng = lxbase.curs_to_range(curs,0);
		const leading = curs.nodeText.length - curs.nodeText.trimStart().length;
		const trailing = curs.nodeText.length - curs.nodeText.trimEnd().length;
		const parsed = parseInt(curs.nodeText.replace(/ /g,''));
		if (!isNaN(parsed))
		{
			this.nums.push(parsed);
			this.rngs.push(rng);
			this.leading_space.push(leading);
			this.trailing_space.push(trailing);
		}
	}
	visitPrimaryLineNumber(curs:Parser.TreeCursor) : lxbase.WalkerChoice
	{
		const parent = curs.currentNode().parent;
		if (curs.nodeType=="linenum" && parent)
			if (parent.type=="line")
			{
				this.push_linenum(curs);
				return lxbase.WalkerOptions.gotoParentSibling;
			}
		return lxbase.WalkerOptions.gotoChild;
	}
	visitSecondaryLineNumber(curs:Parser.TreeCursor) : lxbase.WalkerChoice
	{
		const prev = curs.currentNode().previousNamedSibling;
		if (curs.nodeType=="integer" && prev)
			if (["statement_goto","statement_gosub","statement_then_line"].indexOf(prev.type)>=0)
			{
				this.push_linenum(curs);
				return lxbase.WalkerOptions.gotoSibling;
			}
		const parent = curs.currentNode().parent;
		if (curs.nodeType=="linenum" && parent)
			if (parent.type!="line")
			{
				this.push_linenum(curs);
				return lxbase.WalkerOptions.gotoSibling;
			}
		return lxbase.WalkerOptions.gotoChild;
	}
	get_primary_nums(tree: Parser.Tree) : Array<number>
	{
		this.clear();
		this.walk(tree,this.visitPrimaryLineNumber.bind(this));
		return this.nums;
	}
	apply_mapping(i: number,mapping: Map<number,number>,edits: Array<vsserv.TextEdit>)
	{
		const new_num =  mapping.get(this.nums[i]);
		if (new_num!=undefined)
		{
			let fmt_num = ' '.repeat(this.leading_space[i]);
			fmt_num += new_num.toString();
			fmt_num += ' '.repeat(this.trailing_space[i]);
			edits.push(vsserv.TextEdit.replace(this.rngs[i],fmt_num));
		}
	}
	renumber(doc: vsserv.TextDocumentItem, ext_sel: vsserv.Range | null, start: string, step: string, updateRefs: boolean):
		[vsserv.TextDocumentEdit | undefined,string]
	{
		const l0 = parseInt(start);
		const dl = parseInt(step);
		if (isNaN(l0) || isNaN(dl) || l0<0 || dl<1)
			return [undefined,'start and step parameters invalid'];
		let lower_guard = undefined;
		let upper_guard = undefined;
		let txt = doc.text;
		const lines = txt.split(/\r?\n/);
		if (ext_sel)
		{
			let l = ext_sel.start.line - 1;
			while (l>=0 && !lower_guard)
			{
				const matches = lines[l].match(/^\s*[0-9 ]+/);
				if (matches)
					lower_guard = parseInt(matches[0])+1;
				l--;
			}
			l = ext_sel.end.line + 1;
			while (l<lines.length && !upper_guard)
			{
				const matches = lines[l].match(/^\s*[0-9 ]+/);
				if (matches)
					upper_guard = parseInt(matches[0])-1;
				l++;
			}
			txt = '';
			for (l = ext_sel.start.line; l <= ext_sel.end.line; l++)
				txt += lines[l] + '\n';
		}
		let syntaxTree = this.parse(txt,"\n");
		const line_numbers = this.get_primary_nums(syntaxTree);
		const lN = l0 + dl*(line_numbers.length-1);
		if (!lower_guard)
			lower_guard = 0;
		if (!upper_guard)
			upper_guard = 32767;
		if (lower_guard<0)
			lower_guard = 0;
		if (upper_guard>32767)
			upper_guard = 32767;
		if (l0<lower_guard || lN>upper_guard)
			return [undefined,'new range ('+l0+','+lN+') exceeds bounds ('+lower_guard+','+upper_guard+')'];
		// setup the mapping from old to new line numbers
		const mapping = new Map<number,number>();
		for (let i=0;i<line_numbers.length;i++)
			mapping.set(line_numbers[i],l0+i*dl);
		// apply the mapping
		const edits = new Array<vsserv.TextEdit>();
		txt = doc.text;
		syntaxTree = this.parse(txt, "\n");
		// Modify primary line numbers only in selected range
		this.clear();
		this.walk(syntaxTree,this.visitPrimaryLineNumber.bind(this));
		for (let i=0;i<this.nums.length;i++)
			if (ext_sel==undefined || lxbase.rangeContainsRange(ext_sel,this.rngs[i]))
				this.apply_mapping(i,mapping,edits);
		// Modify line number references globally
		if (updateRefs)
		{
			this.clear();
			this.walk(syntaxTree,this.visitSecondaryLineNumber.bind(this));
			for (let i=0;i<this.nums.length;i++)
				this.apply_mapping(i,mapping,edits);
		}
		return [vsserv.TextDocumentEdit.create(doc, edits),''];
	}
}

export class Tokenizer extends lxbase.LangExtBase
{
	err = new Array<string>();
	tokenizedLine = new Array<number>();
	encode_int16(int16: number) : [number,number]
	{
		const hiByte = Math.floor(int16/256);
		const loByte = int16 - hiByte*256;
		return [loByte,hiByte];
	}
	stringlike_node_to_bytes(txt: string, trim: boolean): number[] {
		const trimmed = trim ? txt.trimStart().toString() : txt;
		return lxbase.escaped_string_to_bytes(trimmed);
	}
	tokenize_node(curs: Parser.TreeCursor) : lxbase.WalkerChoice
	{
		// At this point we assume we have ASCII in this.line

		// Numbers to binary
		if (['integer','linenum'].includes(curs.nodeType))
		{
			const val = parseInt(curs.nodeText.replace(/ /g,''));
			const firstDigit = parseInt(val.toString(10)[0]); // effectively strips leading zeros
			const bytes = this.encode_int16(val);
			if (curs.nodeType=="integer")
				this.tokenizedLine.push(176+firstDigit);
			this.tokenizedLine.push(bytes[0]);
			this.tokenizedLine.push(bytes[1]);
			return lxbase.WalkerOptions.gotoSibling;
		}

		// Anonymous nodes would go here

		// Positive ASCII tokens
		if (curs.nodeType in tokenize_map) {
			this.tokenizedLine.push(Object(tokenize_map)[curs.nodeType] as number);
			return lxbase.WalkerOptions.gotoSibling;
		}
		
		// Put variables in upper case and negative ASCII
		if (lxbase.SIMPLE_VAR_TYPES.includes(curs.nodeType)) {
			const cleaned = curs.nodeText.replace(/ /g, "").toUpperCase();
			let asc = Buffer.from(cleaned);
			// following also tokenizes `$` and puts to negative ASCII
			let neg = asc.map((v, i, ary) => { return v == 36 ? 64 : v + 128 });
			this.tokenizedLine.push(...Array.from(neg));
			return lxbase.WalkerOptions.gotoSibling;
		}
		
		// Strings
		if (curs.nodeType == 'string') {
			let txt = this.stringlike_node_to_bytes(curs.nodeText, false);
			let neg = [0x28].concat(txt.slice(1,txt.length-1),0x29);
			this.tokenizedLine.push(...neg);
			return lxbase.WalkerOptions.gotoSibling;
		}

		// Comments
		if (curs.nodeType == 'comment_text') {
			let neg = this.stringlike_node_to_bytes(curs.nodeText, false);
			this.tokenizedLine.push(...neg);
			return lxbase.WalkerOptions.gotoSibling;
		}
		
		// If none of the above, look for terminal nodes and strip spaces
		if (curs.currentNode().namedChildCount==0) {
			const cleaned = curs.nodeText.replace(/ /g, "").toUpperCase();
			this.tokenizedLine.push(...Buffer.from(cleaned));
			return lxbase.WalkerOptions.gotoSibling;
		}

		return lxbase.WalkerOptions.gotoChild;
	}
	tokenize_line(line: string)
	{
		this.tokenizedLine = [];
		let lineTree = this.parse(line,'\n');
		this.walk(lineTree, this.tokenize_node.bind(this));
		if (this.tokenizedLine.length > 126) {
			this.err.push("line too long");
			return;
		}
	}
	tokenize(program: string) : number[]
	{
		this.err = [];
		const lines = program.split(/\r?\n/);
		const tokenizedProgram = [];
		for (const line of lines) {
			if (line.trim().length == 0) {
				continue;
			}
			this.tokenize_line(line);
			tokenizedProgram.push(this.tokenizedLine.length + 2);
			tokenizedProgram.push(...this.tokenizedLine);
			tokenizedProgram.push(1);
		}
		if (this.err.length > 0)
			return [];
		return tokenizedProgram;
	}
	/** Detokenize based on state of main memory */
	detokenize(img: number[]) : string
	{
		const OPEN_QUOTE = 0x28;
		const CLOSE_QUOTE = 0x29;
		const REM_TOK = 93;
		const EOL = 1;
		let addr = img[202] + img[203]*256;
		const himem = img[76] + img[77]*256;
		let code = '';
		while (addr < himem && addr < img.length-3)
		{
			addr += 1; // skip record length
			const line_num = img[addr] + img[addr+1]*256;
			code += line_num.toString() + ' ';
			addr += 2;
			let escaped = "";
			while (img[addr] != EOL && addr < img.length - 1) {
				if (img[addr] == OPEN_QUOTE) {
					code += "\"";
					[escaped, addr] = lxbase.bytes_to_escaped_string(
						this.config.detokenizer.escapes, img, addr + 1, [CLOSE_QUOTE, EOL]);
					code += escaped;
					if (img[addr] == CLOSE_QUOTE) {
						code += "\"";
						addr += 1;
					}
				}
				else if (img[addr] == REM_TOK) {
					if (code.charAt(code.length - 1) != ' ')
						code += ' ';
					code += 'REM'; // real Apple II would add trailing space, breaking symmetry with tokenizer
					[escaped, addr] = lxbase.bytes_to_escaped_string(
						this.config.detokenizer.escapes, img, addr + 1, [EOL]);
					code += escaped;
				} else if (img[addr] < 128) {
					const maybe_tok = Object(detokenize_map)[img[addr].toString()];
					let tok = "???";
					if (maybe_tok)
						tok = maybe_tok.toUpperCase();
					if (tok.length > 1 && tok!="<>" && code.charAt(code.length - 1) != ' ')
						code += ' ';
					code += tok;
					if (tok.length > 1 && tok!="<>" && !['(','='].includes(tok.charAt(tok.length-1)))
						code += ' ';
					addr += 1;
				} else if (img[addr] >= 176 && img[addr] <= 185) {
					// next 2 bytes are a binary number
					code += (img[addr + 1] + img[addr + 2] * 256).toString();
					addr += 3;
				} else {
					// this is a variable name
					while (img[addr] >= 128) {
						code += String.fromCharCode(img[addr]-128);
						addr += 1;
					}
				}
			}
			code += '\n';
			addr += 1;
		}
		return code;
	}
}
