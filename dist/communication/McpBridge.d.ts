import { EventEmitter } from 'events';
import { ConfigManager } from '../managers/ConfigManager';
import { Logger } from '../utils/Logger';
import { PopupConfig, PopupResponse, ExtensionState } from '../types';
export declare class McpBridge extends EventEmitter {
    private configManager;
    private state;
    private logger;
    private websocket?;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private heartbeatInterval?;
    private connectionTimeout?;
    constructor(configManager: ConfigManager, state: ExtensionState, logger: Logger);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    reconnect(): Promise<void>;
    sendResponse(response: PopupResponse): void;
    onPopupRequest(callback: (config: PopupConfig) => void): void;
    private setupWebSocketHandlers;
    private parseMessage;
    private handleMessage;
    private handlePopupMessage;
    private handleStatusMessage;
    private handleErrorMessage;
    private sendMessage;
    private sendHandshake;
    private startHeartbeat;
    private handleDisconnection;
    private handleConnectionError;
    private attemptReconnection;
    dispose(): void;
}
//# sourceMappingURL=McpBridge.d.ts.map