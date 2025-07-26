import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface MockAIClientOptions {
  clientId?: string;
  serverUrl?: string;
  autoConnect?: boolean;
  responseDelay?: number;
}

export interface MCPToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface MCPResponse {
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Mock AI client for testing MCP communication
 * Simulates an AI client connecting to the MCP server
 */
export class MockAIClient extends EventEmitter {
  private clientId: string;
  private serverUrl: string;
  private autoConnect: boolean;
  private responseDelay: number;
  private websocket?: WebSocket;
  private isConnected = false;
  private messageId = 0;
  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

  constructor(options: MockAIClientOptions = {}) {
    super();
    this.clientId = options.clientId || `mock-ai-client-${Date.now()}`;
    this.serverUrl = options.serverUrl || 'ws://localhost:8080';
    this.autoConnect = options.autoConnect ?? true;
    this.responseDelay = options.responseDelay || 100;

    if (this.autoConnect) {
      this.connect();
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(this.serverUrl);
        
        // Track WebSocket for cleanup
        if (global.testWebSockets) {
          global.testWebSockets.push(this.websocket);
        }

        this.websocket.on('open', () => {
          this.isConnected = true;
          this.emit('connected');
          resolve();
        });

        this.websocket.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            this.emit('error', new Error(`Failed to parse message: ${error}`));
          }
        });

        this.websocket.on('close', () => {
          this.isConnected = false;
          this.emit('disconnected');
        });

        this.websocket.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Connection timeout'));
          }
        }, 5000);

      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.websocket && this.isConnected) {
      this.websocket.close();
      this.isConnected = false;
    }
  }

  /**
   * Call an MCP tool
   */
  async callTool(name: string, args: any = {}): Promise<any> {
    if (!this.isConnected || !this.websocket) {
      throw new Error('Not connected to MCP server');
    }

    const id = this.generateMessageId();
    const message = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Add timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Tool call timeout: ${name}`));
        }
      }, 10000);

      this.websocket!.send(JSON.stringify(message));
    });
  }

  /**
   * Show a popup in VS Code
   */
  async showPopup(options: {
    vscodeInstanceId?: string;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'question' | 'input';
    buttons?: string[];
    defaultButton?: string;
    timeout?: number;
    modal?: boolean;
    inputPlaceholder?: string;
  }): Promise<{ popupId: string }> {
    return this.callTool('show_popup', { options });
  }

  /**
   * Wait for user response from a popup
   */
  async getUserResponse(popupId?: string, timeout?: number): Promise<any> {
    return this.callTool('get_user_response', { popupId, timeout });
  }

  /**
   * Close popups
   */
  async closePopup(popupId?: string, vscodeInstanceId?: string): Promise<{ closed: string[] }> {
    return this.callTool('close_popup', { popupId, vscodeInstanceId });
  }

  /**
   * List active popups
   */
  async listActivePopups(vscodeInstanceId?: string): Promise<{ popups: any[] }> {
    return this.callTool('list_active_popups', { vscodeInstanceId });
  }

  /**
   * Simulate a complex interaction scenario
   */
  async simulateConversation(steps: Array<{
    type: 'show_popup' | 'get_response' | 'close_popup' | 'delay';
    data?: any;
    expectedResponse?: any;
  }>): Promise<any[]> {
    const results = [];

    for (const step of steps) {
      await this.delay(this.responseDelay);

      switch (step.type) {
        case 'show_popup':
          const popupResult = await this.showPopup(step.data);
          results.push(popupResult);
          break;

        case 'get_response':
          const responseResult = await this.getUserResponse(step.data?.popupId, step.data?.timeout);
          results.push(responseResult);
          break;

        case 'close_popup':
          const closeResult = await this.closePopup(step.data?.popupId, step.data?.vscodeInstanceId);
          results.push(closeResult);
          break;

        case 'delay':
          await this.delay(step.data?.duration || 1000);
          break;
      }
    }

    return results;
  }

  /**
   * Generate test scenarios for stress testing
   */
  async generateConcurrentPopups(count: number, options: any = {}): Promise<string[]> {
    const promises = [];
    
    for (let i = 0; i < count; i++) {
      const popupOptions = {
        title: `Test Popup ${i + 1}`,
        message: `This is test popup number ${i + 1}`,
        type: 'info' as const,
        buttons: ['OK', 'Cancel'],
        ...options
      };

      promises.push(this.showPopup(popupOptions));
    }

    const results = await Promise.all(promises);
    return results.map(result => result.popupId);
  }

  private handleMessage(message: any): void {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(`MCP Error: ${message.error.message}`));
      } else {
        resolve(message.result);
      }
    } else {
      // Handle notifications or other messages
      this.emit('message', message);
    }
  }

  private generateMessageId(): string {
    return `${this.clientId}-${++this.messageId}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Getters
  get connected(): boolean {
    return this.isConnected;
  }

  get id(): string {
    return this.clientId;
  }

  // Test utilities
  getConnectionState(): {
    connected: boolean;
    pendingRequests: number;
    clientId: string;
  } {
    return {
      connected: this.isConnected,
      pendingRequests: this.pendingRequests.size,
      clientId: this.clientId
    };
  }

  // Cleanup
  dispose(): void {
    this.disconnect();
    this.removeAllListeners();
    this.pendingRequests.clear();
  }
}