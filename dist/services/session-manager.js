"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const ws_1 = __importDefault(require("ws"));
const server_logger_js_1 = require("../utils/server-logger.js");
class SessionManager extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.sessions = new Map();
        this.pendingConnections = new Map();
        this.config = config;
        this.logger = new server_logger_js_1.Logger(config.logLevel);
    }
    async start() {
        this.logger.info('Starting Session Manager');
        // Start WebSocket server for VS Code instances
        await this.startWebSocketServer();
        // Start heartbeat monitoring
        this.startHeartbeat();
        this.logger.info('Session Manager started');
    }
    async stop() {
        this.logger.info('Stopping Session Manager');
        // Stop heartbeat
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
        // Close all sessions
        const closeTasks = Array.from(this.sessions.values()).map(session => this.disconnectClient(session.id, 'Server shutdown'));
        await Promise.allSettled(closeTasks);
        // Close WebSocket server
        if (this.websocketServer) {
            await new Promise((resolve, reject) => {
                this.websocketServer.close((error) => {
                    if (error)
                        reject(error);
                    else
                        resolve();
                });
            });
        }
        this.logger.info('Session Manager stopped');
    }
    async startWebSocketServer() {
        this.websocketServer = new ws_1.default.Server({
            port: this.config.port + 1, // Use separate port for WebSocket
            maxPayload: 1024 * 1024 // 1MB max message size
        });
        this.websocketServer.on('connection', (ws, request) => {
            this.handleWebSocketConnection(ws, request);
        });
        this.websocketServer.on('error', (error) => {
            this.logger.error('WebSocket server error', error);
            this.emit('error_occurred', {
                timestamp: new Date(),
                type: 'connection',
                message: `WebSocket server error: ${error.message}`,
                stack: error.stack
            });
        });
        this.logger.info(`WebSocket server listening on port ${this.config.port + 1}`);
    }
    handleWebSocketConnection(ws, request) {
        const clientId = (0, uuid_1.v4)();
        const userAgent = request.headers['user-agent'] || 'Unknown';
        this.logger.debug('New WebSocket connection', { clientId, userAgent });
        // Create client connection wrapper
        const connection = {
            send: async (message) => {
                if (ws.readyState === ws_1.default.OPEN) {
                    ws.send(JSON.stringify(message));
                }
                else {
                    throw new Error('Connection is not open');
                }
            },
            close: async () => {
                ws.close();
            },
            isAlive: () => ws.readyState === ws_1.default.OPEN
        };
        // Handle connection setup
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleClientMessage(clientId, message);
            }
            catch (error) {
                this.logger.error('Failed to parse client message', { clientId, error });
            }
        });
        ws.on('close', (code, reason) => {
            this.logger.debug('WebSocket connection closed', { clientId, code, reason: reason.toString() });
            this.disconnectClient(clientId, `Connection closed: ${code}`);
        });
        ws.on('error', (error) => {
            this.logger.error('WebSocket connection error', { clientId, error });
            this.disconnectClient(clientId, `Connection error: ${error.message}`);
        });
        // Wait for client identification message
        this.pendingConnections.set(clientId, { connection, ws, userAgent });
    }
    handleClientMessage(clientId, message) {
        // Check if this is an identification message for pending connections
        const pending = this.pendingConnections.get(clientId);
        if (pending && message.method === 'identify') {
            this.completePendingConnection(clientId, pending, message.params);
            return;
        }
        // Route message to existing session
        const session = this.sessions.get(clientId);
        if (session) {
            session.lastActivity = new Date();
            // Handle session-specific messages here if needed
        }
    }
    completePendingConnection(clientId, pending, identificationParams) {
        const metadata = {
            userAgent: pending.userAgent,
            version: identificationParams.version,
            capabilities: identificationParams.capabilities || [],
            instanceId: identificationParams.instanceId,
            clientName: identificationParams.clientName
        };
        const clientType = identificationParams.type === 'vscode' ? 'vscode_instance' : 'ai_client';
        const session = {
            id: clientId,
            type: clientType,
            connectionTime: new Date(),
            lastActivity: new Date(),
            metadata,
            connection: pending.connection
        };
        this.sessions.set(clientId, session);
        this.pendingConnections.delete(clientId);
        this.logger.info('Client connected', { clientId, type: clientType, metadata });
        this.emit('client_connected', {
            type: 'client_connected',
            clientId,
            metadata
        });
        // Send connection acknowledgment
        pending.connection.send({
            id: 'connection_ack',
            result: {
                sessionId: clientId,
                serverCapabilities: ['popup_management', 'message_routing']
            }
        }).catch(error => {
            this.logger.error('Failed to send connection acknowledgment', { clientId, error });
        });
    }
    connectAIClient(clientId, metadata, connection) {
        if (this.sessions.has(clientId)) {
            throw new Error(`Client ${clientId} is already connected`);
        }
        if (this.sessions.size >= this.config.maxClients) {
            throw new Error('Maximum client limit reached');
        }
        const session = {
            id: clientId,
            type: 'ai_client',
            connectionTime: new Date(),
            lastActivity: new Date(),
            metadata,
            connection
        };
        this.sessions.set(clientId, session);
        this.logger.info('AI Client connected', { clientId, metadata });
        this.emit('client_connected', {
            type: 'client_connected',
            clientId,
            metadata
        });
    }
    async disconnectClient(clientId, reason) {
        const session = this.sessions.get(clientId);
        if (!session) {
            return; // Client not found
        }
        try {
            await session.connection.close();
        }
        catch (error) {
            this.logger.warn('Error closing client connection', { clientId, error });
        }
        this.sessions.delete(clientId);
        this.logger.info('Client disconnected', { clientId, reason });
        this.emit('client_disconnected', {
            type: 'client_disconnected',
            clientId,
            reason
        });
    }
    getSession(clientId) {
        return this.sessions.get(clientId);
    }
    getAllSessions() {
        return Array.from(this.sessions.values());
    }
    getSessionsByType(type) {
        return Array.from(this.sessions.values()).filter(session => session.type === type);
    }
    getActiveAIClient() {
        const aiClients = this.getSessionsByType('ai_client');
        // Return the most recently active AI client
        return aiClients.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())[0];
    }
    getActiveVSCodeInstance() {
        const vscodeInstances = this.getSessionsByType('vscode_instance');
        // Return the most recently active VS Code instance
        return vscodeInstances.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())[0];
    }
    getActiveClientCount() {
        return this.sessions.size;
    }
    async sendToClient(clientId, message) {
        const session = this.sessions.get(clientId);
        if (!session) {
            throw new Error(`Client ${clientId} not found`);
        }
        if (!session.connection.isAlive()) {
            throw new Error(`Client ${clientId} connection is not alive`);
        }
        try {
            await session.connection.send(message);
            session.lastActivity = new Date();
        }
        catch (error) {
            this.logger.error('Failed to send message to client', { clientId, error });
            // Consider disconnecting client on send failure
            this.disconnectClient(clientId, 'Send failure');
            throw error;
        }
    }
    async broadcastToType(type, message) {
        const sessions = this.getSessionsByType(type);
        const sendTasks = sessions.map(session => this.sendToClient(session.id, message).catch(error => {
            this.logger.warn('Failed to broadcast to client', { clientId: session.id, error });
            return null; // Don't fail the entire broadcast
        }));
        await Promise.all(sendTasks);
    }
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            this.performHeartbeat();
        }, this.config.heartbeatInterval);
    }
    performHeartbeat() {
        const now = new Date();
        const staleThreshold = now.getTime() - (this.config.heartbeatInterval * 3); // 3x heartbeat interval
        for (const [clientId, session] of this.sessions.entries()) {
            // Check if client is stale
            if (session.lastActivity.getTime() < staleThreshold) {
                this.logger.warn('Client appears stale, checking connection', { clientId });
                if (!session.connection.isAlive()) {
                    this.logger.info('Removing stale client', { clientId });
                    this.disconnectClient(clientId, 'Stale connection');
                    continue;
                }
            }
            // Send heartbeat ping
            this.sendToClient(clientId, {
                method: 'ping',
                params: { timestamp: now.toISOString() }
            }).catch(error => {
                this.logger.debug('Heartbeat ping failed', { clientId, error });
            });
        }
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=session-manager.js.map