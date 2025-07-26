import { EventEmitter } from 'events';
import WebSocket, { WebSocketServer } from 'ws';
import { PopupConfig, PopupResponse } from '../../src/types';

export interface MockMCPServerOptions {
  port?: number;
  autoStart?: boolean;
  responseDelay?: number;
}

export interface ClientSession {
  id: string;
  websocket: WebSocket;
  type: 'ai_client' | 'vscode_instance';
  connectedAt: number;
}

/**
 * Mock MCP server for testing
 * Simulates the actual MCP server behavior for testing client interactions
 */
export class MockMCPServer extends EventEmitter {
  private port: number;
  private server?: WebSocketServer;
  private clients = new Map<string, ClientSession>();
  private activePopups = new Map<string, PopupConfig>();
  private popupResponses = new Map<string, PopupResponse>();
  private responseDelay: number;
  private isRunning = false;
  private messageId = 0;

  constructor(options: MockMCPServerOptions = {}) {
    super();
    this.port = options.port || 8080;
    this.responseDelay = options.responseDelay || 100;

    if (options.autoStart) {
      this.start();
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = new WebSocketServer({ port: this.port });

        this.server.on('connection', (websocket, request) => {
          this.handleNewConnection(websocket, request);
        });

        this.server.on('listening', () => {
          this.isRunning = true;
          this.emit('server_started', { port: this.port });
          resolve();
        });

        this.server.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      // Close all client connections
      this.clients.forEach((client) => {
        client.websocket.terminate();
      });
      this.clients.clear();

      this.server!.close(() => {
        this.isRunning = false;
        this.emit('server_stopped');
        resolve();
      });
    });
  }

  private handleNewConnection(websocket: WebSocket, request: any): void {
    const clientId = this.generateClientId();
    const clientType = this.detectClientType(request);

    const session: ClientSession = {
      id: clientId,
      websocket,
      type: clientType,
      connectedAt: Date.now()
    };

    this.clients.set(clientId, session);

    websocket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(clientId, message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    websocket.on('close', () => {
      this.clients.delete(clientId);
      this.emit('client_disconnected', { clientId, type: clientType });
    });

    websocket.on('error', (error) => {
      console.error(`Client ${clientId} error:`, error);
      this.clients.delete(clientId);
    });

    this.emit('client_connected', { clientId, type: clientType });
  }

  private detectClientType(request: any): 'ai_client' | 'vscode_instance' {
    // Simple heuristic - in real implementation this would be more sophisticated
    const userAgent = request.headers['user-agent'] || '';
    if (userAgent.includes('vscode') || userAgent.includes('VS Code')) {
      return 'vscode_instance';
    }
    return 'ai_client';
  }

  private async handleMessage(clientId: string, message: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    // Simulate processing delay
    await this.delay(this.responseDelay);

    try {
      if (message.method) {
        await this.handleToolCall(clientId, message);
      } else if (message.type) {
        await this.handleCustomMessage(clientId, message);
      }
    } catch (error) {
      this.sendErrorResponse(client.websocket, message.id, error);
    }
  }

  private async handleToolCall(clientId: string, message: any): Promise<void> {
    const client = this.clients.get(clientId)!;
    const { method, params, id } = message;

    switch (method) {
      case 'tools/list':
        this.sendResponse(client.websocket, id, {
          tools: [
            {
              name: 'show_popup',
              description: 'Display a popup in VS Code',
              inputSchema: { type: 'object' }
            },
            {
              name: 'get_user_response',
              description: 'Wait for user response',
              inputSchema: { type: 'object' }
            },
            {
              name: 'close_popup',
              description: 'Close popups',
              inputSchema: { type: 'object' }
            },
            {
              name: 'list_active_popups',
              description: 'List active popups',
              inputSchema: { type: 'object' }
            }
          ]
        });
        break;

      case 'tools/call':
        await this.handleSpecificToolCall(clientId, params, id);
        break;

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private async handleSpecificToolCall(clientId: string, params: any, messageId: string): Promise<void> {
    const client = this.clients.get(clientId)!;
    const { name, arguments: args } = params;

    switch (name) {
      case 'show_popup':
        const popupResult = await this.handleShowPopup(clientId, args);
        this.sendResponse(client.websocket, messageId, popupResult);
        break;

      case 'get_user_response':
        const responseResult = await this.handleGetUserResponse(clientId, args);
        this.sendResponse(client.websocket, messageId, responseResult);
        break;

      case 'close_popup':
        const closeResult = await this.handleClosePopup(clientId, args);
        this.sendResponse(client.websocket, messageId, closeResult);
        break;

      case 'list_active_popups':
        const listResult = await this.handleListActivePopups(clientId, args);
        this.sendResponse(client.websocket, messageId, listResult);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async handleShowPopup(clientId: string, args: any): Promise<{ popupId: string }> {
    const popupId = `popup-${this.generateMessageId()}`;
    const popupConfig: PopupConfig = {
      id: popupId,
      title: args.options.title,
      content: args.options.message,
      buttons: args.options.buttons ? args.options.buttons.map((label: string, index: number) => ({
        id: `btn-${index}`,
        label,
        style: index === 0 ? 'primary' : 'secondary'
      })) : [{ id: 'ok', label: 'OK', style: 'primary' }],
      timeout: args.options.timeout
    };

    this.activePopups.set(popupId, popupConfig);

    // Find appropriate VS Code instance
    const vscodeInstance = this.findVSCodeInstance(args.vscodeInstanceId);
    if (vscodeInstance) {
      // Send popup to VS Code instance
      this.sendMessage(vscodeInstance.websocket, {
        type: 'popup',
        id: popupId,
        payload: popupConfig,
        timestamp: Date.now()
      });
    }

    this.emit('popup_created', { popupId, clientId, config: popupConfig });
    return { popupId };
  }

  private async handleGetUserResponse(clientId: string, args: any): Promise<PopupResponse> {
    const timeout = args.timeout || 30000;
    const popupId = args.popupId;

    if (popupId) {
      // Wait for specific popup response
      return this.waitForPopupResponse(popupId, timeout);
    } else {
      // Wait for any popup response
      return this.waitForAnyPopupResponse(timeout);
    }
  }

  private async handleClosePopup(clientId: string, args: any): Promise<{ closed: string[] }> {
    const closedIds: string[] = [];

    if (args.popupId) {
      // Close specific popup
      if (this.activePopups.has(args.popupId)) {
        this.activePopups.delete(args.popupId);
        closedIds.push(args.popupId);
        this.notifyPopupClosed(args.popupId);
      }
    } else {
      // Close all popups
      const allIds = Array.from(this.activePopups.keys());
      this.activePopups.clear();
      closedIds.push(...allIds);
      allIds.forEach(id => this.notifyPopupClosed(id));
    }

    return { closed: closedIds };
  }

  private async handleListActivePopups(clientId: string, args: any): Promise<{ popups: any[] }> {
    const popups = Array.from(this.activePopups.values()).map(config => ({
      id: config.id,
      title: config.title,
      content: config.content,
      createdAt: Date.now() // Mock creation time
    }));

    return { popups };
  }

  private async handleCustomMessage(clientId: string, message: any): Promise<void> {
    // Handle VS Code responses
    if (message.type === 'response') {
      const response: PopupResponse = message.payload;
      this.popupResponses.set(response.popupId, response);
      this.emit('popup_response', response);
    }
  }

  private waitForPopupResponse(popupId: string, timeout: number): Promise<PopupResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Popup response timeout: ${popupId}`));
      }, timeout);

      const checkResponse = () => {
        const response = this.popupResponses.get(popupId);
        if (response) {
          clearTimeout(timer);
          resolve(response);
          return;
        }
        setTimeout(checkResponse, 100);
      };

      checkResponse();
    });
  }

  private waitForAnyPopupResponse(timeout: number): Promise<PopupResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Popup response timeout'));
      }, timeout);

      const listener = (response: PopupResponse) => {
        clearTimeout(timer);
        this.removeListener('popup_response', listener);
        resolve(response);
      };

      this.on('popup_response', listener);
    });
  }

  private findVSCodeInstance(instanceId?: string): ClientSession | undefined {
    const vscodeInstances = Array.from(this.clients.values())
      .filter(client => client.type === 'vscode_instance');

    if (instanceId) {
      return vscodeInstances.find(instance => instance.id === instanceId);
    }

    // Return first available instance
    return vscodeInstances[0];
  }

  private notifyPopupClosed(popupId: string): void {
    this.clients.forEach((client) => {
      if (client.type === 'vscode_instance') {
        this.sendMessage(client.websocket, {
          type: 'close_popup',
          id: popupId,
          timestamp: Date.now()
        });
      }
    });
  }

  private sendResponse(websocket: WebSocket, id: string, result: any): void {
    const response = {
      jsonrpc: '2.0',
      id,
      result
    };
    this.sendMessage(websocket, response);
  }

  private sendErrorResponse(websocket: WebSocket, id: string, error: any): void {
    const response = {
      jsonrpc: '2.0',
      id,
      error: {
        code: -1,
        message: error.message || 'Unknown error',
        data: error
      }
    };
    this.sendMessage(websocket, response);
  }

  private sendMessage(websocket: WebSocket, message: any): void {
    if (websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify(message));
    }
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg-${++this.messageId}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public methods for testing
  getConnectedClients(): ClientSession[] {
    return Array.from(this.clients.values());
  }

  getActivePopups(): PopupConfig[] {
    return Array.from(this.activePopups.values());
  }

  simulateUserResponse(popupId: string, response: PopupResponse): void {
    this.popupResponses.set(popupId, response);
    this.emit('popup_response', response);
  }

  getServerStats(): {
    running: boolean;
    port: number;
    clientCount: number;
    activePopups: number;
    aiClients: number;
    vscodeInstances: number;
  } {
    const clients = Array.from(this.clients.values());
    return {
      running: this.isRunning,
      port: this.port,
      clientCount: clients.length,
      activePopups: this.activePopups.size,
      aiClients: clients.filter(c => c.type === 'ai_client').length,
      vscodeInstances: clients.filter(c => c.type === 'vscode_instance').length
    };
  }

  // Cleanup
  dispose(): void {
    this.stop();
    this.removeAllListeners();
    this.clients.clear();
    this.activePopups.clear();
    this.popupResponses.clear();
  }
}