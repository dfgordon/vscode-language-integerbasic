import * as config from '../../settings';
import * as lxbase from '../../langExtBase';
import * as com from '../../commands';
import * as assert from 'assert';

// Tokenization is tested against Virtual ][ or AppleWin
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

async function testDetokenizer(hex_tokens: string, expected: string) {
	const TSInitResult = await lxbase.TreeSitterInit();
    const tool = new com.Tokenizer(TSInitResult,console,config.defaultSettings);
	const matches = hex_tokens.match(/[0-9a-fA-F][0-9a-fA-F]/g);
	if (!matches) {
		assert.fail("invalid hex tokens");
	}
	const tokens = matches.map(t => parseInt(t, 16));
    const img = new Array<number>(65536);
	// set program pointer and himem, since no emulator, anywhere will do
	const start_ptr = 256;
	const end_ptr = start_ptr + tokens.length;
    img[202] = start_ptr%256;
    img[203] = Math.floor(start_ptr/256);
    img[76] = end_ptr%256;
    img[77] = Math.floor(end_ptr/256);
	for (let i = 0; i < tokens.length; i++)
		img[256 + i] = tokens[i];
	const actual = tool.detokenize(img);
	assert.deepStrictEqual(actual, expected);
}

describe('Output Statements', async function() {
	it('single line', async function() {
		const expected = '10 TEXT \n';
		const tokens = "050A004B01";
		await testDetokenizer(tokens,expected);
	});
	it('multi line', async function() {
		const expected = '10 TEXT \n20 PRINT "HELLO"\n';
		const tokens = "050A004B010C14006128C8C5CCCCCF2901";
		await testDetokenizer(tokens,expected);
	});
	it('print with nulls', async function() {
		const expected = '10 PRINT A,B,,C;D$;;;E$\n';
		const tokens = "130A0062C149C24A49C345C440474745C54001";
		await testDetokenizer(tokens,expected);
	});
});

describe('Expressions', async function() {
	it('simple', async function() {
		const expected = '10 X=1+1\n';
		const tokens = "0D0A00D871B1010012B1010001";
		await testDetokenizer(tokens,expected);
	});
	it('negative numbers', async function() {
		const expected = '10 X=-1\n';
		const tokens = "0A0A00D87136B1010001";
		await testDetokenizer(tokens,expected);
	});
	it('double negative', async function() {
		const expected = '10 X=--1\n';
		const tokens = "0B0A00D8713636B1010001";
		await testDetokenizer(tokens,expected);
	});
	it('nested', async function() {
		const expected = '10 X=6*(1+(X1+X2)*5)\n';
		const tokens = "1B0A00D871B606001438B101001238D8B112D8B27214B505007201";
		await testDetokenizer(tokens,expected);
	});
	it('logic values', async function() {
		const expected = '10 COLOR=I/2*(I<32)\n';
		const tokens = "120A0066C915B202001438C91CB320007201";
		await testDetokenizer(tokens,expected);
	});
	it('with functions', async function() {
		const expected = '10 X=6*( ABS (X0)+( SGN (X1)+ ASC(A$))*5)\n';
		const tokens = "220A00D871B606001438313FD8B0721238303FD8B172123CC140727214B505007201";
		await testDetokenizer(tokens,expected);
	});
});

describe('Graphics', async function() {
	it('low res statements', async function() {
		const expected = '10 GR : COLOR=4\n20 X=5:Y=5\n30 PLOT X,Y\n40 HLIN X+1,X+10 AT Y\n50 VLIN Y+1,Y+10 AT X\n';
		const tokens = "0A0A004C0366B40400010F1400D871B5050003D971B5050001081E0067D868D90112280069D812B101006AD812B10A006BD9011232006CD912B101006DD912B10A006ED801";
		await testDetokenizer(tokens,expected);
	});
	it('low res functions', async function() {
		const expected = '10 C= SCRN(X,Y)\n';
		const tokens = "0B0A00C3713DD83ED97201";
		await testDetokenizer(tokens,expected);
	});
});

