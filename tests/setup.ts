// Global test setup
import { jest } from '@jest/globals';
import WebSocket from 'ws';

// Set test timeout to 30 seconds for complex integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
const originalConsole = global.console;

beforeAll(() => {
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as any;

  // Mock VS Code API globally
  mockVSCodeAPI();
});

afterAll(() => {
  global.console = originalConsole;
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  // Clean up any open WebSocket connections
  if (global.testWebSockets) {
    global.testWebSockets.forEach((ws: WebSocket) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    global.testWebSockets = [];
  }
});

// Mock VS Code API for testing
function mockVSCodeAPI() {
  const mockWebviewPanel = {
    webview: {
      html: '',
      onDidReceiveMessage: jest.fn(),
      asWebviewUri: jest.fn((uri) => uri),
      cspSource: 'vscode-webview:'
    },
    onDidDispose: jest.fn(),
    dispose: jest.fn(),
    disposed: false
  };

  const mockWorkspace = {
    getConfiguration: jest.fn().mockReturnValue({
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: any = {
          'maxConcurrentPopups': 3,
          'popupTimeout': 30000,
          'mcpServerUrl': 'ws://localhost:8080',
          'autoConnect': true,
          'logLevel': 'info'
        };
        return config[key] ?? defaultValue;
      }),
      update: jest.fn()
    }),
    onDidChangeConfiguration: jest.fn()
  };

  const mockWindow = {
    createWebviewPanel: jest.fn().mockReturnValue(mockWebviewPanel),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn()
  };

  const mockCommands = {
    registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() })
  };

  const mockUri = {
    joinPath: jest.fn((...paths) => ({ path: paths.join('/') })),
    file: jest.fn((path) => ({ path }))
  };

  // Assign mocks to global vscode object
  (global as any).vscode = {
    workspace: mockWorkspace,
    window: mockWindow,
    commands: mockCommands,
    Uri: mockUri,
    ViewColumn: { One: 1 },
    ExtensionContext: class MockExtensionContext {
      extensionUri = { path: '/mock/extension/path' };
      subscriptions: any[] = [];
    }
  };

  // Initialize test WebSocket tracking
  (global as any).testWebSockets = [];
}

// Test utility functions
export const TestUtils = {
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  createMockPopupConfig: (overrides: any = {}) => ({
    id: `test-popup-${Date.now()}`,
    title: 'Test Popup',
    content: 'This is a test popup',
    buttons: [
      { id: 'ok', label: 'OK', style: 'primary' as const },
      { id: 'cancel', label: 'Cancel', style: 'secondary' as const }
    ],
    timeout: 30000,
    ...overrides
  }),

  createMockExtensionContext: () => new (global as any).vscode.ExtensionContext(),

  createMockLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }),

  waitForEvent: (emitter: any, eventName: string, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Event '${eventName}' not emitted within ${timeout}ms`));
      }, timeout);

      emitter.once(eventName, (data: any) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }
};

// Export both the mock and TestUtils for CommonJS/ES modules
module.exports = (global as any).vscode;
export * from './setup';

// Global type augmentation for test utilities
declare global {
  var testWebSockets: WebSocket[];
  var vscode: any;
}