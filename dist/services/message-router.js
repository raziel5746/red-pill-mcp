"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageRouter = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const server_logger_js_1 = require("../utils/server-logger.js");
class MessageRouter extends events_1.EventEmitter {
    constructor(sessionManager) {
        super();
        this.pendingMessages = new Map();
        this.messageQueue = new Map(); // Per-client queues
        this.sessionManager = sessionManager;
        this.logger = new server_logger_js_1.Logger('info'); // TODO: Get from config
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        // Clean up pending messages when clients disconnect
        this.sessionManager.on('client_disconnected', (event) => {
            if (event.type === 'client_disconnected') {
                this.handleClientDisconnected(event.clientId);
            }
        });
    }
    async routeMessage(message) {
        this.logger.debug('Routing message', {
            from: message.fromClientId,
            to: message.toClientId || message.toInstanceType,
            method: 'method' in message.message ? message.message.method : 'response'
        });
        // Validate source client
        const fromSession = this.sessionManager.getSession(message.fromClientId);
        if (!fromSession) {
            throw new Error(`Source client ${message.fromClientId} not found`);
        }
        // Determine target client(s)
        const targetClients = this.resolveTargetClients(message);
        if (targetClients.length === 0) {
            throw new Error('No target clients found for routing');
        }
        // Handle different message types
        if (this.isRequest(message.message)) {
            return await this.routeRequest(message, targetClients);
        }
        else if (this.isResponse(message.message)) {
            await this.routeResponse(message, targetClients);
        }
        else {
            // Notification
            await this.routeNotification(message, targetClients);
        }
    }
    resolveTargetClients(message) {
        if (message.toClientId) {
            // Direct client targeting
            const session = this.sessionManager.getSession(message.toClientId);
            return session ? [message.toClientId] : [];
        }
        if (message.toInstanceType) {
            // Target all clients of specific type
            return this.sessionManager
                .getSessionsByType(message.toInstanceType)
                .map(session => session.id);
        }
        // Default routing based on source type
        const fromSession = this.sessionManager.getSession(message.fromClientId);
        if (!fromSession) {
            return [];
        }
        if (fromSession.type === 'ai_client') {
            // AI clients typically target VS Code instances
            return this.sessionManager
                .getSessionsByType('vscode_instance')
                .map(session => session.id);
        }
        else {
            // VS Code instances typically target AI clients
            return this.sessionManager
                .getSessionsByType('ai_client')
                .map(session => session.id);
        }
    }
    async routeRequest(message, targetClients) {
        const request = message.message;
        const metadata = message.routingMetadata || {};
        // For requests, we typically send to the first available target
        const targetClientId = targetClients[0];
        if (!metadata.requiresResponse) {
            // Fire and forget
            await this.sendToClient(targetClientId, request);
            return {
                id: request.id,
                result: { routed: true, targetClient: targetClientId }
            };
        }
        // Wait for response
        return new Promise((resolve, reject) => {
            const pendingId = (0, uuid_1.v4)();
            const timeout = metadata.timeout || 30000; // 30 second default
            const timeoutId = setTimeout(() => {
                this.pendingMessages.delete(pendingId);
                reject(new Error(`Request timeout after ${timeout}ms`));
            }, timeout);
            const pendingMessage = {
                id: pendingId,
                fromClientId: message.fromClientId,
                toClientId: targetClientId,
                message: request,
                metadata,
                timestamp: new Date(),
                timeoutId,
                resolve,
                reject
            };
            this.pendingMessages.set(pendingId, pendingMessage);
            // Add routing metadata to the request
            const routedRequest = {
                ...request,
                _routing: {
                    pendingId,
                    fromClientId: message.fromClientId,
                    priority: metadata.priority || 'normal'
                }
            };
            this.sendToClient(targetClientId, routedRequest).catch(error => {
                clearTimeout(timeoutId);
                this.pendingMessages.delete(pendingId);
                reject(error);
            });
        });
    }
    async routeResponse(message, targetClients) {
        const response = message.message;
        const routingInfo = response._routing;
        if (routingInfo?.pendingId) {
            // This is a response to a routed request
            const pending = this.pendingMessages.get(routingInfo.pendingId);
            if (pending) {
                // Clear timeout and resolve
                if (pending.timeoutId) {
                    clearTimeout(pending.timeoutId);
                }
                this.pendingMessages.delete(routingInfo.pendingId);
                // Remove routing metadata before resolving
                const cleanResponse = { ...response };
                delete cleanResponse._routing;
                pending.resolve(cleanResponse);
                this.emit('message_routed', {
                    type: 'message_routed',
                    fromClientId: message.fromClientId,
                    toClientId: pending.fromClientId,
                    messageType: 'response'
                });
                return;
            }
        }
        // Regular response routing
        for (const targetClientId of targetClients) {
            await this.sendToClient(targetClientId, response);
        }
    }
    async routeNotification(message, targetClients) {
        const notification = message.message;
        // Send notification to all target clients
        const sendTasks = targetClients.map(targetClientId => this.sendToClient(targetClientId, notification).then(() => {
            this.emit('message_routed', {
                type: 'message_routed',
                fromClientId: message.fromClientId,
                toClientId: targetClientId,
                messageType: 'notification'
            });
        }).catch(error => {
            this.logger.warn('Failed to route notification', {
                targetClientId,
                method: notification.method,
                error
            });
            return null; // Don't fail entire operation
        }));
        await Promise.allSettled(sendTasks);
    }
    async sendToClient(clientId, message) {
        try {
            await this.sessionManager.sendToClient(clientId, message);
        }
        catch (error) {
            // If direct send fails, queue the message
            this.queueMessage(clientId, {
                fromClientId: 'system',
                message,
                routingMetadata: { priority: 'normal' }
            });
            throw error;
        }
    }
    queueMessage(clientId, message) {
        if (!this.messageQueue.has(clientId)) {
            this.messageQueue.set(clientId, []);
        }
        const queue = this.messageQueue.get(clientId);
        queue.push(message);
        // Limit queue size to prevent memory issues
        const maxQueueSize = 100;
        if (queue.length > maxQueueSize) {
            const removed = queue.shift();
            this.logger.warn('Message queue overflow, dropping oldest message', {
                clientId,
                droppedMessage: removed?.message
            });
        }
        this.logger.debug('Message queued for offline client', { clientId, queueSize: queue.length });
    }
    async processQueuedMessages(clientId) {
        const queue = this.messageQueue.get(clientId);
        if (!queue || queue.length === 0) {
            return;
        }
        this.logger.info('Processing queued messages for client', { clientId, count: queue.length });
        // Sort by priority
        queue.sort((a, b) => {
            const priorityOrder = { high: 3, normal: 2, low: 1 };
            const aPriority = priorityOrder[a.routingMetadata?.priority || 'normal'];
            const bPriority = priorityOrder[b.routingMetadata?.priority || 'normal'];
            return bPriority - aPriority;
        });
        // Process messages
        while (queue.length > 0) {
            const message = queue.shift();
            try {
                await this.sendToClient(clientId, message.message);
            }
            catch (error) {
                // If still can't send, put it back at the front
                queue.unshift(message);
                this.logger.warn('Failed to process queued message', { clientId, error });
                break;
            }
        }
        // Clean up empty queue
        if (queue.length === 0) {
            this.messageQueue.delete(clientId);
        }
    }
    handleClientDisconnected(clientId) {
        // Reject all pending messages for this client
        for (const [pendingId, pending] of this.pendingMessages.entries()) {
            if (pending.toClientId === clientId) {
                if (pending.timeoutId) {
                    clearTimeout(pending.timeoutId);
                }
                pending.reject(new Error(`Target client ${clientId} disconnected`));
                this.pendingMessages.delete(pendingId);
            }
        }
        // Clear message queue
        this.messageQueue.delete(clientId);
    }
    isRequest(message) {
        return 'method' in message && 'id' in message;
    }
    isResponse(message) {
        return 'id' in message && !('method' in message);
    }
    getPendingMessageCount() {
        return this.pendingMessages.size;
    }
    getQueuedMessageCount(clientId) {
        if (clientId) {
            return this.messageQueue.get(clientId)?.length || 0;
        }
        let total = 0;
        for (const queue of this.messageQueue.values()) {
            total += queue.length;
        }
        return total;
    }
    getRoutingStats() {
        return {
            pendingMessages: this.pendingMessages.size,
            queuedMessages: this.getQueuedMessageCount(),
            totalQueues: this.messageQueue.size
        };
    }
}
exports.MessageRouter = MessageRouter;
//# sourceMappingURL=message-router.js.map