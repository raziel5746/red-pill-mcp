import { PopupManager } from '../../../src/managers/PopupManager';
import { TestUtils } from '../../setup';
import { TestDataGenerators } from '../../fixtures/TestScenarios';
import { ExtensionState } from '../../../src/types';

describe('PopupManager', () => {
  let popupManager: PopupManager;
  let mockContext: any;
  let mockState: ExtensionState;
  let mockLogger: any;

  beforeEach(() => {
    mockContext = TestUtils.createMockExtensionContext();
    mockState = {
      isConnected: true,
      activePopups: new Map()
    };
    mockLogger = TestUtils.createMockLogger();
    
    popupManager = new PopupManager(mockContext, mockState, mockLogger);
  });

  afterEach(() => {
    popupManager.dispose();
  });

  describe('createPopup', () => {
    it('should create a popup with valid configuration', async () => {
      const config = TestUtils.createMockPopupConfig();
      
      const popupId = await popupManager.createPopup(config);
      
      expect(popupId).toBe(config.id);
      expect(mockState.activePopups.has(config.id)).toBe(true);
      expect(global.vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'redPillMcpPopup',
        config.title,
        global.vscode.ViewColumn.One,
        expect.any(Object)
      );
    });

    it('should generate unique ID if not provided', async () => {
      const config = TestUtils.createMockPopupConfig({ id: undefined } as any);
      
      const popupId = await popupManager.createPopup(config);
      
      expect(popupId).toBeDefined();
      expect(typeof popupId).toBe('string');
      expect(mockState.activePopups.has(popupId)).toBe(true);
    });

    it('should reject if popup ID already exists', async () => {
      const config = TestUtils.createMockPopupConfig();
      await popupManager.createPopup(config);
      
      await expect(popupManager.createPopup(config)).rejects.toThrow(
        `Popup with ID ${config.id} already exists`
      );
    });

    it('should respect maximum concurrent popups limit', async () => {
      // Mock configuration to return a low limit
      global.vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'maxConcurrentPopups') return 2;
          return 30000; // default timeout
        })
      });

      // Create maximum allowed popups
      const config1 = TestUtils.createMockPopupConfig({ id: 'popup1' });
      const config2 = TestUtils.createMockPopupConfig({ id: 'popup2' });
      const config3 = TestUtils.createMockPopupConfig({ id: 'popup3' });

      await popupManager.createPopup(config1);
      await popupManager.createPopup(config2);
      
      await expect(popupManager.createPopup(config3)).rejects.toThrow(
        'Maximum concurrent popups (2) reached'
      );
    });

    it('should set up timeout when specified', async () => {
      const config = TestUtils.createMockPopupConfig({ timeout: 5000 });
      
      await popupManager.createPopup(config);
      
      const instance = mockState.activePopups.get(config.id);
      expect(instance).toBeDefined();
      expect(instance!.timeoutId).toBeDefined();
    });

    it('should set up webview message handlers', async () => {
      const config = TestUtils.createMockPopupConfig();
      
      await popupManager.createPopup(config);
      
      const mockWebviewPanel = global.vscode.window.createWebviewPanel();
      expect(mockWebviewPanel.webview.onDidReceiveMessage).toHaveBeenCalled();
      expect(mockWebviewPanel.onDidDispose).toHaveBeenCalled();
    });
  });

  describe('closePopup', () => {
    it('should close existing popup', async () => {
      const config = TestUtils.createMockPopupConfig();
      await popupManager.createPopup(config);
      
      popupManager.closePopup(config.id);
      
      expect(mockState.activePopups.has(config.id)).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(`Popup closed: ${config.id}`);
    });

    it('should handle closing non-existent popup gracefully', () => {
      popupManager.closePopup('non-existent');
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempt to close non-existent popup: non-existent'
      );
    });

    it('should send response when provided', async () => {
      const config = TestUtils.createMockPopupConfig();
      await popupManager.createPopup(config);
      
      const response = TestDataGenerators.createPopupResponse(config.id);
      const mockCallback = jest.fn();
      popupManager.onPopupResponse(mockCallback);
      
      popupManager.closePopup(config.id, response);
      
      expect(mockCallback).toHaveBeenCalledWith(response);
    });

    it('should clear timeout when closing popup', async () => {
      const config = TestUtils.createMockPopupConfig({ timeout: 5000 });
      await popupManager.createPopup(config);
      
      const instance = mockState.activePopups.get(config.id);
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      
      popupManager.closePopup(config.id);
      
      expect(clearTimeoutSpy).toHaveBeenCalledWith(instance!.timeoutId);
    });
  });

  describe('clearAllPopups', () => {
    it('should close all active popups', async () => {
      const configs = TestDataGenerators.createBatchPopupConfigs(3);
      
      for (const config of configs) {
        await popupManager.createPopup(config);
      }
      
      popupManager.clearAllPopups();
      
      expect(mockState.activePopups.size).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('Cleared 3 popups');
    });

    it('should send dismissal responses for all popups', async () => {
      const configs = TestDataGenerators.createBatchPopupConfigs(2);
      const mockCallback = jest.fn();
      popupManager.onPopupResponse(mockCallback);
      
      for (const config of configs) {
        await popupManager.createPopup(config);
      }
      
      popupManager.clearAllPopups();
      
      expect(mockCallback).toHaveBeenCalledTimes(2);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          dismissed: true
        })
      );
    });
  });

  describe('getActivePopups', () => {
    it('should return list of active popup instances', async () => {
      const configs = TestDataGenerators.createBatchPopupConfigs(3);
      
      for (const config of configs) {
        await popupManager.createPopup(config);
      }
      
      const activePopups = popupManager.getActivePopups();
      
      expect(activePopups).toHaveLength(3);
      expect(activePopups[0]).toHaveProperty('config');
      expect(activePopups[0]).toHaveProperty('webviewPanel');
      expect(activePopups[0]).toHaveProperty('createdAt');
    });

    it('should return empty array when no popups active', () => {
      const activePopups = popupManager.getActivePopups();
      expect(activePopups).toHaveLength(0);
    });
  });

  describe('webview message handling', () => {
    it('should handle button click messages', async () => {
      const config = TestUtils.createMockPopupConfig();
      const mockCallback = jest.fn();
      popupManager.onPopupResponse(mockCallback);
      
      await popupManager.createPopup(config);
      
      // Simulate webview message
      const mockWebviewPanel = global.vscode.window.createWebviewPanel();
      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      
      const buttonMessage = {
        type: 'button_click',
        buttonId: 'ok',
        data: { userInput: 'test' }
      };
      
      messageHandler(buttonMessage);
      
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          popupId: config.id,
          buttonId: 'ok',
          customData: { userInput: 'test' },
          dismissed: false
        })
      );
    });

    it('should handle dismiss messages', async () => {
      const config = TestUtils.createMockPopupConfig();
      const mockCallback = jest.fn();
      popupManager.onPopupResponse(mockCallback);
      
      await popupManager.createPopup(config);
      
      const mockWebviewPanel = global.vscode.window.createWebviewPanel();
      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      
      const dismissMessage = {
        type: 'dismiss'
      };
      
      messageHandler(dismissMessage);
      
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          popupId: config.id,
          dismissed: true
        })
      );
    });

    it('should close popup after sending response', async () => {
      const config = TestUtils.createMockPopupConfig();
      await popupManager.createPopup(config);
      
      const mockWebviewPanel = global.vscode.window.createWebviewPanel();
      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      
      messageHandler({ type: 'button_click', buttonId: 'ok' });
      
      expect(mockState.activePopups.has(config.id)).toBe(false);
    });
  });

  describe('timeout handling', () => {
    it('should handle popup timeout', async () => {
      const config = TestUtils.createMockPopupConfig({ timeout: 100 });
      const mockCallback = jest.fn();
      popupManager.onPopupResponse(mockCallback);
      
      await popupManager.createPopup(config);
      
      // Wait for timeout
      await TestUtils.delay(150);
      
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          popupId: config.id,
          dismissed: true
        })
      );
      expect(mockState.activePopups.has(config.id)).toBe(false);
    });

    it('should not timeout if no timeout specified', async () => {
      const config = TestUtils.createMockPopupConfig({ timeout: undefined });
      await popupManager.createPopup(config);
      
      const instance = mockState.activePopups.get(config.id);
      expect(instance!.timeoutId).toBeUndefined();
    });
  });

  describe('disposal', () => {
    it('should clean up all popups on disposal', async () => {
      const configs = TestDataGenerators.createBatchPopupConfigs(3);
      
      for (const config of configs) {
        await popupManager.createPopup(config);
      }
      
      popupManager.dispose();
      
      expect(mockState.activePopups.size).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('Disposing popup manager...');
    });
  });

  describe('edge cases', () => {
    it('should handle webview disposal', async () => {
      const config = TestUtils.createMockPopupConfig();
      await popupManager.createPopup(config);
      
      const mockWebviewPanel = global.vscode.window.createWebviewPanel();
      const disposeHandler = mockWebviewPanel.onDidDispose.mock.calls[0][0];
      
      disposeHandler();
      
      expect(mockState.activePopups.has(config.id)).toBe(false);
    });

    it('should handle errors in webview message processing', async () => {
      const config = TestUtils.createMockPopupConfig();
      await popupManager.createPopup(config);
      
      const mockWebviewPanel = global.vscode.window.createWebviewPanel();
      const messageHandler = mockWebviewPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      
      // Send malformed message
      messageHandler(null);
      
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});