import { EventEmitter } from 'events';
import type { ServerConfig, ClientSession, ClientMetadata, ClientConnection, MCPResponse, MCPNotification } from '../types/index.js';
export declare class SessionManager extends EventEmitter {
    private readonly config;
    private readonly logger;
    private readonly sessions;
    private heartbeatTimer?;
    private websocketServer?;
    constructor(config: ServerConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    private startWebSocketServer;
    private handleWebSocketConnection;
    private readonly pendingConnections;
    private handleClientMessage;
    private completePendingConnection;
    connectAIClient(clientId: string, metadata: ClientMetadata, connection: ClientConnection): void;
    disconnectClient(clientId: string, reason?: string): Promise<void>;
    getSession(clientId: string): ClientSession | undefined;
    getAllSessions(): ClientSession[];
    getSessionsByType(type: 'ai_client' | 'vscode_instance'): ClientSession[];
    getActiveAIClient(): ClientSession | undefined;
    getActiveVSCodeInstance(): ClientSession | undefined;
    getActiveClientCount(): number;
    sendToClient(clientId: string, message: MCPResponse | MCPNotification): Promise<void>;
    broadcastToType(type: 'ai_client' | 'vscode_instance', message: MCPResponse | MCPNotification): Promise<void>;
    private startHeartbeat;
    private performHeartbeat;
}
//# sourceMappingURL=session-manager.d.ts.map