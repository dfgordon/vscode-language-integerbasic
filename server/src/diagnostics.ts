import * as vsserv from 'vscode-languageserver/node';
import * as vsdoc from 'vscode-languageserver-textdocument';
import Parser from 'web-tree-sitter';
import * as lxbase from './langExtBase';
import * as server from './server';

const CASE_CHECK = ["statement_", "fcall_", "str_name", "int_name", "op_"];

export class DiagnosticProvider extends lxbase.LangExtBase {
	workingSymbols = new server.DocSymbols();
	diag = new Array<vsserv.Diagnostic>();
	lastGoodLineNumber = -1;
	inDimStatement = false;
	savedDepth = 0;
	row = 0;
	reset() {
		this.lastGoodLineNumber = -1;
		this.inDimStatement = false;
		this.savedDepth = 0;
		this.row = 0;
	}
	num(node: Parser.SyntaxNode): number {
		return parseInt(node.text.replace(/ /g, ''));
	}
	value_range(diag: Array<vsserv.Diagnostic>, node: Parser.SyntaxNode, low: number, high: number) {
		if (node.type != "integer")
			return;
		const parsed = this.num(node);
		if (!isNaN(parsed))
			if (parsed < low || parsed > high)
				diag.push(vsserv.Diagnostic.create(lxbase.node_to_range(node, this.row), 'Out of range (' + low + ',' + high + ')'));
	}
	is_error_inside(node: Parser.SyntaxNode): boolean {
		let child = node.firstChild;
		if (child) {
			do {
				if (child.hasError())
					return true;
				child = child.nextNamedSibling;
			} while (child);
		}
		return false;
	}
	/** Assuming we are on an opening parenthesis in a DIM statement,
	 * return the node of the corresponding closing parenthesis.
	 * This is needed because DIM variables are parsed as a flat sequence.
	 * @node the `open_dim_str` or `open_dim_int` node
	 */
	pass_through_subscript(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
		let depth = 1;
		let next: Parser.SyntaxNode | null = node.nextNamedSibling;
		while (next && depth>0) {
			if (next.type.substring(0, 5) == "open_") {
				depth++;
			} else if (next.type.substring(0, 5) == "close") {
				depth--;
			} else if (next.type.substring(0, 6) == "fcall_" && next.text.endsWith("(")) {
				depth++;
			}
			next = next.nextNamedSibling;
		}
		return next;
	}
	/** starting with `node`, find up to `nmax` variables, iterating through all younger siblings
	 * @node the eldest node in the chain of siblings
	 * @nmax maximum number of variables
	 */
	process_variable_defs(node: Parser.SyntaxNode | null, nmax: number) {
		if (!node)
			return;
		let next: Parser.SyntaxNode | null = node;
		let numFound = 0;
		while (numFound < nmax) {
			if (!next) {
				return;
			}
			if (lxbase.LEXPR.includes(next.type)) {
				numFound++;
				let [keyname, cased, isArray, isString, rng] = lxbase.lexpr_to_key(next, this.row);
				let varInfo = this.workingSymbols.vars.get(keyname);
				if (!varInfo)
					varInfo = { dec: [], def: [], ref: [], isArray, isString, case: new Set<string>() };
				if (this.inDimStatement) {
					varInfo.dec.push(rng);
				}
				else {
					varInfo.def.push(rng);
				}
				varInfo.case.add(cased);
				this.workingSymbols.vars.set(keyname, varInfo);
			}
			if (next.type == "open_dim_str" || next.type == "open_dim_int") {
				next = this.pass_through_subscript(next);
			} else {
				next = next.nextNamedSibling;
			}
		}
	}
	visit_primaries(curs: Parser.TreeCursor): lxbase.WalkerChoice {
		if (this.depth < this.savedDepth) {
			this.savedDepth = 0;
			this.inDimStatement = false;
		}
		const parent = curs.currentNode().parent;
		const rng = lxbase.curs_to_range(curs, this.row);
		if (curs.currentNode().hasError() && !this.is_error_inside(curs.currentNode()))
			return lxbase.WalkerOptions.gotoSibling;
		if (curs.nodeType == "linenum" && parent && parent.type == "line") {
			let nextStatement = curs.currentNode().nextNamedSibling;
			let remark: string | undefined;
			while (nextStatement) {
				if (nextStatement.firstNamedChild?.type == "statement_rem")
					remark = nextStatement.firstNamedChild.nextNamedSibling?.text;
				nextStatement = nextStatement.nextNamedSibling;
			}
			const num = this.num(curs.currentNode());
			if (num < 0 || num > 32767)
				this.diag.push(vsserv.Diagnostic.create(rng, 'Out of range (0,32767)'));
			else if (num <= this.lastGoodLineNumber)
				this.diag.push(vsserv.Diagnostic.create(rng, "Line number out of order"));
			else {
				this.workingSymbols.lines.set(num, {
					rem: remark,
					primary: rng,
					gosubs: new Array<vsserv.Range>(),
					gotos: new Array<vsserv.Range>()
				});
				this.lastGoodLineNumber = num;
			}
			return lxbase.WalkerOptions.gotoSibling;
		}
		else if (curs.nodeType.substring(0, 14) == "statement_dim_") {
			this.inDimStatement = true;
			this.savedDepth = this.depth;
			this.process_variable_defs(curs.currentNode(), 64);
			return lxbase.WalkerOptions.gotoParentSibling;
		}
		else if (curs.nodeType.substring(0, 11) == "assignment_") {
			this.process_variable_defs(curs.currentNode().firstNamedChild, 1);
			return lxbase.WalkerOptions.gotoParentSibling;
		}
		else if (curs.nodeType.substring(0, 16) == "statement_input_") {
			this.process_variable_defs(curs.currentNode(), 64);
			return lxbase.WalkerOptions.gotoParentSibling;
		}
		else if (curs.nodeType == "statement_for") {
			this.process_variable_defs(curs.currentNode(), 1);
			return lxbase.WalkerOptions.gotoParentSibling;
		}
		// this determines how deep in the tree we need to go
		else if (curs.nodeType == "line" || curs.nodeType == "statement")
			return lxbase.WalkerOptions.gotoChild;

		return lxbase.WalkerOptions.gotoSibling;
	}
	/** Only process the ref if it is a literal integer.
	 * Always start on GOTO, GOSUB, or THEN node (no other branching possible).
	 */
	process_linenum_ref(curs: Parser.TreeCursor): lxbase.WalkerChoice {
		let next: Parser.SyntaxNode | null = curs.currentNode().nextNamedSibling;
		if (next) {
			if (next.type == "integer") {
				const rng = lxbase.node_to_range(next, this.row);
				const num = this.num(next);
				const line = this.workingSymbols.lines.get(num);
				if (line) {
					const ranges = curs.nodeType == "statement_gosub" ? line.gosubs : line.gotos;
					ranges.push(rng);
				}
				else if (next.parent && next.parent.hasError()) {
					this.diag.push(vsserv.Diagnostic.create(rng, 'Maybe unanalyzed (fix line)', vsserv.DiagnosticSeverity.Warning));
					return lxbase.WalkerOptions.gotoSibling;
				}
				else
					this.diag.push(vsserv.Diagnostic.create(rng, 'Line does not exist'));
				return lxbase.WalkerOptions.gotoParentSibling;
			}
		}
		return lxbase.WalkerOptions.gotoChild;
	}
	/** This is designed to take only the inner node.
	 * Child and sibling are used to identify strings and arrays.
	 */
	process_variable_ref(curs: Parser.TreeCursor): lxbase.WalkerChoice {
		let [keyname, cased, isArray, isString] = lxbase.var_to_key(curs.currentNode());
		const nameRange = lxbase.node_to_range(curs.currentNode(), this.row);
		const varInfo = this.workingSymbols.vars.get(keyname);
		if ((!varInfo || varInfo && varInfo.dec.length == 0) && this.config.warn.undeclaredArrays) {
			if (isArray && !isString)
				this.diag.push(vsserv.Diagnostic.create(nameRange, "array is never DIM'd", vsserv.DiagnosticSeverity.Warning));
			if (isString)
				this.diag.push(vsserv.Diagnostic.create(nameRange, "string is never DIM'd", vsserv.DiagnosticSeverity.Warning));
		}
		if (!varInfo || varInfo && varInfo.def.length == 0)
			if (this.config.warn.undefinedVariables)
				this.diag.push(vsserv.Diagnostic.create(nameRange, "variable is never assigned", vsserv.DiagnosticSeverity.Warning));
		if (varInfo && varInfo.dec.length > 0 && !isArray && !isString)
			this.diag.push(vsserv.Diagnostic.create(nameRange, "unsubscripted integer array returns the first element", vsserv.DiagnosticSeverity.Information));
		if (!varInfo)
			this.workingSymbols.vars.set(keyname, { dec: [], def: [], ref: [nameRange], isArray, isString, case: new Set<string>([cased]) });
		else {
			varInfo.ref.push(nameRange);
			varInfo.case.add(cased);
		}
		return lxbase.WalkerOptions.gotoSibling;
	}
	visit_node(curs: Parser.TreeCursor): lxbase.WalkerChoice {
		if (this.depth < this.savedDepth) {
			this.savedDepth = 0;
			this.inDimStatement = false;
		}
		const rng = lxbase.curs_to_range(curs, this.row);
		if (this.config.case.caseSensitive) {
			for (const chk of CASE_CHECK) {
				if (curs.nodeType.substring(0,chk.length)==chk && curs.nodeText != curs.nodeText.toUpperCase())
					this.diag.push(vsserv.Diagnostic.create(rng, 'settings require upper case'));
			}
		}
		if (curs.currentNode().hasError() && !this.is_error_inside(curs.currentNode())) {
			this.diag.push(vsserv.Diagnostic.create(rng, "syntax error:\n" + curs.currentNode().toString()));
		}
		if (curs.nodeType == "line") {
			if (curs.currentNode().text.trimEnd().length > this.config.warn.length)
				this.diag.push(vsserv.Diagnostic.create(rng, 'Line may be too long', vsserv.DiagnosticSeverity.Warning));
		} else if (["statement_goto", "statement_gosub", "statement_then_line"].includes(curs.nodeType)) {
			return this.process_linenum_ref(curs);
		} else if (curs.nodeType == "statement_poke") {
			const addr = curs.currentNode().nextNamedSibling;
			const sep = addr?.nextNamedSibling;
			const byte = sep?.nextNamedSibling;
			if (addr)
				this.value_range(this.diag, addr, -32767, 32767);
			if (byte)
				this.value_range(this.diag, byte, 0, 255);
		}
		else if (curs.nodeType == "fcall_peek") {
			const open = curs.currentNode().nextNamedSibling;
			const addr = open?.nextNamedSibling;
			if (addr)
				this.value_range(this.diag, addr, -32767, 32767);
		}
		else if (curs.nodeType == "statement_coloreq") {
			const col = curs.currentNode().nextNamedSibling;
			if (col)
				this.value_range(this.diag, col, 0, 255);
		}
		else if (curs.nodeType == "statement_call") {
			const addr = curs.currentNode().nextNamedSibling;
			if (addr)
				this.value_range(this.diag, addr, -32767, 32767);
		}
		else if (curs.nodeType.substring(0, 10) == "assignment") {
			const child = curs.currentNode().firstNamedChild;
			if (child && child.type != "statement_let") {
				// cannot have NEXTA=1, but can have NEXT=1 or NEXT1=1
				const errPattern = /^ *(D *S *P|N *O *D *S *P|N *E *X *T|I *N *P *U *T) *[A-Z]/i;
				if (child.text.match(errPattern)) {
					const childRng = lxbase.node_to_range(child, this.row);
					this.diag.push(vsserv.Diagnostic.create(childRng, 'illegal variable name, try LET'));
				}
			}
		}
		else if (lxbase.SIMPLE_VAR_TYPES.includes(curs.nodeType)) {
			// this will cover arrays within by looking at context
			this.process_variable_ref(curs);
		}
		else if (curs.nodeType.substring(0, 14) == "statement_dim_") {
			this.inDimStatement = true;
			this.savedDepth = this.depth;
		}
		return lxbase.WalkerOptions.gotoChild;
	}
	update(document: vsdoc.TextDocument): Array<vsserv.Diagnostic> {
		this.diag = new Array<vsserv.Diagnostic>();
		if (document && document.languageId == 'integerbasic') {
			this.workingSymbols = new server.DocSymbols();
			const lines = document.getText().split(/\r?\n/);
			this.reset();
			for (this.row = 0; this.row < lines.length; this.row++) {
				const syntaxTree = this.parse(lines[this.row], "\n");
				this.walk(syntaxTree, this.visit_primaries.bind(this));
			}
			this.reset();
			for (this.row = 0; this.row < lines.length; this.row++) {
				const syntaxTree = this.parse(lines[this.row], "\n");
				this.walk(syntaxTree, this.visit_node.bind(this));
			}
		}
		return this.diag;
	}
}