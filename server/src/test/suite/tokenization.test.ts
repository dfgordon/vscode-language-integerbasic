import * as config from '../../settings';
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

async function testTokenizer(code: string, expected: string) {
	const TSInitResult = await lxbase.TreeSitterInit();
	const tool = new com.Tokenizer(TSInitResult,console,config.defaultSettings);
	const tokArray = tool.tokenize(code);
	const actual = lxbase.hex_from_bytes(tokArray);
	assert.deepStrictEqual(actual, expected);
}

describe('Output Statements', async function() {
	it('single line', async function() {
		const testCode = '10 TEXT\n';
		const expected = "050A004B01";
		await testTokenizer(testCode,expected);
	});
	it('multi line', async function() {
		const testCode = '10 TEXT\n20 PRINT "HELLO"\n';
		const expected = "050A004B010C14006128C8C5CCCCCF2901";
		await testTokenizer(testCode,expected);
	});
	it('print with nulls', async function() {
		const testCode = '10 print a,B, ,C;d$;;;E$\n';
		const expected = "130A0062C149C24A49C345C440474745C54001";
		await testTokenizer(testCode,expected);
	});
});

describe('Expressions', async function() {
	it('simple', async function() {
		const testCode = '10 X = 1 + 1\n';
		const expected = "0D0A00D871B1010012B1010001";
		await testTokenizer(testCode,expected);
	});
	it('negative numbers', async function() {
		const testCode = '10 X = -1\n';
		const expected = "0A0A00D87136B1010001";
		await testTokenizer(testCode,expected);
	});
	it('double negative', async function() {
		const testCode = '10 X = - - 1\n';
		const expected = "0B0A00D8713636B1010001";
		await testTokenizer(testCode,expected);
	});
	it('nested', async function() {
		const testCode = '10 X = 6*(1 + (X1 + X2)*5)\n';
		const expected = "1B0A00D871B606001438B101001238D8B112D8B27214B505007201";
		await testTokenizer(testCode,expected);
	});
	it('logic values', async function() {
		const testCode = '10 COLOR = I/2*(I<32)\n';
		const expected = "120A0066C915B202001438C91CB320007201";
		await testTokenizer(testCode,expected);
	});
	it('with functions', async function() {
		const testCode = '10 X = 6*(abs(X0) + (sgn(X1) + asc(A$))*5)\n';
		const expected = "220A00D871B606001438313FD8B0721238303FD8B172123CC140727214B505007201";
		await testTokenizer(testCode,expected);
	});
});

describe('Graphics', async function() {
	it('low res statements', async function() {
		const testCode = '10 gr: color=4\n20 X=5:Y=5\n30 plot X,Y\n40 hlin X+1,X+10 at Y\n50 vlin Y+1,Y+10 at X';
		const expected = "0A0A004C0366B40400010F1400D871B5050003D971B5050001081E0067D868D90112280069D812B101006AD812B10A006BD9011232006CD912B101006DD912B10A006ED801";
		await testTokenizer(testCode,expected);
	});
	it('low res functions', async function() {
		const testCode = '10 C = SCRN(X,Y)';
		const expected = "0B0A00C3713DD83ED97201";
		await testTokenizer(testCode,expected);
	});
});

describe('Control', async function() {
	it('binary ascii collisions', async function() {
		const testCode = '32 x = 32';
		const expected = "092000D871B3200001";
		await testTokenizer(testCode,expected);
	});
	it('goto, gosub, end, return', async function() {
		const testCode = '10 gosub 1000: goto 100\n100 end\n1000 return';
		const expected = "0D0A005CB1E803035FB1640001056400510105E8035B01";
		await testTokenizer(testCode,expected);
	});
	it('loop', async function() {
		const testCode = '10 for i = 1 to LAST: print i: next I';
		const expected = "150A0055C956B1010057CCC1D3D40362C90359C901";
		await testTokenizer(testCode,expected);
	});
	it('if then', async function() {
		let testCode = '10 if x > y then 1000\n';
		testCode += '20 if X < Y then 1010\n';
		testCode += '30 if X <> Y then 1020\n';
		testCode += '40 if X = Y then 1030\n';
		const expected = "0C0A0060D819D924B1E803010C140060D81CD924B1F203010C1E0060D81BD924B1FC03010C280060D816D924B1060401";
		await testTokenizer(testCode,expected);
	});
});

describe('Escapes', async function() {
	it('string_escapes', async function() {
		const testCode = '10 print "\\x8a1\\x8a2"\n';
		const expected = "0B0A0061288AB18AB22901";
		await testTokenizer(testCode,expected);
	});
	it('rem_escapes', async function() {
		const testCode = '10 rem \\x8a\\x8aAAA\\x8a\\x8a\n';
		const expected = "0D0A005DA08A8AC1C1C18A8A01";
		await testTokenizer(testCode,expected);
	});
	it('dos_escapes', async function() {
		let testCode = '0 PR# 0\n1 PRINT:PRINT \"\\x84BLOAD DATA1,A$4000\":END\n';
		const expected = "0800007EB00000011E01006303612884C2CCCFC1C4A0C4C1D4C1B1ACC1A4B4B0B0B029035101";
		await testTokenizer(testCode,expected);
	});
});
