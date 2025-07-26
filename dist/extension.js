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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const PopupManager_1 = require("./managers/PopupManager");
const McpBridge_1 = require("./communication/McpBridge");
const ConfigManager_1 = require("./managers/ConfigManager");
const Logger_1 = require("./utils/Logger");
let extensionState;
let popupManager;
let mcpBridge;
let configManager;
let logger;
async function activate(context) {
    // Initialize logger first
    logger = new Logger_1.Logger('RedPillMCP');
    logger.info('Activating Red Pill MCP extension...');
    try {
        // Initialize managers
        configManager = new ConfigManager_1.ConfigManager();
        extensionState = {
            isConnected: false,
            activePopups: new Map()
        };
        // Initialize popup manager
        popupManager = new PopupManager_1.PopupManager(context, extensionState, logger);
        // Initialize MCP bridge
        mcpBridge = new McpBridge_1.McpBridge(configManager, extensionState, logger);
        // Set up communication between MCP bridge and popup manager
        mcpBridge.onPopupRequest((popupConfig) => {
            popupManager.createPopup(popupConfig);
        });
        popupManager.onPopupResponse((response) => {
            mcpBridge.sendResponse(response);
        });
        // Register commands
        registerCommands(context);
        // Auto-connect if enabled
        const config = configManager.getConfig();
        if (config.autoConnect) {
            await mcpBridge.connect();
        }
        logger.info('Red Pill MCP extension activated successfully');
    }
    catch (error) {
        logger.error('Failed to activate extension:', error);
        vscode.window.showErrorMessage(`Red Pill MCP: Failed to activate - ${error}`);
    }
}
function deactivate() {
    logger?.info('Deactivating Red Pill MCP extension...');
    try {
        // Clean up popup manager
        popupManager?.dispose();
        // Disconnect MCP bridge
        mcpBridge?.disconnect();
        logger?.info('Red Pill MCP extension deactivated successfully');
    }
    catch (error) {
        logger?.error('Error during deactivation:', error);
    }
}
function registerCommands(context) {
    // Show popup command (for testing)
    const showPopupCommand = vscode.commands.registerCommand('redPillMcp.showPopup', async () => {
        try {
            const testPopup = {
                id: `test-${Date.now()}`,
                title: 'Test Popup',
                content: 'This is a test popup from the Red Pill MCP extension.',
                buttons: [
                    { id: 'ok', label: 'OK', style: 'primary' },
                    { id: 'cancel', label: 'Cancel', style: 'secondary' }
                ]
            };
            await popupManager.createPopup(testPopup);
            logger.info('Test popup created');
        }
        catch (error) {
            logger.error('Failed to create test popup:', error);
            vscode.window.showErrorMessage(`Failed to create popup: ${error}`);
        }
    });
    // Clear all popups command
    const clearPopupsCommand = vscode.commands.registerCommand('redPillMcp.clearAllPopups', () => {
        try {
            popupManager.clearAllPopups();
            vscode.window.showInformationMessage('All popups cleared');
            logger.info('All popups cleared');
        }
        catch (error) {
            logger.error('Failed to clear popups:', error);
            vscode.window.showErrorMessage(`Failed to clear popups: ${error}`);
        }
    });
    // Toggle MCP connection command
    const toggleConnectionCommand = vscode.commands.registerCommand('redPillMcp.toggleConnection', async () => {
        try {
            if (extensionState.isConnected) {
                await mcpBridge.disconnect();
                vscode.window.showInformationMessage('Disconnected from MCP server');
            }
            else {
                await mcpBridge.connect();
                vscode.window.showInformationMessage('Connected to MCP server');
            }
        }
        catch (error) {
            logger.error('Failed to toggle connection:', error);
            vscode.window.showErrorMessage(`Connection error: ${error}`);
        }
    });
    // Register all commands with context
    context.subscriptions.push(showPopupCommand, clearPopupsCommand, toggleConnectionCommand);
    // Listen for configuration changes
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('redPillMcp')) {
            logger.info('Configuration changed, updating...');
            configManager.refresh();
            // Reconnect if MCP URL changed
            if (event.affectsConfiguration('redPillMcp.mcpServerUrl') && extensionState.isConnected) {
                mcpBridge.reconnect();
            }
        }
    });
    context.subscriptions.push(configChangeListener);
}
//# sourceMappingURL=extension.js.map