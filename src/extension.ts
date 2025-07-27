import * as vscode from 'vscode';
import WebSocket from 'ws';
import { PopupManager } from './managers/PopupManager';
import { ConfigManager } from './managers/ConfigManager';
import { Logger } from './utils/Logger';
import { ExtensionState } from './types';
import { MCPServer } from './core/mcp-server';
import { createConfig } from '../dist/index.js';

let extensionState: ExtensionState;
let popupManager: PopupManager;
let configManager: ConfigManager;
let logger: Logger;
let mcpServer: MCPServer;
let sessionWebSocket: WebSocket;

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

        // Start MCP server
        await startMcpServer();

        // Register with session manager
        await registerWithSessionManager();

        // Set up popup response handling
        setupPopupResponseHandling();

        // Register commands
        registerCommands(context);

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

        // Close session WebSocket
        if (sessionWebSocket) {
            sessionWebSocket.close();
        }

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

        const serverConfig = createConfig({
            port: port,
            logLevel: 'info',
            popupTimeout: config.popupTimeout && config.popupTimeout > 0 ? config.popupTimeout : 0
        });

        mcpServer = new MCPServer(serverConfig, logger);

        logger.info(`Starting MCP server on port ${port}...`);
        await mcpServer.start();
        logger.info('MCP server started successfully');

    } catch (error) {
        logger.error('Failed to start MCP server:', error);
        vscode.window.showErrorMessage(`Failed to start MCP server: ${error}`);
        throw error;
    }
}

async function restartMcpServer(): Promise<void> {
    try {
        logger.info('Restarting MCP server...');

        // Stop existing server
        if (mcpServer) {
            await mcpServer.stop();
        }

        // Start new server
        await startMcpServer();

        logger.info('MCP server restarted successfully');
        vscode.window.showInformationMessage('MCP server restarted successfully');
    } catch (error) {
        logger.error('Failed to restart MCP server:', error);
        vscode.window.showErrorMessage(`Failed to restart MCP server: ${error}`);
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

    // Show server status command
    const showServerStatusCommand = vscode.commands.registerCommand('redPillMcp.showServerStatus', () => {
        try {
            const health = mcpServer?.getHealth();
            if (health) {
                vscode.window.showInformationMessage(
                    `MCP Server Status: ${health.status} | Active Clients: ${health.activeClients} | Active Popups: ${health.activePopups}`
                );
            } else {
                vscode.window.showWarningMessage('MCP Server is not running');
            }
        } catch (error) {
            logger.error('Failed to get server status:', error);
            vscode.window.showErrorMessage(`Failed to get server status: ${error}`);
        }
    });

    // Register all commands with context
    context.subscriptions.push(
        showPopupCommand,
        clearPopupsCommand,
        showServerStatusCommand
    );

    // Listen for configuration changes
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('redPillMcp')) {
            logger.info('Configuration changed, updating...');
            configManager.refresh();

            // Restart server if MCP URL changed
            if (event.affectsConfiguration('redPillMcp.mcpServerUrl')) {
                logger.info('MCP server URL changed, restarting server...');
                restartMcpServer();
            }
        }
    });

    context.subscriptions.push(configChangeListener);
}

async function registerWithSessionManager(): Promise<void> {
    try {
        const config = configManager.getConfig();

        // Extract port from mcpServerUrl (ws://localhost:8080 -> 8080)
        const urlMatch = config.mcpServerUrl.match(/:(\d+)$/);
        const port = urlMatch ? parseInt(urlMatch[1]) : 8080;
        const sessionPort = port + 1; // SessionManager runs on port + 1

        logger.info(`Connecting to SessionManager on port ${sessionPort}...`);

        sessionWebSocket = new WebSocket(`ws://localhost:${sessionPort}`);

        sessionWebSocket.on('open', () => {
            logger.info('Connected to SessionManager');

            // Register as VS Code instance
            const registrationMessage = {
                method: 'identify',
                params: {
                    clientType: 'vscode_instance',
                    metadata: {
                        version: vscode.version,
                        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'No workspace',
                        timestamp: new Date().toISOString()
                    }
                }
            };

            sessionWebSocket.send(JSON.stringify(registrationMessage));
            extensionState.isConnected = true;
        });

        sessionWebSocket.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());

                // Handle popup requests
                if (message.type === 'popup_request') {
                    popupManager.handlePopupRequest(message);
                } else {
                    // Ignore pings and other messages
                    logger.debug('Received message:', message.type);
                }
            } catch (error) {
                logger.error('Failed to parse message from SessionManager:', error);
            }
        });

        sessionWebSocket.on('close', () => {
            logger.info('Disconnected from SessionManager');
            extensionState.isConnected = false;
        });

        sessionWebSocket.on('error', (error) => {
            logger.error('SessionManager connection error:', error);
            extensionState.isConnected = false;
        });

    } catch (error) {
        logger.error('Failed to connect to SessionManager:', error);
        throw error;
    }
}

function setupPopupResponseHandling(): void {
    // Set up callback to send popup responses back to server
    popupManager.onPopupResponse((response) => {
        if (sessionWebSocket && sessionWebSocket.readyState === WebSocket.OPEN) {
            const message = {
                type: 'popup_response',
                popupId: response.popupId,
                result: {
                    button: response.buttonId,
                    input: response.customData?.inputValue,
                    customText: response.customText,
                    cancelled: response.dismissed,
                    timedOut: false
                }
            };

            sessionWebSocket.send(JSON.stringify(message));
        } else {
            logger.error('Cannot send popup response - WebSocket not connected');
        }
    });
}
