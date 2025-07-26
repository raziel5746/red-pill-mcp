export interface PopupConfig {
  id: string;
  title: string;
  content: string;
  buttons?: PopupButton[];
  timeout?: number;
  priority?: 'low' | 'medium' | 'high';
  metadata?: Record<string, any>;
}

export interface PopupButton {
  id: string;
  label: string;
  style?: 'primary' | 'secondary' | 'danger';
  action?: string;
}

export interface PopupResponse {
  popupId: string;
  buttonId?: string;
  customData?: any;
  timestamp: number;
  dismissed?: boolean;
}

export interface McpMessage {
  type: 'popup' | 'response' | 'status' | 'error';
  id: string;
  payload: any;
  timestamp: number;
}

export interface ExtensionState {
  isConnected: boolean;
  activePopups: Map<string, PopupInstance>;
  mcpConnection?: any;
  lastError?: string;
}

export interface PopupInstance {
  config: PopupConfig;
  webviewPanel: any;
  createdAt: number;
  timeoutId?: NodeJS.Timeout;
}

export interface LogLevel {
  DEBUG: 'debug';
  INFO: 'info';
  WARN: 'warn';
  ERROR: 'error';
}

export interface ExtensionConfig {
  mcpServerUrl: string;
  autoConnect: boolean;
  popupTimeout: number;
  maxConcurrentPopups: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}