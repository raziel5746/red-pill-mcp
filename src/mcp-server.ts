// Simplified MCP Server for the extension
import WebSocket from 'ws';
import { Logger } from './utils/Logger';

export interface MCPServerConfig {
  port: number;
  host?: string;
  maxConnections?: number;
}

export class MCPServer {
  private server: WebSocket.Server | null = null;
  private connections: Set<WebSocket> = new Set();
  private logger: Logger;
  private config: MCPServerConfig;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.logger = new Logger('MCPServer');
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = new WebSocket.Server({
          port: this.config.port,
          host: this.config.host || 'localhost'
        });

        this.server.on('listening', () => {
          this.logger.info(`MCP Server started on port ${this.config.port}`);
          resolve();
        });

        this.server.on('connection', (ws) => {
          this.handleConnection(ws);
        });

        this.server.on('error', (error) => {
          this.logger.error('Server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleConnection(ws: WebSocket): void {
    this.connections.add(ws);
    this.logger.info(`New connection established. Total: ${this.connections.size}`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        this.logger.error('Failed to parse message:', error);
      }
    });

    ws.on('close', () => {
      this.connections.delete(ws);
      this.logger.info(`Connection closed. Total: ${this.connections.size}`);
    });

    ws.on('error', (error) => {
      this.logger.error('WebSocket error:', error);
    });
  }

  private handleMessage(ws: WebSocket, message: any): void {
    // Handle MCP protocol messages
    if (message.method === 'tools/call') {
      this.handleToolCall(ws, message);
    } else if (message.method === 'initialize') {
      this.handleInitialize(ws, message);
    }
  }

  private handleToolCall(ws: WebSocket, message: any): void {
    const { name, arguments: args } = message.params;
    
    if (name === 'show_popup') {
      // Send popup request to VS Code extension
      const response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{
            type: 'text',
            text: `Popup displayed: ${args.title}`
          }]
        }
      };
      ws.send(JSON.stringify(response));
    }
  }

  private handleInitialize(ws: WebSocket, message: any): void {
    const response = {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: 'red-pill-mcp',
          version: '1.0.0'
        }
      }
    };
    ws.send(JSON.stringify(response));
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('MCP Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}