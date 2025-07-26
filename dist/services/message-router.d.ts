import { EventEmitter } from 'events';
import type { RouteableMessage, MCPResponse } from '../types/index.js';
import { SessionManager } from './session-manager.js';
export declare class MessageRouter extends EventEmitter {
    private readonly sessionManager;
    private readonly logger;
    private readonly pendingMessages;
    private readonly messageQueue;
    constructor(sessionManager: SessionManager);
    private setupEventHandlers;
    routeMessage(message: RouteableMessage): Promise<MCPResponse | void>;
    private resolveTargetClients;
    private routeRequest;
    private routeResponse;
    private routeNotification;
    private sendToClient;
    private queueMessage;
    processQueuedMessages(clientId: string): Promise<void>;
    private handleClientDisconnected;
    private isRequest;
    private isResponse;
    getPendingMessageCount(): number;
    getQueuedMessageCount(clientId?: string): number;
    getRoutingStats(): {
        pendingMessages: number;
        queuedMessages: number;
        totalQueues: number;
    };
}
//# sourceMappingURL=message-router.d.ts.map