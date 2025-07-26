import * as vscode from 'vscode';
import { PopupManager } from './managers/PopupManager';
import { McpBridge } from './communication/McpBridge';
import { ConfigManager } from './managers/ConfigManager';
import { Logger } from './utils/Logger';
import { ExtensionState } from './types';
import { MCPServer } from './mcp-server';

let extensionState: ExtensionState;
let popupManager: PopupManager;
let mcpBridge: McpBridge;
let configManager: ConfigManager;
let logger: Logger;
let mcpServer: MCPServer;

export async function activate(context: vscode.ExtensionContext) {
    // Initialize logger first
    logger = new Logger('RedPillMCP');
    logger.info('Activating Red Pill MCP extension...');

    try {
        // Initialize managers
        configManager = new ConfigManager();
        extensionState = {
            isConnected: false,
            activePopups: new Map()
        };

        // Initialize popup manager
        popupManager = new PopupManager(context, extensionState, logger);
        
        // Initialize MCP bridge
        mcpBridge = new McpBridge(configManager, extensionState, logger);
        
        // Set up communication between MCP bridge and popup manager
        mcpBridge.onPopupRequest((popupConfig) => {
            popupManager.createPopup(popupConfig);
        });

        popupManager.onPopupResponse((response) => {
            mcpBridge.sendResponse(response);
        });

        // Start MCP server
        await startMcpServer();

        // Register commands
        registerCommands(context);

        // Auto-connect if enabled
        const config = configManager.getConfig();
        if (config.autoConnect) {
            // Wait a moment for server to fully start
            setTimeout(async () => {
                await mcpBridge.connect();
            }, 1000);
        }

        logger.info('Red Pill MCP extension activated successfully');

    } catch (error) {
        logger.error('Failed to activate extension:', error);
        vscode.window.showErrorMessage(`Red Pill MCP: Failed to activate - ${error}`);
    }
}

export function deactivate() {
    logger?.info('Deactivating Red Pill MCP extension...');
    
    try {
        // Clean up popup manager
        popupManager?.dispose();
        
        // Disconnect MCP bridge
        mcpBridge?.disconnect();
        
        // Stop MCP server
        mcpServer?.stop();
        
        logger?.info('Red Pill MCP extension deactivated successfully');
    } catch (error) {
        logger?.error('Error during deactivation:', error);
    }
}

async function startMcpServer(): Promise<void> {
    try {
        const config = configManager.getConfig();
        
        // Extract port from mcpServerUrl (ws://localhost:8080 -> 8080)
        const urlMatch = config.mcpServerUrl.match(/:(\d+)$/);
        const port = urlMatch ? parseInt(urlMatch[1]) : 8080;
        
        mcpServer = new MCPServer({
            port: port,
            host: 'localhost'
        });
        
        logger.info(`Starting MCP server on port ${port}...`);
        await mcpServer.start();
        logger.info('MCP server started successfully');
        
    } catch (error) {
        logger.error('Failed to start MCP server:', error);
        vscode.window.showErrorMessage(`Failed to start MCP server: ${error}`);
        throw error;
    }
}

function registerCommands(context: vscode.ExtensionContext) {
    // Show popup command (for testing)
    const showPopupCommand = vscode.commands.registerCommand('redPillMcp.showPopup', async () => {
        try {
            const testPopup = {
                id: `test-${Date.now()}`,
                title: 'Test Popup',
                content: 'This is a test popup from the Red Pill MCP extension.',
                buttons: [
                    { id: 'ok', label: 'OK', style: 'primary' as const },
                    { id: 'cancel', label: 'Cancel', style: 'secondary' as const }
                ]
            };
            
            await popupManager.createPopup(testPopup);
            logger.info('Test popup created');
        } catch (error) {
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
        } catch (error) {
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
            } else {
                await mcpBridge.connect();
                vscode.window.showInformationMessage('Connected to MCP server');
            }
        } catch (error) {
            logger.error('Failed to toggle connection:', error);
            vscode.window.showErrorMessage(`Connection error: ${error}`);
        }
    });

    // Register all commands with context
    context.subscriptions.push(
        showPopupCommand,
        clearPopupsCommand,
        toggleConnectionCommand
    );

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