import { z } from 'zod';

// MCP Protocol Types
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

// Session Management Types
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

// Popup Types with Zod Schemas
export const PopupTypeSchema = z.enum(['question', 'input']);
export type PopupType = z.infer<typeof PopupTypeSchema>;

export const PopupOptionsSchema = z.object({
    title: z.string(),
    message: z.string(),
    type: PopupTypeSchema.default('question'),
    buttons: z.array(z.string()).optional(),
    defaultButton: z.string().optional(),
    timeout: z.number().optional(),
    inputPlaceholder: z.string().optional()
});
export type PopupOptions = z.infer<typeof PopupOptionsSchema>;

// Server PopupInstance (used by the MCP server)
export interface ServerPopupInstance {
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
    customText?: string;
    cancelled?: boolean;
    timedOut?: boolean;
}

// Tool Parameter Types
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

// Routing Types
export interface RouteableMessage {
    id?: string | number;
    method?: string;
    params?: Record<string, unknown>;
    result?: unknown;
    error?: MCPError;
    target?: {
        type: 'ai_client' | 'vscode_instance';
        clientId?: string;
    };
}

export interface RoutingMetadata {
    popupId?: string;
    requiresResponse?: boolean;
    timeout?: number;
    priority?: 'low' | 'normal' | 'high';
}

// Health Monitoring Types
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

// Server Configuration
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

// Server Events
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

// Popup configuration used by the VS Code extension
export interface PopupConfig {
    id: string;
    title: string;
    content: string;
    buttons?: PopupButton[];
    timeout?: number;
    priority?: 'low' | 'medium' | 'high';
    metadata?: Record<string, any>;
    type?: 'question' | 'input';
    inputPlaceholder?: string;
}

export interface PopupButton {
    id: string;
    label: string;
    style?: 'primary' | 'secondary' | 'danger';
    action?: string;
}

export interface PopupResponse {
    popupId: string;
    buttonId?: string;
    customText?: string;
    customData?: any;
    timestamp: number;
    dismissed?: boolean;
}

export interface McpMessage {
    type: 'popup' | 'response' | 'status' | 'error';
    id: string;
    payload: any;
    timestamp: number;
}

// Extension PopupInstance (used by the extension)
export interface PopupInstance {
    config: PopupConfig;
    webviewPanel: any;
    createdAt: number;
    timeoutId?: NodeJS.Timeout;
}

export interface ExtensionState {
    isConnected: boolean;
    activePopups: Map<string, PopupInstance>;
    mcpConnection?: any;
    lastError?: string;
}

export interface ExtensionConfig {
    mcpServerUrl: string;
    autoConnect: boolean;
    popupTimeout: number;
    maxConcurrentPopups: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
}
