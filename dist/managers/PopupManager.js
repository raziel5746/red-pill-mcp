"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PopupManager = void 0;
const vscode = __importStar(require("vscode"));
const uuid_1 = require("uuid");
const PopupWebviewProvider_1 = require("../ui/PopupWebviewProvider");
class PopupManager {
    constructor(context, state, logger) {
        this.responseCallbacks = new Map();
        this.context = context;
        this.state = state;
        this.logger = logger;
    }
    async createPopup(config) {
        try {
            // Check maximum concurrent popups
            const maxPopups = vscode.workspace.getConfiguration('redPillMcp').get('maxConcurrentPopups', 3);
            if (this.state.activePopups.size >= maxPopups) {
                throw new Error(`Maximum concurrent popups (${maxPopups}) reached`);
            }
            // Generate unique ID if not provided
            if (!config.id) {
                config.id = (0, uuid_1.v4)();
            }
            // Check if popup with same ID already exists
            if (this.state.activePopups.has(config.id)) {
                throw new Error(`Popup with ID ${config.id} already exists`);
            }
            this.logger.debug('Creating popup:', config);
            // Create webview panel
            const webviewProvider = new PopupWebviewProvider_1.PopupWebviewProvider(this.context, config, this.logger);
            const webviewPanel = await webviewProvider.createWebview();
            // Create popup instance
            const instance = {
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
        }
        catch (error) {
            this.logger.error('Failed to create popup:', error);
            throw error;
        }
    }
    closePopup(popupId, response) {
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
        }
        catch (error) {
            this.logger.error(`Error closing popup ${popupId}:`, error);
        }
    }
    clearAllPopups() {
        const popupIds = Array.from(this.state.activePopups.keys());
        for (const popupId of popupIds) {
            try {
                const response = {
                    popupId,
                    dismissed: true,
                    timestamp: Date.now()
                };
                this.closePopup(popupId, response);
            }
            catch (error) {
                this.logger.error(`Error clearing popup ${popupId}:`, error);
            }
        }
        this.logger.info(`Cleared ${popupIds.length} popups`);
    }
    getActivePopups() {
        return Array.from(this.state.activePopups.values());
    }
    getPopup(popupId) {
        return this.state.activePopups.get(popupId);
    }
    onPopupResponse(callback) {
        this.onResponseCallback = callback;
    }
    handleWebviewMessage(popupId, message) {
        this.logger.debug(`Received message from popup ${popupId}:`, message);
        try {
            const response = {
                popupId,
                buttonId: message.buttonId,
                customData: message.data,
                timestamp: Date.now(),
                dismissed: message.type === 'dismiss'
            };
            this.sendResponse(response);
            this.closePopup(popupId);
        }
        catch (error) {
            this.logger.error(`Error handling webview message from popup ${popupId}:`, error);
        }
    }
    handlePopupTimeout(popupId) {
        this.logger.info(`Popup ${popupId} timed out`);
        const response = {
            popupId,
            dismissed: true,
            timestamp: Date.now()
        };
        this.closePopup(popupId, response);
    }
    sendResponse(response) {
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
    cleanupPopup(popupId) {
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
        }
        catch (error) {
            this.logger.error(`Error during popup cleanup for ${popupId}:`, error);
        }
    }
    dispose() {
        this.logger.info('Disposing popup manager...');
        this.clearAllPopups();
        this.responseCallbacks.clear();
    }
}
exports.PopupManager = PopupManager;
//# sourceMappingURL=PopupManager.js.map