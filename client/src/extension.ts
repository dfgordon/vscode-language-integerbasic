import * as vscode from 'vscode';
import * as tok from './semanticTokens';
import * as com from './commands';
import * as dimg from './diskImage';
import * as vsclnt from 'vscode-languageclient/node';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export let client: vsclnt.LanguageClient;

/** convert arch-platform to rust convention */
function targetTriple(): string[] {
	const ans = [];
	
	// CPU part
	if (os.arch() == "arm64") {
		ans.push("aarch64");
	} else if (os.arch() == "x64") {
		ans.push("x86_64");
	} else {
		ans.push("unknown");
	}

	// Vendor part
	if (os.platform() == "darwin") {
		ans.push("apple");
	} else if (os.platform() == "linux") {
		ans.push("unknown");
	} else if (os.platform() == "win32") {
		ans.push("pc");
	} else {
		ans.push("unknown");
	}

	// OS-ABI part
	if (os.platform() == "darwin") {
		ans.push("darwin");
	} else if (os.platform() == "linux") {
		ans.push("linux-musl");
	} else if (os.platform() == "win32") {
		ans.push("windows-msvc.exe");
	} else {
		ans.push("unknown");
	}

	return ans;
}

function getExecutableNames(context: vscode.ExtensionContext): string[] {
	const ans = [];
	const [cpu, vendor, opSys] = targetTriple();
	const bundled = "server-integerbasic" + "-" + cpu + "-" + vendor + "-" + opSys;
	ans.push(context.asAbsolutePath(path.join('server', bundled)));
	const external = "server-integerbasic" + (opSys.endsWith(".exe") ? ".exe" : "");
	ans.push(path.join(os.homedir(),".cargo","bin",external));
	return ans;
}

/** this runs after the extension loads */
export function activate(context: vscode.ExtensionContext)
{
	const serverCommandOptions = getExecutableNames(context);
	let serverCommand: string | undefined = undefined;
	for (const cmd of serverCommandOptions) {
		if (fs.existsSync(cmd)) {
			try {
				fs.accessSync(cmd, fs.constants.X_OK);
			} catch (err) {
				fs.chmodSync(cmd, fs.constants.S_IXUSR | fs.constants.S_IRUSR | fs.constants.S_IXGRP | fs.constants.S_IXOTH)
			}
			serverCommand = cmd;
			break;
		}
	}
	if (!serverCommand) {
		vscode.window.showErrorMessage("Neither a bundled nor an installed server could be found for this platform.  You may be able to solve this with `cargo install a2kit`.");
		return;
	}
	
	const serverOptions: vsclnt.ServerOptions = {
		command: serverCommand,
		args: ["--log-level","off","--suppress-tokens"],
		transport: vsclnt.TransportKind.stdio
	};
	const clientOptions: vsclnt.LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'integerbasic' }],
		synchronize: {
			fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	client = new vsclnt.LanguageClient('integerbasic', 'Integer BASIC', serverOptions, clientOptions);
	client.start().then(() => {
		if (client.initializeResult?.serverInfo?.version) {
			const vstr = client.initializeResult.serverInfo.version;
			const v= vstr.split('.')
			if (parseInt(v[0]) != 4) {
				vscode.window.showErrorMessage('Server version is ' + vstr + ', expected 4.x, stopping.');
				client.stop();
			}
		} else {
			vscode.window.showErrorMessage('unable to check server version, continuing anyway...');
		}
	});
	client.outputChannel.appendLine("using server " + serverCommand);

	const renumberer = new com.RenumberTool(context);
	const viiEntry = new com.ViiEntryTool(context);
	const appleWin = new com.AppleWinTool(context);
	const a2kit = new dimg.A2KitTool(context);
	const tokenizer = new com.TokenizationTool(context);

	const highlighter = new tok.SemanticTokensProvider();
	highlighter.register();

	context.subscriptions.push(vscode.commands.registerCommand("integerbasic.client.runNewVii",viiEntry.runNewVirtualII,viiEntry));
	context.subscriptions.push(vscode.commands.registerCommand("integerbasic.client.runFrontVii",viiEntry.runFrontVirtualII,viiEntry));
	context.subscriptions.push(vscode.commands.registerCommand("integerbasic.client.enterNewVii",viiEntry.enterNewVirtualII,viiEntry));
	context.subscriptions.push(vscode.commands.registerCommand("integerbasic.client.enterFrontVii",viiEntry.enterFrontVirtualII,viiEntry));
	context.subscriptions.push(vscode.commands.registerCommand("integerbasic.client.getFrontVii",viiEntry.getFrontVirtualII,viiEntry));
	context.subscriptions.push(vscode.commands.registerCommand("integerbasic.client.getAppleWinSaveState",appleWin.getAppleWinSaveState,appleWin));
	context.subscriptions.push(vscode.commands.registerCommand("integerbasic.client.setAppleWinSaveState",appleWin.setAppleWinSaveState,appleWin));
	context.subscriptions.push(vscode.commands.registerCommand("integerbasic.client.getFromDiskImage", a2kit.getIntegerFile, a2kit));
	context.subscriptions.push(vscode.commands.registerCommand("integerbasic.client.saveToDiskImage", a2kit.putIntegerFile, a2kit));
	context.subscriptions.push(vscode.commands.registerCommand("integerbasic.client.showTokenizedProgram",tokenizer.showTokenizedProgram,tokenizer));
	context.subscriptions.push(vscode.commands.registerCommand("integerbasic.client.renumber",renumberer.renumber,renumberer));
	context.subscriptions.push(vscode.commands.registerCommand("integerbasic.client.move",renumberer.move,renumberer));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand("integerbasic.client.commentLines",com.commentLinesCommand));
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
