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
exports.McpBridge = void 0;
const WebSocket = __importStar(require("ws"));
const events_1 = require("events");
class McpBridge extends events_1.EventEmitter {
    constructor(configManager, state, logger) {
        super();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.configManager = configManager;
        this.state = state;
        this.logger = logger;
    }
    async connect() {
        if (this.state.isConnected) {
            this.logger.warn('Already connected to MCP server');
            return;
        }
        const config = this.configManager.getConfig();
        this.logger.info(`Connecting to MCP server at: ${config.mcpServerUrl}`);
        try {
            // Validate configuration
            const validation = this.configManager.validateConfig();
            if (!validation.valid) {
                throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
            }
            // Create WebSocket connection
            this.websocket = new WebSocket(config.mcpServerUrl);
            // Set connection timeout
            this.connectionTimeout = setTimeout(() => {
                if (!this.state.isConnected) {
                    this.logger.error('Connection timeout');
                    this.handleConnectionError(new Error('Connection timeout'));
                }
            }, 10000);
            // Set up event handlers
            this.setupWebSocketHandlers();
        }
        catch (error) {
            this.logger.error('Failed to connect to MCP server:', error);
            this.handleConnectionError(error);
            throw error;
        }
    }
    async disconnect() {
        this.logger.info('Disconnecting from MCP server...');
        // Clear timeouts and intervals
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = undefined;
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }
        // Close WebSocket
        if (this.websocket) {
            this.websocket.removeAllListeners();
            if (this.websocket.readyState === WebSocket.OPEN) {
                // Send disconnect message
                try {
                    this.sendMessage({
                        type: 'status',
                        id: `disconnect-${Date.now()}`,
                        payload: { status: 'disconnecting' },
                        timestamp: Date.now()
                    });
                }
                catch (error) {
                    this.logger.warn('Failed to send disconnect message:', error);
                }
                this.websocket.close(1000, 'Extension disconnecting');
            }
            this.websocket = undefined;
        }
        // Update state
        this.state.isConnected = false;
        this.reconnectAttempts = 0;
        this.logger.info('Disconnected from MCP server');
        this.emit('disconnected');
    }
    async reconnect() {
        this.logger.info('Reconnecting to MCP server...');
        await this.disconnect();
        await this.connect();
    }
    sendResponse(response) {
        if (!this.state.isConnected || !this.websocket) {
            this.logger.error('Cannot send response: not connected to MCP server');
            return;
        }
        try {
            const message = {
                type: 'response',
                id: response.popupId,
                payload: response,
                timestamp: Date.now()
            };
            this.sendMessage(message);
            this.logger.debug('Response sent:', response);
        }
        catch (error) {
            this.logger.error('Failed to send response:', error);
        }
    }
    onPopupRequest(callback) {
        this.on('popup_request', callback);
    }
    setupWebSocketHandlers() {
        if (!this.websocket)
            return;
        this.websocket.on('open', () => {
            this.logger.info('Connected to MCP server');
            // Clear connection timeout
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = undefined;
            }
            // Update state
            this.state.isConnected = true;
            this.reconnectAttempts = 0;
            // Start heartbeat
            this.startHeartbeat();
            // Send handshake message
            this.sendHandshake();
            this.emit('connected');
        });
        this.websocket.on('message', (data) => {
            try {
                const message = this.parseMessage(data);
                this.handleMessage(message);
            }
            catch (error) {
                this.logger.error('Failed to process message:', error);
            }
        });
        this.websocket.on('close', (code, reason) => {
            this.logger.info(`WebSocket closed: ${code} - ${reason}`);
            this.handleDisconnection(code, reason);
        });
        this.websocket.on('error', (error) => {
            this.logger.error('WebSocket error:', error);
            this.handleConnectionError(error);
        });
        this.websocket.on('pong', () => {
            this.logger.debug('Received pong from MCP server');
        });
    }
    parseMessage(data) {
        try {
            const messageStr = data.toString();
            const message = JSON.parse(messageStr);
            // Validate message structure
            if (!message.type || !message.id || message.timestamp === undefined) {
                throw new Error('Invalid message format');
            }
            return message;
        }
        catch (error) {
            this.logger.error('Failed to parse message:', error);
            throw new Error(`Invalid message format: ${error}`);
        }
    }
    handleMessage(message) {
        this.logger.debug('Received message:', message);
        switch (message.type) {
            case 'popup':
                this.handlePopupMessage(message);
                break;
            case 'status':
                this.handleStatusMessage(message);
                break;
            case 'error':
                this.handleErrorMessage(message);
                break;
            default:
                this.logger.warn('Unknown message type:', message.type);
        }
    }
    handlePopupMessage(message) {
        try {
            const popupConfig = message.payload;
            // Validate popup config
            if (!popupConfig.title && !popupConfig.content) {
                throw new Error('Popup must have either title or content');
            }
            // Set ID if not provided
            if (!popupConfig.id) {
                popupConfig.id = message.id;
            }
            this.logger.info(`Received popup request: ${popupConfig.id}`);
            this.emit('popup_request', popupConfig);
        }
        catch (error) {
            this.logger.error('Failed to handle popup message:', error);
            // Send error response
            this.sendMessage({
                type: 'error',
                id: message.id,
                payload: {
                    error: 'Failed to process popup request',
                    details: error instanceof Error ? error.message : String(error)
                },
                timestamp: Date.now()
            });
        }
    }
    handleStatusMessage(message) {
        this.logger.info('Received status message:', message.payload);
        this.emit('status', message.payload);
    }
    handleErrorMessage(message) {
        this.logger.error('Received error from MCP server:', message.payload);
        this.state.lastError = message.payload.error || 'Unknown error';
        this.emit('error', message.payload);
    }
    sendMessage(message) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not connected');
        }
        const messageStr = JSON.stringify(message);
        this.websocket.send(messageStr);
        this.logger.debug('Message sent:', message);
    }
    sendHandshake() {
        try {
            const handshakeMessage = {
                type: 'status',
                id: `handshake-${Date.now()}`,
                payload: {
                    status: 'connected',
                    client: 'red-pill-mcp-vscode',
                    version: '0.1.0',
                    capabilities: ['popup', 'response']
                },
                timestamp: Date.now()
            };
            this.sendMessage(handshakeMessage);
            this.logger.info('Handshake sent');
        }
        catch (error) {
            this.logger.error('Failed to send handshake:', error);
        }
    }
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                try {
                    this.websocket.ping();
                    this.logger.debug('Heartbeat ping sent');
                }
                catch (error) {
                    this.logger.error('Failed to send heartbeat:', error);
                }
            }
        }, 30000); // Send ping every 30 seconds
    }
    handleDisconnection(code, reason) {
        this.state.isConnected = false;
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }
        this.emit('disconnected', { code, reason });
        // Attempt reconnection if not a clean close
        if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnection();
        }
    }
    handleConnectionError(error) {
        this.state.isConnected = false;
        this.state.lastError = error.message;
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = undefined;
        }
        this.emit('error', error);
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnection();
        }
        else {
            this.logger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
        }
    }
    attemptReconnection() {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
        this.logger.info(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        setTimeout(async () => {
            try {
                await this.connect();
            }
            catch (error) {
                this.logger.error('Reconnection attempt failed:', error);
            }
        }, delay);
    }
    dispose() {
        this.logger.info('Disposing MCP bridge...');
        this.disconnect();
        this.removeAllListeners();
    }
}
exports.McpBridge = McpBridge;
//# sourceMappingURL=McpBridge.js.map