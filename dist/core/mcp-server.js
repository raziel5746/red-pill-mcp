"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPServer = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const events_1 = require("events");
const session_manager_js_1 = require("../services/session-manager.js");
const popup_manager_js_1 = require("../services/popup-manager.js");
const message_router_js_1 = require("../services/message-router.js");
const health_monitor_js_1 = require("../services/health-monitor.js");
const server_logger_js_1 = require("../utils/server-logger.js");
class MCPServer extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.startTime = new Date();
        this.logger = new server_logger_js_1.Logger(config.logLevel);
        // Initialize MCP server
        this.server = new index_js_1.Server({
            name: 'red-pill-mcp',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
                resources: {},
                prompts: {},
            },
        });
        // Initialize services
        this.sessionManager = new session_manager_js_1.SessionManager(config);
        this.popupManager = new popup_manager_js_1.PopupManager(config);
        this.messageRouter = new message_router_js_1.MessageRouter(this.sessionManager);
        this.healthMonitor = new health_monitor_js_1.HealthMonitor(config);
        this.setupEventHandlers();
        this.setupMCPHandlers();
    }
    setupEventHandlers() {
        // Forward events from services
        this.sessionManager.on('client_connected', (event) => this.emit('client_connected', event));
        this.sessionManager.on('client_disconnected', (event) => this.emit('client_disconnected', event));
        this.popupManager.on('popup_created', (event) => this.emit('popup_created', event));
        this.popupManager.on('popup_resolved', (event) => this.emit('popup_resolved', event));
        // Handle health monitoring
        this.on('error_occurred', (error) => {
            this.healthMonitor.recordError(error);
            this.logger.error('Server error occurred', error);
        });
    }
    setupMCPHandlers() {
        // List available tools
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'show_popup',
                        description: 'Display a popup in VS Code with text and options',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                vscodeInstanceId: {
                                    type: 'string',
                                    description: 'VS Code instance ID (optional, uses active instance if not provided)'
                                },
                                options: {
                                    type: 'object',
                                    properties: {
                                        title: { type: 'string', description: 'Popup title' },
                                        message: { type: 'string', description: 'Popup message' },
                                        type: {
                                            type: 'string',
                                            enum: ['info', 'warning', 'error', 'question', 'input'],
                                            description: 'Popup type'
                                        },
                                        buttons: {
                                            type: 'array',
                                            items: { type: 'string' },
                                            description: 'Button labels (optional)'
                                        },
                                        defaultButton: { type: 'string', description: 'Default button (optional)' },
                                        timeout: { type: 'number', description: 'Timeout in milliseconds (optional)' },
                                        modal: { type: 'boolean', description: 'Modal popup (optional)' },
                                        inputPlaceholder: { type: 'string', description: 'Input placeholder for input type (optional)' }
                                    },
                                    required: ['title', 'message', 'type']
                                }
                            },
                            required: ['options']
                        }
                    },
                    {
                        name: 'get_user_response',
                        description: 'Wait for and return user response from a popup',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                popupId: {
                                    type: 'string',
                                    description: 'Popup ID to wait for (optional, waits for any popup if not provided)'
                                },
                                timeout: {
                                    type: 'number',
                                    description: 'Timeout in milliseconds (optional)'
                                }
                            }
                        }
                    },
                    {
                        name: 'close_popup',
                        description: 'Programmatically close popups',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                popupId: {
                                    type: 'string',
                                    description: 'Popup ID to close (optional, closes all if not provided)'
                                },
                                vscodeInstanceId: {
                                    type: 'string',
                                    description: 'VS Code instance ID (optional)'
                                }
                            }
                        }
                    },
                    {
                        name: 'list_active_popups',
                        description: 'List current active popups',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                vscodeInstanceId: {
                                    type: 'string',
                                    description: 'VS Code instance ID (optional, lists all if not provided)'
                                }
                            }
                        }
                    }
                ]
            };
        });
        // Handle tool calls
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    case 'show_popup':
                        return await this.handleShowPopup(args);
                    case 'get_user_response':
                        return await this.handleGetUserResponse(args);
                    case 'close_popup':
                        return await this.handleClosePopup(args);
                    case 'list_active_popups':
                        return await this.handleListActivePopups(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                this.emit('error_occurred', {
                    timestamp: new Date(),
                    type: 'protocol',
                    message: `Tool execution failed: ${name}`,
                    stack: error instanceof Error ? error.stack : undefined
                });
                throw error;
            }
        });
    }
    async handleShowPopup(params) {
        this.logger.debug('Handling show_popup request', params);
        // Validate popup options
        const validationResult = PopupOptionsSchema.safeParse(params.options);
        if (!validationResult.success) {
            throw new Error(`Invalid popup options: ${validationResult.error.message}`);
        }
        // Get VS Code instance
        const vscodeInstance = params.vscodeInstanceId
            ? this.sessionManager.getSession(params.vscodeInstanceId)
            : this.sessionManager.getActiveVSCodeInstance();
        if (!vscodeInstance || vscodeInstance.type !== 'vscode_instance') {
            throw new Error('No active VS Code instance found');
        }
        // Get AI client (assuming current request context)
        const aiClient = this.sessionManager.getActiveAIClient();
        if (!aiClient) {
            throw new Error('No active AI client found');
        }
        // Create popup
        const popupId = await this.popupManager.createPopup(aiClient.id, vscodeInstance.id, params.options);
        return { popupId };
    }
    async handleGetUserResponse(params) {
        this.logger.debug('Handling get_user_response request', params);
        const timeout = params.timeout ?? this.config.popupTimeout;
        if (params.popupId) {
            // Wait for specific popup
            return await this.popupManager.waitForPopupResponse(params.popupId, timeout);
        }
        else {
            // Wait for any popup response
            return await this.popupManager.waitForAnyPopupResponse(timeout);
        }
    }
    async handleClosePopup(params) {
        this.logger.debug('Handling close_popup request', params);
        if (params.popupId) {
            // Close specific popup
            await this.popupManager.closePopup(params.popupId);
            return { closed: [params.popupId] };
        }
        else {
            // Close all popups for instance or all
            const closedIds = await this.popupManager.closeAllPopups(params.vscodeInstanceId);
            return { closed: closedIds };
        }
    }
    async handleListActivePopups(params) {
        this.logger.debug('Handling list_active_popups request', params);
        const popups = this.popupManager.getActivePopups(params.vscodeInstanceId);
        return { popups };
    }
    async start() {
        this.logger.info('Starting MCP Server', { port: this.config.port });
        try {
            // Initialize transport (stdio by default, can be extended for WebSocket)
            const transport = new stdio_js_1.StdioServerTransport();
            await this.server.connect(transport);
            // Start services
            await this.sessionManager.start();
            await this.healthMonitor.start();
            this.logger.info('MCP Server started successfully');
        }
        catch (error) {
            this.logger.error('Failed to start MCP Server', error);
            throw error;
        }
    }
    async stop() {
        this.logger.info('Stopping MCP Server');
        try {
            // Stop services
            await this.healthMonitor.stop();
            await this.sessionManager.stop();
            // Close MCP server
            await this.server.close();
            this.logger.info('MCP Server stopped successfully');
        }
        catch (error) {
            this.logger.error('Error stopping MCP Server', error);
            throw error;
        }
    }
    getHealth() {
        const now = new Date();
        const uptime = now.getTime() - this.startTime.getTime();
        return {
            status: this.healthMonitor.getStatus(),
            uptime,
            activeClients: this.sessionManager.getActiveClientCount(),
            activePopups: this.popupManager.getActivePopupCount(),
            memoryUsage: process.memoryUsage(),
            errors: this.healthMonitor.getRecentErrors()
        };
    }
    getConfig() {
        return { ...this.config };
    }
}
exports.MCPServer = MCPServer;
//# sourceMappingURL=mcp-server.js.map