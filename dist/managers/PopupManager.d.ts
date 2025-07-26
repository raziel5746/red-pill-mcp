import * as vscode from 'vscode';
import { PopupConfig, PopupResponse, PopupInstance, ExtensionState } from '../types';
import { Logger } from '../utils/Logger';
export declare class PopupManager {
    private context;
    private state;
    private logger;
    private responseCallbacks;
    private onResponseCallback?;
    constructor(context: vscode.ExtensionContext, state: ExtensionState, logger: Logger);
    createPopup(config: PopupConfig): Promise<string>;
    closePopup(popupId: string, response?: PopupResponse): void;
    clearAllPopups(): void;
    getActivePopups(): PopupInstance[];
    getPopup(popupId: string): PopupInstance | undefined;
    onPopupResponse(callback: (response: PopupResponse) => void): void;
    private handleWebviewMessage;
    private handlePopupTimeout;
    private sendResponse;
    private cleanupPopup;
    dispose(): void;
}
//# sourceMappingURL=PopupManager.d.ts.map