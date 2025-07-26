import type { PopupOptions, PopupResult, MCPRequest, MCPResponse, MCPNotification } from '../types/index.js';
export type VSCodeToServerMessage = {
    type: 'identify';
    payload: VSCodeIdentification;
} | {
    type: 'popup_response';
    payload: PopupResponsePayload;
} | {
    type: 'heartbeat_response';
    payload: {
        timestamp: string;
    };
} | {
    type: 'ready';
    payload: {};
} | {
    type: 'error';
    payload: {
        message: string;
        code?: string;
    };
};
export type ServerToVSCodeMessage = {
    type: 'connection_ack';
    payload: ConnectionAckPayload;
} | {
    type: 'show_popup';
    payload: ShowPopupPayload;
} | {
    type: 'close_popup';
    payload: ClosePopupPayload;
} | {
    type: 'heartbeat';
    payload: {
        timestamp: string;
    };
} | {
    type: 'server_status';
    payload: ServerStatusPayload;
};
export interface VSCodeIdentification {
    type: 'vscode';
    instanceId: string;
    version: string;
    workspaceName?: string;
    capabilities: string[];
}
export interface ConnectionAckPayload {
    sessionId: string;
    serverCapabilities: string[];
    serverVersion: string;
}
export interface ShowPopupPayload {
    popupId: string;
    options: PopupOptions;
    aiClientId: string;
}
export interface PopupResponsePayload {
    popupId: string;
    result: PopupResult;
}
export interface ClosePopupPayload {
    popupId?: string;
}
export interface ServerStatusPayload {
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeClients: number;
    activePopups: number;
}
/**
 * Converts MCP protocol messages to VS Code extension format
 */
export declare class VSCodeMessageAdapter {
    static mcpRequestToVSCode(request: MCPRequest): ServerToVSCodeMessage | null;
    static mcpNotificationToVSCode(notification: MCPNotification): ServerToVSCodeMessage | null;
    static vscodeToMCPResponse(message: VSCodeToServerMessage, originalRequestId: string | number): MCPResponse | null;
    static vscodeToMCPNotification(message: VSCodeToServerMessage): MCPNotification | null;
}
/**
 * Protocol handler for VS Code extension WebSocket connections
 */
export declare class VSCodeProtocolHandler {
    private readonly pendingRequests;
    handleIncomingMessage(rawMessage: string, sessionId: string): {
        type: 'response' | 'notification' | 'identification' | 'unknown';
        mcpMessage?: MCPResponse | MCPNotification;
        identification?: VSCodeIdentification;
        error?: string;
    };
    convertOutgoingMessage(mcpMessage: MCPRequest | MCPResponse | MCPNotification, sessionId: string): string | null;
    private addPendingRequest;
    private findPendingRequest;
    private clearPendingRequest;
    cleanup(sessionId?: string): void;
    getPendingRequestCount(sessionId?: string): number;
}
//# sourceMappingURL=vscode-interface.d.ts.map