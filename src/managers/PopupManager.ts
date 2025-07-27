import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { PopupConfig, PopupResponse, PopupInstance, ExtensionState } from '../types';
import { Logger } from '../utils/Logger';
import { PopupWebviewProvider } from '../ui/PopupWebviewProvider';

export class PopupManager {
    private context: vscode.ExtensionContext;
    private state: ExtensionState;
    private logger: Logger;
    private responseCallbacks: Map<string, (response: PopupResponse) => void> = new Map();
    private onResponseCallback?: (response: PopupResponse) => void;

    constructor(context: vscode.ExtensionContext, state: ExtensionState, logger: Logger) {
        this.context = context;
        this.state = state;
        this.logger = logger;
    }

    async createPopup(config: PopupConfig): Promise<string> {
        try {
            // Check maximum concurrent popups
            const maxPopups = vscode.workspace.getConfiguration('redPillMcp').get('maxConcurrentPopups', 3);
            if (this.state.activePopups.size >= maxPopups) {
                throw new Error(`Maximum concurrent popups (${maxPopups}) reached`);
            }

            // Generate unique ID if not provided
            if (!config.id) {
                config.id = uuidv4();
            }

            // Check if popup with same ID already exists
            if (this.state.activePopups.has(config.id)) {
                throw new Error(`Popup with ID ${config.id} already exists`);
            }

            // Create webview panel
            const webviewProvider = new PopupWebviewProvider(this.context, config, this.logger);
            const webviewPanel = await webviewProvider.createWebview();

            // Create popup instance
            const instance: PopupInstance = {
                config,
                webviewPanel,
                createdAt: Date.now()
            };

            // Set up webview message handling
            webviewPanel.webview.onDidReceiveMessage((message) => {
                this.handleWebviewMessage(config.id, message);
            });

            // Handle panel disposal
            webviewPanel.onDidDispose(() => {
                this.cleanupPopup(config.id);
            });

            // Store the instance
            this.state.activePopups.set(config.id, instance);

            this.logger.debug(`Popup created: ${config.id}`);
            return config.id;

        } catch (error) {
            this.logger.error('Failed to create popup:', error);
            throw error;
        }
    }

    closePopup(popupId: string, response?: PopupResponse): void {
        const instance = this.state.activePopups.get(popupId);
        if (!instance) {
            this.logger.warn(`Attempt to close non-existent popup: ${popupId}`);
            return;
        }

        try {
            // Send response if provided
            if (response) {
                this.sendResponse(response);
            }

            // Clean up the popup
            this.cleanupPopup(popupId);

            this.logger.debug(`Popup closed: ${popupId}`);
        } catch (error) {
            this.logger.error(`Error closing popup ${popupId}:`, error);
        }
    }

    clearAllPopups(): void {
        const popupIds = Array.from(this.state.activePopups.keys());

        for (const popupId of popupIds) {
            try {
                const response: PopupResponse = {
                    popupId,
                    dismissed: true,
                    timestamp: Date.now()
                };
                this.closePopup(popupId, response);
            } catch (error) {
                this.logger.error(`Error clearing popup ${popupId}:`, error);
            }
        }

        this.logger.info(`Cleared ${popupIds.length} popups`);
    }

    getActivePopups(): PopupInstance[] {
        return Array.from(this.state.activePopups.values());
    }

    getPopup(popupId: string): PopupInstance | undefined {
        return this.state.activePopups.get(popupId);
    }

    onPopupResponse(callback: (response: PopupResponse) => void): void {
        this.onResponseCallback = callback;
    }

    async handlePopupRequest(message: any): Promise<void> {
        try {
            // Get default timeout from extension settings
            const defaultTimeout = vscode.workspace.getConfiguration('redPillMcp').get('popupTimeout', 0);

            // Extract popup configuration from message - use the server's popup ID
            const config: PopupConfig = {
                id: message.popupId, // Use the server's popup ID
                title: message.options.title,
                content: message.options.message,
                type: message.options.type,
                inputPlaceholder: message.options.inputPlaceholder,
                buttons: message.options.buttons?.map((label: string) => ({ id: label, label })),
                timeout: message.options.timeout !== undefined ? message.options.timeout : defaultTimeout
            };

            // Create the popup with the server's ID
            await this.createPopup(config);

        } catch (error) {
            this.logger.error('Failed to handle popup request:', error);
        }
    }

    private handleWebviewMessage(popupId: string, message: any): void {
        this.logger.debug(`Webview message from popup ${popupId}:`, message.type);

        try {
            // Handle debug messages from webview
            if (message.type === 'debug') {
                this.logger.debug(`Webview Debug (${popupId}): ${message.message}`);
                return;
            }

            let response: PopupResponse = {
                popupId,
                timestamp: Date.now(),
                dismissed: message.type === 'dismiss'
            };

            if (message.type === 'button_click') {
                response.buttonId = message.buttonId;
                response.customData = message.data;
                if (message.customText) {
                    response.customText = message.customText;
                }
            } else if (message.type === 'custom_text') {
                response.customText = message.customText;
                response.customData = message.data;
            }

            // Send response first, then close popup
            this.sendResponse(response);

            // Small delay to ensure response is processed before closing
            setTimeout(() => {
                this.closePopup(popupId);
            }, 100);

        } catch (error) {
            this.logger.error(`Error handling webview message from popup ${popupId}:`, error);
        }
    }

    private handlePopupTimeout(popupId: string): void {
        this.logger.info(`Popup ${popupId} timed out`);

        const response: PopupResponse = {
            popupId,
            dismissed: true,
            timestamp: Date.now()
        };

        this.closePopup(popupId, response);
    }

    private sendResponse(response: PopupResponse): void {
        // Call the registered callback
        if (this.onResponseCallback) {
            this.onResponseCallback(response);
        } else {
            this.logger.warn('No onResponseCallback registered');
        }

        // Call specific callback if registered
        const callback = this.responseCallbacks.get(response.popupId);
        if (callback) {
            callback(response);
            this.responseCallbacks.delete(response.popupId);
        }
    }

    private cleanupPopup(popupId: string): void {
        const instance = this.state.activePopups.get(popupId);
        if (!instance) {
            return;
        }

        try {
            // Clear timeout if exists
            if (instance.timeoutId) {
                clearTimeout(instance.timeoutId);
            }

            // Dispose webview panel
            if (instance.webviewPanel && !instance.webviewPanel.disposed) {
                instance.webviewPanel.dispose();
            }

            // Remove from active popups
            this.state.activePopups.delete(popupId);

            // Clean up callbacks
            this.responseCallbacks.delete(popupId);

        } catch (error) {
            this.logger.error(`Error during popup cleanup for ${popupId}:`, error);
        }
    }

    dispose(): void {
        this.logger.info('Disposing popup manager...');
        this.clearAllPopups();
        this.responseCallbacks.clear();
    }
}
