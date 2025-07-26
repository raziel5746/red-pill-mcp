import { EventEmitter } from 'events';

import { SessionManager } from './session-manager.js';
import { Logger } from '../utils/server-logger.js';
import type { RouteableMessage, MCPResponse } from '../types/index.js';

export class MessageRouter extends EventEmitter {
    private readonly sessionManager: SessionManager;
    private readonly logger: Logger;
    private readonly pendingMessages = new Map<string, any>();
    private readonly messageQueue = new Map<string, any[]>();

    constructor(sessionManager: SessionManager) {
        super();
        this.sessionManager = sessionManager;
        this.logger = new Logger('info'); // Default log level
        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.sessionManager.on('client_connected', (event) => {
            this.processQueuedMessages(event.clientId);
        });

        this.sessionManager.on('client_disconnected', (event) => {
            this.handleClientDisconnected(event.clientId);
        });
    }

    async routeMessage(message: RouteableMessage): Promise<MCPResponse | void> {
        this.logger.debug('Routing message', { messageId: message.id, type: message.method });

        try {
            if (this.isRequest(message)) {
                return await this.routeRequest(message);
            } else if (this.isResponse(message)) {
                await this.routeResponse(message);
            } else {
                await this.routeNotification(message);
            }
        } catch (error) {
            this.logger.error('Message routing failed', { messageId: message.id, error });
            throw error;
        }
    }

    private async resolveTargetClients(message: RouteableMessage): Promise<string[]> {
        // Simple implementation - route to all clients of appropriate type
        if (message.target?.type === 'vscode_instance') {
            return this.sessionManager.getSessionsByType('vscode_instance').map(s => s.id);
        } else if (message.target?.type === 'ai_client') {
            return this.sessionManager.getSessionsByType('ai_client').map(s => s.id);
        }
        return [];
    }

    private async routeRequest(message: RouteableMessage): Promise<MCPResponse> {
        const targetClients = await this.resolveTargetClients(message);
        
        if (targetClients.length === 0) {
            throw new Error('No target clients found for request');
        }

        // Send to first available target (simplified)
        const targetClientId = targetClients[0];
        return await this.sendToClient(targetClientId, message);
    }

    private async routeResponse(message: RouteableMessage): Promise<void> {
        const targetClients = await this.resolveTargetClients(message);
        
        for (const clientId of targetClients) {
            try {
                await this.sendToClient(clientId, message);
            } catch (error) {
                this.logger.warn('Failed to route response to client', { clientId, error });
            }
        }
    }

    private async routeNotification(message: RouteableMessage): Promise<void> {
        const targetClients = await this.resolveTargetClients(message);
        
        for (const clientId of targetClients) {
            try {
                await this.sendToClient(clientId, message);
            } catch (error) {
                this.logger.warn('Failed to route notification to client', { clientId, error });
            }
        }
    }

    private async sendToClient(clientId: string, message: RouteableMessage): Promise<any> {
        const session = this.sessionManager.getSession(clientId);
        if (!session) {
            await this.queueMessage(clientId, message);
            throw new Error(`Client ${clientId} not connected, message queued`);
        }

        try {
            // Convert RouteableMessage to proper MCP format
            const mcpMessage = {
                id: message.id,
                method: message.method,
                params: message.params,
                result: message.result,
                error: message.error
            };
            await session.connection.send(mcpMessage as any);
            return message; // Simplified response
        } catch (error) {
            await this.queueMessage(clientId, message);
            throw error;
        }
    }

    private async queueMessage(clientId: string, message: RouteableMessage): Promise<void> {
        if (!this.messageQueue.has(clientId)) {
            this.messageQueue.set(clientId, []);
        }
        this.messageQueue.get(clientId)!.push(message);
        this.logger.debug('Message queued for client', { clientId, messageId: message.id });
    }

    async processQueuedMessages(clientId: string): Promise<void> {
        const queue = this.messageQueue.get(clientId);
        if (!queue || queue.length === 0) {
            return;
        }

        this.logger.info('Processing queued messages', { clientId, count: queue.length });

        const session = this.sessionManager.getSession(clientId);
        if (!session) {
            return;
        }

        for (const message of queue) {
            try {
                await session.connection.send(message);
            } catch (error) {
                this.logger.warn('Failed to send queued message', { clientId, messageId: message.id, error });
            }
        }

        this.messageQueue.delete(clientId);
    }

    private handleClientDisconnected(clientId: string): void {
        // Clean up pending messages for disconnected client
        this.pendingMessages.delete(clientId);
        this.logger.debug('Cleaned up pending messages for disconnected client', { clientId });
    }

    private isRequest(message: RouteableMessage): boolean {
        return message.method !== undefined && message.id !== undefined;
    }

    private isResponse(message: RouteableMessage): boolean {
        return message.result !== undefined || message.error !== undefined;
    }

    getPendingMessageCount(): number {
        return this.pendingMessages.size;
    }

    getQueuedMessageCount(clientId?: string): number {
        if (clientId) {
            return this.messageQueue.get(clientId)?.length || 0;
        }
        return Array.from(this.messageQueue.values()).reduce((total, queue) => total + queue.length, 0);
    }

    getRoutingStats() {
        return {
            pendingMessages: this.pendingMessages.size,
            queuedMessages: this.getQueuedMessageCount(),
            totalQueues: this.messageQueue.size
        };
    }
}