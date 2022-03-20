import * as vscode from 'vscode';
import * as lxbase from '../../langExtBase';
import * as com from '../../commands';
import * as assert from 'assert';

// Tokenization is tested against Virtual ][
// This assembly program generates the hex dump, which is then copied
// and pasted directly into the test.
//          ORG   300
// ZPTR     EQU   $06
// SPTR     EQU   $08
// PRGST    EQU   $CA
// PRGEND   EQU   $4C
// PRBYTE   EQU   $FDDA
//          LDA   PRGST
//          STA   ZPTR
//          LDA   PRGST+1
//          STA   ZPTR+1
//          LDA   PRGEND
//          STA   SPTR
//          LDA   PRGEND+1
//          STA   SPTR+1
// :LOOP    LDY   #$00
//          LDA   (ZPTR),Y
//          JSR   PRBYTE
//          CLC
//          LDA   #$01
//          ADC   ZPTR
//          STA   ZPTR
//          LDA   #$00
//          ADC   ZPTR+1
//          STA   ZPTR+1
//          LDA   SPTR
//          CMP   ZPTR
//          BNE   :LOOP
//          LDA   SPTR+1
//          CMP   ZPTR+1
//          BNE   :LOOP
//          RTS
// Following hex can be pasted into the Monitor:
// 300: A5 CA 85 06 A5 CB 85 07
// 308: A5 4C 85 08 A5 4D 85 09
// 310: A0 00 B1 06 20 DA FD 18
// 318: A9 01 65 06 85 06 A9 00
// 320: 65 07 85 07 A5 08 C5 06
// 328: D0 E6 A5 09 C5 07 D0 E0
// 330: 60

describe('Output Statements', async function() {
	//vscode.window.showInformationMessage('Start output statements');
	this.beforeEach(async function() {
		const TSInitResult = await lxbase.TreeSitterInit();
		this.tokTool = new com.TokenizationTool(TSInitResult);
	});
	it('single line', function() {
		const testCode = '10 TEXT\n';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "050A004B01";
		assert.deepStrictEqual(actual,expected);
	});
	it('multi line', function() {
		const testCode = '10 TEXT\n20 PRINT "HELLO"\n';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "050A004B010C14006128C8C5CCCCCF2901";
		assert.deepStrictEqual(actual,expected);
	});
	it('print with nulls', function() {
		const testCode = '10 print a,B, ,C;d$;;;E$\n';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "130A0062C149C24A49C345C440474745C54001";
		assert.deepStrictEqual(actual,expected);
	});
});

describe('Expressions', async function() {
	this.beforeEach(async function() {
		const TSInitResult = await lxbase.TreeSitterInit();
		this.tokTool = new com.TokenizationTool(TSInitResult);
	});
	it('simple', function() {
		const testCode = '10 X = 1 + 1\n';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "0D0A00D871B1010012B1010001";
		assert.deepStrictEqual(actual,expected);
	});
	it('negative numbers', function() {
		const testCode = '10 X = -1\n';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "0A0A00D87136B1010001";
		assert.deepStrictEqual(actual,expected);
	});
	it('double negative', function() {
		const testCode = '10 X = - - 1\n';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "0B0A00D8713636B1010001";
		assert.deepStrictEqual(actual,expected);
	});
	it('nested', function() {
		const testCode = '10 X = 6*(1 + (X1 + X2)*5)\n';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "1B0A00D871B606001438B101001238D8B112D8B27214B505007201";
		assert.deepStrictEqual(actual,expected);
	});
	it('logic values', function() {
		const testCode = '10 COLOR = I/2*(I<32)\n';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "120A0066C915B202001438C91CB320007201";
		assert.deepStrictEqual(actual,expected);
	});
	it('with functions', function() {
		const testCode = '10 X = 6*(abs(X0) + (sgn(X1) + asc(A$))*5)\n';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "220A00D871B606001438313FD8B0721238303FD8B172123CC140727214B505007201";
		assert.deepStrictEqual(actual,expected);
	});
});

describe('Graphics', async function() {
	this.beforeEach(async function() {
		const TSInitResult = await lxbase.TreeSitterInit();
		this.tokTool = new com.TokenizationTool(TSInitResult);
	});
	it('low res statements', function() {
		const testCode = '10 gr: color=4\n20 X=5:Y=5\n30 plot X,Y\n40 hlin X+1,X+10 at Y\n50 vlin Y+1,Y+10 at X';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "0A0A004C0366B40400010F1400D871B5050003D971B5050001081E0067D868D90112280069D812B101006AD812B10A006BD9011232006CD912B101006DD912B10A006ED801";
		assert.deepStrictEqual(actual,expected);
	});
	it('low res functions', function() {
		const testCode = '10 C = SCRN(X,Y)';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "0B0A00C3713DD83ED97201";
		assert.deepStrictEqual(actual,expected);
	});
});

describe('Control', async function() {
	this.beforeEach(async function() {
		const TSInitResult = await lxbase.TreeSitterInit();
		this.tokTool = new com.TokenizationTool(TSInitResult);
	});
	it('binary ascii collisions', function() {
		const testCode = '32 x = 32';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "092000D871B3200001";
		assert.deepStrictEqual(actual,expected);
	});
	it('goto, gosub, end, return', function() {
		const testCode = '10 gosub 1000: goto 100\n100 end\n1000 return';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "0D0A005CB1E803035FB1640001056400510105E8035B01";
		assert.deepStrictEqual(actual,expected);
	});
	it('loop', function() {
		const testCode = '10 for i = 1 to LAST: print i: next I';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "150A0055C956B1010057CCC1D3D40362C90359C901";
		assert.deepStrictEqual(actual,expected);
	});
	it('if then', function() {
		let testCode = '10 if x > y then 1000\n';
		testCode += '20 if X < Y then 1010\n';
		testCode += '30 if X <> Y then 1020\n';
		testCode += '40 if X = Y then 1030\n';
		const tree = this.tokTool.parse(testCode,'');
		const tokStr = this.tokTool.tokenize(tree);
		const actual = this.tokTool.hex_from_raw_str(tokStr);
		const expected = "0C0A0060D819D924B1E803010C140060D81CD924B1F203010C1E0060D81BD924B1FC03010C280060D816D924B1060401";
		assert.deepStrictEqual(actual,expected);
	});
});
