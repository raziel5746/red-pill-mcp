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

            this.logger.debug('Creating popup:', config);

            // Create webview panel
            const webviewProvider = new PopupWebviewProvider(this.context, config, this.logger);
            const webviewPanel = await webviewProvider.createWebview();

            // Create popup instance
            const instance: PopupInstance = {
                config,
                webviewPanel,
                createdAt: Date.now()
            };

            // Set up timeout if specified
            if (config.timeout && config.timeout > 0) {
                instance.timeoutId = setTimeout(() => {
                    this.handlePopupTimeout(config.id);
                }, config.timeout);
            }

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

            this.logger.info(`Popup created with ID: ${config.id}`);
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

            this.logger.info(`Popup closed: ${popupId}`);
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

    private handleWebviewMessage(popupId: string, message: any): void {
        this.logger.debug(`Received message from popup ${popupId}:`, message);

        try {
            const response: PopupResponse = {
                popupId,
                buttonId: message.buttonId,
                customData: message.data,
                timestamp: Date.now(),
                dismissed: message.type === 'dismiss'
            };

            this.sendResponse(response);
            this.closePopup(popupId);

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
        }

        // Call specific callback if registered
        const callback = this.responseCallbacks.get(response.popupId);
        if (callback) {
            callback(response);
            this.responseCallbacks.delete(response.popupId);
        }

        this.logger.debug('Popup response sent:', response);
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