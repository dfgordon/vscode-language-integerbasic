import * as vscode from 'vscode';
import Parser from 'web-tree-sitter';
import * as lxbase from './langExtBase';

// Apparently no standard provider, so make one up
export class TSDiagnosticProvider extends lxbase.LineNumberTool
{
	node_to_range(node: Parser.SyntaxNode): vscode.Range
	{
		const start_pos = new vscode.Position(node.startPosition.row,node.startPosition.column);
		const end_pos = new vscode.Position(node.endPosition.row,node.endPosition.column);
		return new vscode.Range(start_pos,end_pos);
	}
	value_range(diag: Array<vscode.Diagnostic>,node: Parser.SyntaxNode,low:number,high:number)
	{
		if (node.type!="integer")
			return;
		const rng = this.node_to_range(node);
		const parsed = parseInt(node.text);
		if (!isNaN(parsed))
			if (parsed<low || parsed>high)
				diag.push(new vscode.Diagnostic(rng,'Out of range ('+low+','+high+')'));
	}
	is_error_inside(node: Parser.SyntaxNode): boolean
	{
		let child = node.firstChild;
		if (child)
		{
			do
			{
				if (child.hasError())
					return true;
				child = child.nextNamedSibling;
			} while (child);
		}
		return false;
	}
	process_node(diag: Array<vscode.Diagnostic>,nums: Array<number>,curs: Parser.TreeCursor): boolean
	{
		const rng = this.curs_to_range(curs);
		if (curs.currentNode().hasError())
		{
			if (!this.is_error_inside(curs.currentNode()))
				diag.push(new vscode.Diagnostic(rng,curs.currentNode().toString(),vscode.DiagnosticSeverity.Error));
		}
		if (curs.nodeType=="line")
		{
			if (curs.currentNode().text.trimEnd().length>150)
				diag.push(new vscode.Diagnostic(rng,'Line may be too long',vscode.DiagnosticSeverity.Warning));
		}
		if (curs.nodeType=="linenum")
		{
			const parsed = parseInt(curs.nodeText.replace(/ /g,''));
			if (isNaN(parsed))
				diag.push(new vscode.Diagnostic(rng,'Line number is not a number')); // should not happen
			else if (parsed<0 || parsed>32767)
				diag.push(new vscode.Diagnostic(rng,'Out of range (0,32767)'));
			else if (nums.indexOf(parsed)==-1 && curs.currentNode().previousNamedSibling)
				diag.push(new vscode.Diagnostic(rng,'Line does not exist'));
		}
		if (curs.nodeType=="statement_poke")
		{
			const addr = curs.currentNode().nextNamedSibling;
			const sep = addr?.nextNamedSibling;
			const byte = sep?.nextNamedSibling;
			if (addr)
				this.value_range(diag,addr,-32767,32767);
			if (byte)
				this.value_range(diag,byte,0,255);
		}
		if (curs.nodeType=="fcall_peek")
		{
			const open = curs.currentNode().nextNamedSibling;
			const addr = open?.nextNamedSibling;
			if (addr)
				this.value_range(diag,addr,-32767,32767);
		}
		if (curs.nodeType=="statement_coloreq")
		{
			const col = curs.currentNode().nextNamedSibling;
			if (col)
				this.value_range(diag,col,0,255);
		}
		if (curs.nodeType=="statement_call")
		{
			const addr = curs.currentNode().nextNamedSibling;
			if (addr)
				this.value_range(diag,addr,-32767,32767);
		}
		return true;
	}
	update(document : vscode.TextDocument, collection: vscode.DiagnosticCollection): void
	{
		if (document && document.languageId=='integerbasic')
		{
			const diag = Array<vscode.Diagnostic>();
			const syntaxTree = this.parse(document.getText()+"\n");
			// First gather and check the primary line numbers
			const line_numbers = this.get_primary_nums(syntaxTree);
			this.add_linenum_diagnostics(diag);
			// Now run general diagnostics
			const cursor = syntaxTree.walk();
			let recurse = true;
			let finished = false;
			do
			{
				if (recurse && cursor.gotoFirstChild())
					recurse = this.process_node(diag,line_numbers,cursor);
				else
				{
					if (cursor.gotoNextSibling())
						recurse = this.process_node(diag,line_numbers,cursor);
					else if (cursor.gotoParent())
						recurse = false;
					else
						finished = true;
				}
			} while (!finished);
			collection.set(document.uri, diag);
		}
		else
		{
			collection.clear();
		}
	}
}