import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import http from 'http';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { EventEmitter } from 'events';

import { SessionManager } from '../services/session-manager.js';
import { PopupManager } from '../services/popup-manager.js';
import { MessageRouter } from '../services/message-router.js';
import { HealthMonitor } from '../services/health-monitor.js';
import { Logger } from '../utils/server-logger.js';

import type { ServerConfig, ServerHealth } from '../types/index.js';
import { PopupOptionsSchema } from '../types/index.js';

export class MCPServer extends EventEmitter {
    private readonly server: Server;
    private readonly sessionManager: SessionManager;
    private readonly popupManager: PopupManager;
    private readonly messageRouter: MessageRouter;
    private readonly healthMonitor: HealthMonitor;
    private readonly logger: Logger;
    private readonly config: ServerConfig;
    private startTime: Date;
    private sseTransports = new Map<string, any>(); // Store SSE transports by session ID

    constructor(config: ServerConfig, externalLogger?: any) {
        super();
        this.config = config;
        this.startTime = new Date();
        this.logger = externalLogger || new Logger(config.logLevel);

        // Initialize MCP server
        this.server = new Server({
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
        this.sessionManager = new SessionManager(config, this.logger);
        this.popupManager = new PopupManager(config, this.logger, this.sessionManager);
        this.messageRouter = new MessageRouter(this.sessionManager);
        this.healthMonitor = new HealthMonitor(config, this.logger);

        this.setupEventHandlers();
        this.setupMCPHandlers();
    }

    private setupEventHandlers(): void {
        // Forward events from services
        this.sessionManager.on('client_connected', (event) => this.emit('client_connected', event));
        this.sessionManager.on('client_disconnected', (event) => this.emit('client_disconnected', event));
        this.popupManager.on('popup_created', (event) => this.emit('popup_created', event));
        this.popupManager.on('popup_resolved', (event) => this.emit('popup_resolved', event));

        // Handle popup responses from VS Code
        this.sessionManager.on('popup_response', (event) => {
            this.logger.info('Received popup response from VS Code', event);
            this.popupManager.resolvePopup(event.popupId, event.result);
        });

        // Handle health monitoring
        this.on('error_occurred', (error) => {
            this.healthMonitor.recordError(error);
            this.logger.error('Server error occurred', error);
        });
    }

    private setupMCPHandlers(): void {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'show_popup',
                        description: 'Display a popup in VS Code with text and options, and wait for user response',
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
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'show_popup':
                        return await this.handleShowPopup(args);
                    case 'list_active_popups':
                        return await this.handleListActivePopups(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
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

    private async handleShowPopup(params: any): Promise<{ content: Array<{ type: 'text', text: string }>, structuredContent?: any }> {
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

        // Get AI client
        const aiClient = this.sessionManager.getActiveAIClient();
        if (!aiClient) {
            throw new Error('No active AI client found');
        }

        // Create popup and wait for response
        const popupId = await this.popupManager.createPopup(aiClient.id, vscodeInstance.id, params.options);
        const result = await this.popupManager.waitForPopupResponse(popupId, params.options.timeout);
        
        // Format according to MCP protocol
        let textContent = 'User response: ';
        if (result.timedOut) {
            textContent = 'Popup timed out';
        } else if (result.cancelled) {
            textContent = 'Popup was cancelled';
        } else if (result.button) {
            textContent = `User clicked: ${result.button}`;
        } else if (result.input) {
            textContent = `User entered: ${result.input}`;
        } else if (result.customText) {
            textContent = `User entered custom text: ${result.customText}`;
        } else {
            textContent = 'Popup closed';
        }

        return {
            content: [{ type: 'text', text: textContent }],
            structuredContent: { popupId, ...result }
        };
    }


    private async handleListActivePopups(params: any): Promise<{ content: Array<{ type: 'text', text: string }>, structuredContent?: { popups: any[] } }> {
        this.logger.debug('Handling list_active_popups request', params);

        const popups = this.popupManager.getActivePopups(params.vscodeInstanceId);
        
        return {
            content: [{ type: 'text', text: `Found ${popups.length} active popup(s)` }],
            structuredContent: { popups }
        };
    }

    async start(): Promise<void> {
        this.logger.info('Starting MCP Server', { port: this.config.port });

        try {
            // Create HTTP server for MCP SSE transport
            const httpServer = http.createServer();

            httpServer.on('request', async (req, res) => {
                this.logger.debug('HTTP request received', { method: req.method, url: req.url });

                // Enable CORS
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                if (req.method === 'GET' && req.url === '/') {
                    // Handle SSE connection
                    this.logger.info('New SSE connection for MCP');
                    
                    const transport = new SSEServerTransport('/messages', res);
                    await transport.start();
                    
                    // Store transport by session ID for message routing
                    this.sseTransports.set(transport.sessionId, transport);
                    
                    // Register AI client session with SessionManager
                    this.sessionManager.registerAIClient(transport.sessionId, {
                        userAgent: req.headers['user-agent'] || 'MCP Client',
                        version: '1.0.0',
                        capabilities: ['popup_tools'],
                        clientName: 'AI Assistant'
                    });
                    
                    // Connect the MCP server to this SSE transport
                    await this.server.connect(transport);
                    
                    // Clean up when connection closes
                    res.on('close', () => {
                        this.sseTransports.delete(transport.sessionId);
                        this.sessionManager.disconnectClient(transport.sessionId, 'SSE connection closed');
                        this.logger.debug('SSE connection closed', { sessionId: transport.sessionId });
                    });
                    
                } else if (req.method === 'POST' && req.url?.startsWith('/messages')) {
                    // Handle incoming messages
                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });
                    
                    req.on('end', async () => {
                        try {
                            const message = JSON.parse(body);
                            this.logger.debug('Received MCP message via POST', message);
                            
                            // Extract session ID from URL
                            const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
                            const sessionId = urlParams.get('sessionId');
                            
                            if (sessionId && this.sseTransports.has(sessionId)) {
                                // Route message to the correct SSE transport
                                const transport = this.sseTransports.get(sessionId);
                                await transport.handlePostMessage(req, res, message);
                            } else {
                                this.logger.warn('No SSE transport found for session', { sessionId });
                                res.writeHead(404, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Session not found' }));
                            }
                        } catch (error) {
                            this.logger.error('Failed to parse POST message', error);
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Invalid JSON' }));
                        }
                    });
                } else {
                    // Handle 404
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Not found' }));
                }
            });

            // Start HTTP server
            await new Promise<void>((resolve, reject) => {
                httpServer.listen(this.config.port, (error?: Error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });

            // Start services
            await this.sessionManager.start();
            await this.healthMonitor.start();

            this.logger.info('MCP Server started successfully on HTTP port', { port: this.config.port });
        } catch (error) {
            this.logger.error('Failed to start MCP Server', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        this.logger.info('Stopping MCP Server');

        try {
            // Stop services
            await this.healthMonitor.stop();
            await this.sessionManager.stop();

            // Close MCP server
            await this.server.close();

            this.logger.info('MCP Server stopped successfully');
        } catch (error) {
            this.logger.error('Error stopping MCP Server', error);
            throw error;
        }
    }

    getHealth(): ServerHealth {
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

    getConfig(): ServerConfig {
        return { ...this.config };
    }
}