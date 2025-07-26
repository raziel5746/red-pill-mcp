import * as vscode from 'vscode';
import { PopupConfig } from '../types';
import { Logger } from '../utils/Logger';
export declare class PopupWebviewProvider {
    private context;
    private config;
    private logger;
    constructor(context: vscode.ExtensionContext, config: PopupConfig, logger: Logger);
    createWebview(): Promise<vscode.WebviewPanel>;
    private getWebviewContent;
    private formatContent;
    private escapeHtml;
}
//# sourceMappingURL=PopupWebviewProvider.d.ts.map