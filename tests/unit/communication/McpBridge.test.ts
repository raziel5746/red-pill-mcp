import { McpBridge } from '../../../src/communication/McpBridge';
import { ConfigManager } from '../../../src/managers/ConfigManager';
import { TestUtils } from '../../setup';
import { MockMCPServer } from '../../mocks/MockMCPServer';
import { ExtensionState } from '../../../src/types';

describe('McpBridge', () => {
  let mcpBridge: McpBridge;
  let mockConfigManager: ConfigManager;
  let mockState: ExtensionState;
  let mockLogger: any;
  let mockServer: MockMCPServer;

  beforeEach(async () => {
    mockConfigManager = new ConfigManager();
    mockState = {
      isConnected: false,
      activePopups: new Map()
    };
    mockLogger = TestUtils.createMockLogger();
    
    // Start mock server on different port to avoid conflicts
    mockServer = new MockMCPServer({ port: 8081 });
    await mockServer.start();
    
    // Mock config to use test server
    jest.spyOn(mockConfigManager, 'getConfig').mockReturnValue({
      mcpServerUrl: 'ws://localhost:8081',
      autoConnect: false,
      popupTimeout: 30000,
      maxConcurrentPopups: 3,
      logLevel: 'info'
    });

    jest.spyOn(mockConfigManager, 'validateConfig').mockReturnValue({
      valid: true,
      errors: []
    });

    mcpBridge = new McpBridge(mockConfigManager, mockState, mockLogger);
  });

  afterEach(async () => {
    if (mcpBridge) {
      await mcpBridge.disconnect();
    }
    if (mockServer) {
      await mockServer.stop();
    }
  });

  describe('connection management', () => {
    it('should connect to MCP server successfully', async () => {
      await mcpBridge.connect();
      
      expect(mockState.isConnected).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Connected to MCP server');
    });

    it('should not connect if already connected', async () => {
      await mcpBridge.connect();
      const connectSpy = jest.spyOn(mockLogger, 'warn');
      
      await mcpBridge.connect();
      
      expect(connectSpy).toHaveBeenCalledWith('Already connected to MCP server');
    });

    it('should disconnect gracefully', async () => {
      await mcpBridge.connect();
      
      await mcpBridge.disconnect();
      
      expect(mockState.isConnected).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Disconnected from MCP server');
    });

    it('should handle connection timeout', async () => {
      // Stop the server to simulate timeout
      await mockServer.stop();
      
      await expect(mcpBridge.connect()).rejects.toThrow();
      expect(mockState.isConnected).toBe(false);
    });

    it('should reconnect when requested', async () => {
      await mcpBridge.connect();
      expect(mockState.isConnected).toBe(true);
      
      await mcpBridge.reconnect();
      
      expect(mockState.isConnected).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Reconnecting to MCP server...');
    });

    it('should handle invalid configuration', async () => {
      jest.spyOn(mockConfigManager, 'validateConfig').mockReturnValue({
        valid: false,
        errors: ['Invalid URL']
      });

      await expect(mcpBridge.connect()).rejects.toThrow('Invalid configuration: Invalid URL');
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      await mcpBridge.connect();
    });

    it('should handle popup messages', async () => {
      const popupRequestCallback = jest.fn();
      mcpBridge.onPopupRequest(popupRequestCallback);

      const popupConfig = TestUtils.createMockPopupConfig();
      
      // Simulate incoming popup message from server
      const mockMessage = {
        type: 'popup',
        id: 'test-message-1',
        payload: popupConfig,
        timestamp: Date.now()
      };

      // Access private method for testing
      (mcpBridge as any).handleMessage(mockMessage);

      expect(popupRequestCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: popupConfig.id,
          title: popupConfig.title,
          content: popupConfig.content
        })
      );
    });

    it('should validate popup config in messages', () => {
      const mockMessage = {
        type: 'popup',
        id: 'test-message-1',
        payload: {
          id: 'invalid-popup',
          title: '',
          content: ''
        },
        timestamp: Date.now()
      };

      // This should trigger error handling
      (mcpBridge as any).handleMessage(mockMessage);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to handle popup message:',
        expect.any(Error)
      );
    });

    it('should handle status messages', () => {
      const statusPayload = { status: 'connected', client: 'test' };
      const mockMessage = {
        type: 'status',
        id: 'status-1',
        payload: statusPayload,
        timestamp: Date.now()
      };

      (mcpBridge as any).handleMessage(mockMessage);

      expect(mockLogger.info).toHaveBeenCalledWith('Received status message:', statusPayload);
    });

    it('should handle error messages', () => {
      const errorPayload = { error: 'Test error', details: 'Error details' };
      const mockMessage = {
        type: 'error',
        id: 'error-1',
        payload: errorPayload,
        timestamp: Date.now()
      };

      (mcpBridge as any).handleMessage(mockMessage);

      expect(mockLogger.error).toHaveBeenCalledWith('Received error from MCP server:', errorPayload);
      expect(mockState.lastError).toBe('Test error');
    });

    it('should handle unknown message types', () => {
      const mockMessage = {
        type: 'unknown',
        id: 'unknown-1',
        payload: {},
        timestamp: Date.now()
      };

      (mcpBridge as any).handleMessage(mockMessage);

      expect(mockLogger.warn).toHaveBeenCalledWith('Unknown message type:', 'unknown');
    });

    it('should parse messages correctly', () => {
      const validMessage = {
        type: 'status',
        id: 'test-1',
        payload: { test: 'data' },
        timestamp: Date.now()
      };

      const result = (mcpBridge as any).parseMessage(JSON.stringify(validMessage));

      expect(result).toEqual(validMessage);
    });

    it('should reject invalid message format', () => {
      const invalidMessage = { type: 'status' }; // Missing required fields

      expect(() => {
        (mcpBridge as any).parseMessage(JSON.stringify(invalidMessage));
      }).toThrow('Invalid message format');
    });
  });

  describe('response sending', () => {
    beforeEach(async () => {
      await mcpBridge.connect();
    });

    it('should send popup responses', () => {
      const response = {
        popupId: 'test-popup',
        buttonId: 'ok',
        timestamp: Date.now(),
        dismissed: false
      };

      mcpBridge.sendResponse(response);

      expect(mockLogger.debug).toHaveBeenCalledWith('Response sent:', response);
    });

    it('should handle sending response when not connected', () => {
      mockState.isConnected = false;

      const response = {
        popupId: 'test-popup',
        buttonId: 'ok',
        timestamp: Date.now(),
        dismissed: false
      };

      mcpBridge.sendResponse(response);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cannot send response: not connected to MCP server'
      );
    });

    it('should send handshake message on connection', async () => {
      // Disconnect first
      await mcpBridge.disconnect();
      
      // Reconnect to trigger handshake
      await mcpBridge.connect();

      expect(mockLogger.info).toHaveBeenCalledWith('Handshake sent');
    });
  });

  describe('heartbeat mechanism', () => {
    it('should start heartbeat after connection', async () => {
      await mcpBridge.connect();
      
      // Wait for heartbeat interval
      await TestUtils.delay(31000);

      expect(mockLogger.debug).toHaveBeenCalledWith('Heartbeat ping sent');
    }, 35000);

    it('should stop heartbeat on disconnection', async () => {
      await mcpBridge.connect();
      await mcpBridge.disconnect();

      // Heartbeat should not be active anymore
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('reconnection logic', () => {
    it('should attempt reconnection on unexpected disconnect', async () => {
      await mcpBridge.connect();
      
      // Simulate server disconnect
      await mockServer.stop();
      
      // Wait for reconnection attempts
      await TestUtils.delay(2000);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting reconnection')
      );
    });

    it('should not reconnect on clean disconnect', async () => {
      await mcpBridge.connect();
      await mcpBridge.disconnect();

      // Should not attempt reconnection
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Attempting reconnection')
      );
    });

    it('should limit reconnection attempts', async () => {
      await mcpBridge.connect();
      
      // Simulate persistent connection failure
      await mockServer.stop();
      
      // Wait for all reconnection attempts
      await TestUtils.delay(10000);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Max reconnection attempts')
      );
    }, 15000);
  });

  describe('event emission', () => {
    it('should emit connected event', async () => {
      const connectedHandler = jest.fn();
      mcpBridge.on('connected', connectedHandler);

      await mcpBridge.connect();

      expect(connectedHandler).toHaveBeenCalled();
    });

    it('should emit disconnected event', async () => {
      const disconnectedHandler = jest.fn();
      mcpBridge.on('disconnected', disconnectedHandler);

      await mcpBridge.connect();
      await mcpBridge.disconnect();

      expect(disconnectedHandler).toHaveBeenCalled();
    });

    it('should emit error events', async () => {
      const errorHandler = jest.fn();
      mcpBridge.on('error', errorHandler);

      // Trigger connection to non-existent server
      jest.spyOn(mockConfigManager, 'getConfig').mockReturnValue({
        mcpServerUrl: 'ws://localhost:9999', // Non-existent server
        autoConnect: false,
        popupTimeout: 30000,
        maxConcurrentPopups: 3,
        logLevel: 'info'
      });

      try {
        await mcpBridge.connect();
      } catch (error) {
        // Expected to fail
      }

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('disposal', () => {
    it('should clean up resources on disposal', async () => {
      await mcpBridge.connect();
      
      mcpBridge.dispose();

      expect(mockState.isConnected).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Disposing MCP bridge...');
    });

    it('should remove all listeners on disposal', async () => {
      const removeAllListenersSpy = jest.spyOn(mcpBridge, 'removeAllListeners');
      
      mcpBridge.dispose();

      expect(removeAllListenersSpy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle WebSocket errors gracefully', async () => {
      await mcpBridge.connect();
      
      // Simulate WebSocket error
      const websocket = (mcpBridge as any).websocket;
      websocket.emit('error', new Error('Test WebSocket error'));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'WebSocket error:',
        expect.any(Error)
      );
    });

    it('should handle malformed messages', async () => {
      await mcpBridge.connect();
      
      const websocket = (mcpBridge as any).websocket;
      websocket.emit('message', 'invalid json');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process message:',
        expect.any(Error)
      );
    });
  });
});