describe('Control', async function() {
	it('binary ascii collisions', async function() {
		const expected = '32 X=32\n';
		const tokens = "092000D871B3200001";
		await testDetokenizer(tokens,expected);
	});
	it('goto, gosub, end, return', async function() {
		const expected = '10 GOSUB 1000: GOTO 100\n100 END \n1000 RETURN \n';
		const tokens = "0D0A005CB1E803035FB1640001056400510105E8035B01";
		await testDetokenizer(tokens,expected);
	});
	it('loop', async function() {
		const expected = '10 FOR I=1 TO LAST: PRINT I: NEXT I\n';
		const tokens = "150A0055C956B1010057CCC1D3D40362C90359C901";
		await testDetokenizer(tokens,expected);
	});
	it('if then', async function() {
		let expected = '10 IF X>Y THEN 1000\n';
		expected += '20 IF X<Y THEN 1010\n';
		expected += '30 IF X<>Y THEN 1020\n';
		expected += '40 IF X=Y THEN 1030\n';
		const tokens = "0C0A0060D819D924B1E803010C140060D81CD924B1F203010C1E0060D81BD924B1FC03010C280060D816D924B1060401";
		await testDetokenizer(tokens,expected);
	});
});

describe('Escapes', async function() {
	it('string_escapes', async function() {
		const expected = '10 PRINT \"\\x8a1\\x8a2\"\n';
		const tokens = "0B0A0061288AB18AB22901";
		await testDetokenizer(tokens,expected);
	});
	it('rem_escapes', async function() {
		const expected = '10 REM \\x8a\\x8aAAA\\x8a\\x8a\n';
		const tokens = "0D0A005DA08A8AC1C1C18A8A01";
		await testDetokenizer(tokens,expected);
	});
	it('dos_non_escapes', async function() {
		let expected = '0 PR# 0\n1 PRINT : PRINT \"\x04BLOAD DATA1,A$4000\": END \n';
		const tokens = "0800007EB00000011E01006303612884C2CCCFC1C4A0C4C1D4C1B1ACC1A4B4B0B0B029035101";
		await testDetokenizer(tokens,expected);
	});
});

describe('general', async function () {

	it('text_and_binary_nums', async function() {
		const expected = "10 TEXT : CALL -936: VTAB 3\n24 PRINT : TAB 30: PRINT \"16-FEB-79\"\n40 REM123:REM456\n";
		const tokens = "100A004B034D36B9A803036FB3030001171800630350B31E00036128B1B6ADC6C5C2ADB7B929010F28005DB1B2B3BAD2C5CDB4B5B601";
		await testDetokenizer(tokens,expected);
	});

	it('animals_frags', async function() {
		const expected = "160 PRINT : PRINT NEW$;: INPUT \"?\",A$:PREV=CUR: IF NOT LEN(A$) THEN 160:A$=A$(1,1): IF A$#\"Y\" AND A$#\"N\" THEN 160\n\
170 IF A$=\"Y\" THEN CUR=RTPTR: IF A$=\"N\" THEN CUR=WRNGPTR: GOTO 110\n";
		const tokens = "4AA000630361CEC5D74047035328BF2926C14003\
		D0D2C5D671C3D5D20360373BC1407224B1A00003\
		C14070C1402AB1010023B10100720360C1403A28\
		D9291DC1403A28CE2924B1A000012EAA0060C140\
		3928D92925C3D5D271D2D4D0D4D20360C1403928\
		CE2925C3D5D271D7D2CEC7D0D4D2035FB16E0001";
		await testDetokenizer(tokens,expected);
	});

	it('color_demo_frags', async function() {
		const expected = "1500 POKE 0,P: POKE 1,D: CALL 2: RETURN \n\
2000 TAB ((40- LEN(A$))/2+1): PRINT A$: PRINT : RETURN \n\
3000 GR : FOR I=0 TO 31: COLOR=I/2: VLIN 0,39 AT I+3: NEXT I\n\
65535 REM*COPYRIGHT 1978 APPLE COMPUTER,INC.*\n";
		const tokens = "18DC0564B0000065D00364B1010065C4034DB202\
		00035B0121D007503838B42800133BC140727215\
		B2020012B10100720361C1400363035B0129B80B\
		4C0355C956B0000057B31F000366C915B2020003\
		6CB000006DB327006EC912B303000359C90129FF\
		FF5DAAC3CFD0D9D2C9C7C8D4A0B1B9B7B8A0C1D0\
		D0CCC5A0C3CFCDD0D5D4C5D2ACC9CEC3AEAA01";
		await testDetokenizer(tokens,expected);
	});

});