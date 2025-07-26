import { EventEmitter } from 'events';
import type { ServerConfig, ServerHealth } from '../types/index.js';
export declare class MCPServer extends EventEmitter {
    private readonly server;
    private readonly sessionManager;
    private readonly popupManager;
    private readonly messageRouter;
    private readonly healthMonitor;
    private readonly logger;
    private readonly config;
    private startTime;
    constructor(config: ServerConfig);
    private setupEventHandlers;
    private setupMCPHandlers;
    private handleShowPopup;
    private handleGetUserResponse;
    private handleClosePopup;
    private handleListActivePopups;
    start(): Promise<void>;
    stop(): Promise<void>;
    getHealth(): ServerHealth;
    getConfig(): ServerConfig;
}
//# sourceMappingURL=mcp-server.d.ts.map