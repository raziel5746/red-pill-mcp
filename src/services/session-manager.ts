import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

import { Logger } from '../utils/server-logger.js';
import type { 
    ServerConfig, 
    ClientSession, 
    ClientMetadata, 
    ClientConnection, 
    MCPResponse, 
    MCPNotification 
} from '../types/index.js';

export class SessionManager extends EventEmitter {
    private readonly config: ServerConfig;
    private readonly logger: Logger;
    private readonly sessions = new Map<string, ClientSession>();
    private heartbeatTimer?: NodeJS.Timeout;
    private websocketServer?: WebSocket.Server;
    private readonly pendingConnections = new Map<string, {
        connection: ClientConnection;
        ws: WebSocket;
        userAgent: string;
    }>();

    constructor(config: ServerConfig, externalLogger?: any) {
        super();
        this.config = config;
        this.logger = externalLogger || new Logger(config.logLevel);
    }

    async start(): Promise<void> {
        this.logger.info('Starting Session Manager');

        // Start WebSocket server for VS Code instances
        await this.startWebSocketServer();

        // Start heartbeat monitoring
        this.startHeartbeat();

        this.logger.info('Session Manager started');
    }

    async stop(): Promise<void> {
        this.logger.info('Stopping Session Manager');

        // Stop heartbeat
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }

        // Close all sessions
        const closeTasks = Array.from(this.sessions.values()).map(session => 
            this.disconnectClient(session.id, 'Server shutdown')
        );
        await Promise.allSettled(closeTasks);

        // Close WebSocket server
        if (this.websocketServer) {
            await new Promise<void>((resolve, reject) => {
                this.websocketServer!.close((error?: Error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        }

        this.logger.info('Session Manager stopped');
    }

    private async startWebSocketServer(): Promise<void> {
        this.websocketServer = new WebSocket.Server({
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

    private handleWebSocketConnection(ws: WebSocket, request: any): void {
        const clientId = uuidv4();
        const userAgent = request.headers['user-agent'] || 'Unknown';

        this.logger.info('New WebSocket connection', { clientId, userAgent });

        // Create client connection wrapper
        const connection: ClientConnection = {
            send: async (message) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(message));
                } else {
                    throw new Error('Connection is not open');
                }
            },
            close: async () => {
                ws.close();
            },
            isAlive: () => ws.readyState === WebSocket.OPEN
        };

        // Handle connection setup
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleClientMessage(clientId, message);
            } catch (error) {
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

    private handleClientMessage(clientId: string, message: any): void {
        this.logger.info('Received client message', { clientId, messageType: message.method || message.type, message });
        
        // Check if this is an identification message for pending connections
        const pending = this.pendingConnections.get(clientId);
        if (pending && message.method === 'identify') {
            this.logger.info('Processing identify message for pending connection', { clientId, params: message.params });
            this.completePendingConnection(clientId, pending, message.params);
            return;
        }

        // Route message to existing session
        const session = this.sessions.get(clientId);
        if (session) {
            session.lastActivity = new Date();
            
            // Handle popup responses
            if (message.type === 'popup_response') {
                this.emit('popup_response', {
                    type: 'popup_response',
                    popupId: message.popupId,
                    result: message.result,
                    clientId
                });
            }
        }
    }

    private completePendingConnection(
        clientId: string, 
        pending: { connection: ClientConnection; ws: WebSocket; userAgent: string }, 
        identificationParams: any
    ): void {
        const metadata: ClientMetadata = {
            userAgent: pending.userAgent,
            version: identificationParams.version,
            capabilities: identificationParams.capabilities || [],
            instanceId: identificationParams.instanceId,
            clientName: identificationParams.clientName
        };

        const clientType = identificationParams.clientType === 'vscode_instance' ? 'vscode_instance' : 'ai_client';

        const session: ClientSession = {
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

    connectAIClient(clientId: string, metadata: ClientMetadata, connection: ClientConnection): void {
        if (this.sessions.has(clientId)) {
            throw new Error(`Client ${clientId} is already connected`);
        }

        if (this.sessions.size >= this.config.maxClients) {
            throw new Error('Maximum client limit reached');
        }

        const session: ClientSession = {
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

    async disconnectClient(clientId: string, reason?: string): Promise<void> {
        const session = this.sessions.get(clientId);
        if (!session) {
            return; // Client not found
        }

        try {
            await session.connection.close();
        } catch (error) {
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

    getSession(clientId: string): ClientSession | undefined {
        return this.sessions.get(clientId);
    }

    getAllSessions(): ClientSession[] {
        return Array.from(this.sessions.values());
    }

    getSessionsByType(type: 'ai_client' | 'vscode_instance'): ClientSession[] {
        return Array.from(this.sessions.values()).filter(session => session.type === type);
    }

    getActiveAIClient(): ClientSession | undefined {
        const aiClients = this.getSessionsByType('ai_client');
        // Return the most recently active AI client
        return aiClients.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())[0];
    }

    getActiveVSCodeInstance(): ClientSession | undefined {
        const vscodeInstances = this.getSessionsByType('vscode_instance');
        // Return the most recently active VS Code instance
        return vscodeInstances.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())[0];
    }

    getActiveClientCount(): number {
        return this.sessions.size;
    }

    async sendToClient(clientId: string, message: MCPResponse | MCPNotification): Promise<void> {
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
        } catch (error) {
            this.logger.error('Failed to send message to client', { clientId, error });
            // Consider disconnecting client on send failure
            this.disconnectClient(clientId, 'Send failure');
            throw error;
        }
    }

    registerAIClient(sessionId: string, metadata: Partial<ClientMetadata>): void {
        // Create a dummy connection for AI clients connected via SSE
        // The actual communication is handled by the MCP SSE transport
        const connection: ClientConnection = {
            send: async (message) => {
                this.logger.debug('AI client message would be sent via SSE transport', { sessionId, message });
            },
            close: async () => {
                this.logger.debug('AI client connection close requested', { sessionId });
            },
            isAlive: () => true // SSE connections are managed by HTTP server
        };

        const fullMetadata: ClientMetadata = {
            userAgent: metadata.userAgent || 'Unknown',
            version: metadata.version,
            capabilities: metadata.capabilities || [],
            instanceId: metadata.instanceId,
            clientName: metadata.clientName
        };

        this.connectAIClient(sessionId, fullMetadata, connection);
    }

    async broadcastToType(type: 'ai_client' | 'vscode_instance', message: MCPResponse | MCPNotification): Promise<void> {
        const sessions = this.getSessionsByType(type);
        const sendTasks = sessions.map(session => 
            this.sendToClient(session.id, message).catch(error => {
                this.logger.warn('Failed to broadcast to client', { clientId: session.id, error });
                return null; // Don't fail the entire broadcast
            })
        );
        await Promise.all(sendTasks);
    }

    private startHeartbeat(): void {
        this.heartbeatTimer = setInterval(() => {
            this.performHeartbeat();
        }, this.config.heartbeatInterval);
    }

    private performHeartbeat(): void {
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