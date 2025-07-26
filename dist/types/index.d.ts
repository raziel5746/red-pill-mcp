import { z } from 'zod';
export interface MCPRequest {
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}
export interface MCPResponse {
    id: string | number;
    result?: unknown;
    error?: MCPError;
}
export interface MCPError {
    code: number;
    message: string;
    data?: unknown;
}
export interface MCPNotification {
    method: string;
    params?: Record<string, unknown>;
}
export interface ClientSession {
    id: string;
    type: 'ai_client' | 'vscode_instance';
    connectionTime: Date;
    lastActivity: Date;
    metadata: ClientMetadata;
    connection: ClientConnection;
}
export interface ClientMetadata {
    userAgent?: string;
    version?: string;
    capabilities?: string[];
    instanceId?: string;
    clientName?: string;
}
export interface ClientConnection {
    send: (message: MCPResponse | MCPNotification) => Promise<void>;
    close: () => Promise<void>;
    isAlive: () => boolean;
}
export declare const PopupTypeSchema: any;
export type PopupType = z.infer<typeof PopupTypeSchema>;
export declare const PopupOptionsSchema: any;
export type PopupOptions = z.infer<typeof PopupOptionsSchema>;
export interface PopupInstance {
    id: string;
    vscodeInstanceId: string;
    aiClientId: string;
    options: PopupOptions;
    status: 'pending' | 'resolved' | 'timeout' | 'cancelled';
    createdAt: Date;
    resolvedAt?: Date;
    result?: PopupResult;
}
export interface PopupResult {
    button?: string;
    input?: string;
    cancelled?: boolean;
    timedOut?: boolean;
}
export interface ShowPopupParams {
    vscodeInstanceId?: string;
    options: PopupOptions;
}
export interface GetUserResponseParams {
    popupId?: string;
    timeout?: number;
}
export interface ClosePopupParams {
    popupId?: string;
    vscodeInstanceId?: string;
}
export interface ListActivePopupsParams {
    vscodeInstanceId?: string;
}
export interface RouteableMessage {
    fromClientId: string;
    toClientId?: string;
    toInstanceType?: 'ai_client' | 'vscode_instance';
    message: MCPRequest | MCPResponse | MCPNotification;
    routingMetadata?: RoutingMetadata;
}
export interface RoutingMetadata {
    popupId?: string;
    requiresResponse?: boolean;
    timeout?: number;
    priority?: 'low' | 'normal' | 'high';
}
export interface ServerHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    activeClients: number;
    activePopups: number;
    memoryUsage: NodeJS.MemoryUsage;
    errors: HealthError[];
}
export interface HealthError {
    timestamp: Date;
    type: 'connection' | 'routing' | 'popup' | 'protocol' | 'system';
    message: string;
    clientId?: string;
    stack?: string;
}
export interface ServerConfig {
    port: number;
    maxClients: number;
    popupTimeout: number;
    heartbeatInterval: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    enableDiagnostics: boolean;
    cors: {
        enabled: boolean;
        origins: string[];
    };
}
export type ServerEvent = {
    type: 'client_connected';
    clientId: string;
    metadata: ClientMetadata;
} | {
    type: 'client_disconnected';
    clientId: string;
    reason?: string;
} | {
    type: 'popup_created';
    popupId: string;
    aiClientId: string;
    vscodeInstanceId: string;
} | {
    type: 'popup_resolved';
    popupId: string;
    result: PopupResult;
} | {
    type: 'message_routed';
    fromClientId: string;
    toClientId: string;
    messageType: string;
} | {
    type: 'error_occurred';
    error: HealthError;
};
export interface EventEmitter {
    emit(event: ServerEvent): void;
    on(eventType: ServerEvent['type'], handler: (event: ServerEvent) => void): void;
    off(eventType: ServerEvent['type'], handler: (event: ServerEvent) => void): void;
}
//# sourceMappingURL=index.d.ts.map