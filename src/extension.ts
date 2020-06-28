// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as FormData from 'form-data';
import axios from 'axios';
import * as moment from 'moment';
import * as fs from 'fs';

interface PostResponse {
    data: {
        msg: string,
        code:  number
    };
    [propName: string]: any;
}


class Logger {
    static channel: vscode.OutputChannel;

    static log(message: any) {
        if (this.channel) {
            let time = moment().format("MM-DD HH:mm:ss");
            this.channel.appendLine(`[${time}] ${message}`);
        }
    }

    static showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined> {
        this.log(message);
        return vscode.window.showInformationMessage(message, ...items);
    }

    static showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined> {
        this.log(message);
        return vscode.window.showErrorMessage(message, ...items);
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
    const postCdn = new PostCdn();

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('vscode-post-cdn.postCdn', (fileUri: vscode.Uri) => {
        Logger.log('Congratulations, your extension "vscode-post-cdn" is now active!');
		// The code you place here will be executed every time your command is executed

        // Display a message box to the user
        postCdn.uploadFile(fileUri);
	});

    // vscode plugin log output
    Logger.channel = vscode.window.createOutputChannel("PostCdn");

    context.subscriptions.push(Logger.channel);
	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}

class PostCdn {
    private _filePath: string | undefined;

    public async uploadFile(fileUri: vscode.Uri, force: Boolean = false): Promise<null> {
        return new Promise(async (resolve, reject) => {
            const fsPath: string = fileUri.fsPath;
            const form: FormData = new FormData();
            const stream: fs.ReadStream = fs.createReadStream(fsPath);
            const fileSplitArr: string[] = fsPath.split('/');
            const fileName: string = fileSplitArr[fileSplitArr.length - 1];

            const requestUrl: string = vscode.workspace.getConfiguration("postCdn")["requestUrl"];
            const remotePath: string = vscode.workspace.getConfiguration("postCdn")["remotePath"];
            const host: string = vscode.workspace.getConfiguration("postCdn")["host"];

            if (!requestUrl) {
                Logger.showErrorMessage('Confirm that postCdn.requestUrl has been configured correctly');
                return;
            }

            if (!remotePath) {
                Logger.showErrorMessage('Confirm that postCdn.remotePath has been configured correctly');
                return;
            }

            if (!host) {
                Logger.showErrorMessage('Confirm that postCdn.host has been configured correctly');
                return;
            }

            if (!force) {this._filePath = `${remotePath}${fileName}`;}

            if (force){form.append('force', 1);}
            
            const realFilePath: string|undefined = await vscode.window.showInputBox({
                value: `${host}${this._filePath}`,
                prompt: '确保生成的cdn资源地址正确'
            });

            if (!realFilePath) {return false;}

            this._filePath = realFilePath.replace(host, '');

            form.append('file', stream);
            form.append('name', this._filePath);
            form.append('domain', host);

            // In Node.js environment you need to set boundary in the header field 'Content-Type' by calling method `getHeaders`
            const formHeaders = form.getHeaders();

            axios.post(requestUrl, form, {
                    headers: {
                        ...formHeaders,
                    },
                })
                .then(async (response: PostResponse) => {
                    Logger.log(`request: ${response ? JSON.stringify(response.data) : response}`);

                    if (response.data) {
                        if (response.data && response.data.code === 200) {
                            let filePath = host + this._filePath;
                            Logger.showInformationMessage('cdn资源上传成功~ \n 点击打开:', filePath).then((selection) => {
                                if (filePath === selection) {
                                    vscode.env.openExternal(vscode.Uri.parse('https://' + filePath));
                                }
                            });
                            resolve();
                        } else {
                            if (response.data.code === 409) {
                                let realFilePath: string|undefined = await vscode.window.showInputBox({
                                    value: `${host}${this._filePath}`,
                                    prompt: '该资源已存在，确定要覆盖上传？（可能会有缓存时间）'
                                });

                                if (realFilePath) {
                                    this._filePath = realFilePath.replace(host, '');
                                    this.uploadFile(fileUri, true);
                                }
                            } else {
                                Logger.showErrorMessage(response.data.msg);
                            }
                            reject();
                        }
                    } else {
                        Logger.showErrorMessage('网络错误!');
                        reject();
                    }
                })
                .catch(error => {
                    Logger.showErrorMessage(error);
                    reject();
                });
        });
    }
}
