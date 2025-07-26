import { EventEmitter } from 'events';
import { PopupConfig, PopupResponse } from '../../src/types';

export interface MockVSCodeInstanceOptions {
  instanceId?: string;
  autoRespond?: boolean;
  responseDelay?: number;
  defaultResponse?: PopupResponse;
}

/**
 * Mock VS Code instance for testing
 * Simulates a VS Code extension responding to popup requests
 */
export class MockVSCodeInstance extends EventEmitter {
  private instanceId: string;
  private autoRespond: boolean;
  private responseDelay: number;
  private defaultResponse?: PopupResponse;
  private activePopups = new Map<string, PopupConfig>();
  private popupResponses = new Map<string, PopupResponse>();

  constructor(options: MockVSCodeInstanceOptions = {}) {
    super();
    this.instanceId = options.instanceId || `mock-vscode-${Date.now()}`;
    this.autoRespond = options.autoRespond ?? false;
    this.responseDelay = options.responseDelay || 1000;
    this.defaultResponse = options.defaultResponse;
  }

  /**
   * Simulate receiving a popup request
   */
  async receivePopupRequest(config: PopupConfig): Promise<string> {
    this.activePopups.set(config.id, config);
    this.emit('popup_received', config);

    // Auto-respond if enabled
    if (this.autoRespond) {
      setTimeout(() => {
        this.respondToPopup(config.id, this.createDefaultResponse(config));
      }, this.responseDelay);
    }

    return config.id;
  }

  /**
   * Manually respond to a popup
   */
  respondToPopup(popupId: string, response: PopupResponse): void {
    const popup = this.activePopups.get(popupId);
    if (!popup) {
      throw new Error(`Popup ${popupId} not found`);
    }

    this.popupResponses.set(popupId, response);
    this.activePopups.delete(popupId);
    this.emit('popup_response', response);
  }

  /**
   * Simulate user clicking a button
   */
  simulateButtonClick(popupId: string, buttonId: string, customData?: any): void {
    const response: PopupResponse = {
      popupId,
      buttonId,
      customData,
      timestamp: Date.now(),
      dismissed: false
    };

    this.respondToPopup(popupId, response);
  }

  /**
   * Simulate user dismissing a popup
   */
  simulateDismiss(popupId: string): void {
    const response: PopupResponse = {
      popupId,
      timestamp: Date.now(),
      dismissed: true
    };

    this.respondToPopup(popupId, response);
  }

  /**
   * Simulate popup timeout
   */
  simulateTimeout(popupId: string): void {
    const response: PopupResponse = {
      popupId,
      timestamp: Date.now(),
      dismissed: true
    };

    this.respondToPopup(popupId, response);
  }

  /**
   * Close a specific popup
   */
  closePopup(popupId: string): boolean {
    if (this.activePopups.has(popupId)) {
      this.activePopups.delete(popupId);
      this.emit('popup_closed', popupId);
      return true;
    }
    return false;
  }

  /**
   * Close all popups
   */
  closeAllPopups(): string[] {
    const closedIds = Array.from(this.activePopups.keys());
    this.activePopups.clear();
    
    closedIds.forEach(id => {
      this.emit('popup_closed', id);
    });

    return closedIds;
  }

  /**
   * Get active popups
   */
  getActivePopups(): PopupConfig[] {
    return Array.from(this.activePopups.values());
  }

  /**
   * Get popup response history
   */
  getPopupResponse(popupId: string): PopupResponse | undefined {
    return this.popupResponses.get(popupId);
  }

  /**
   * Get all popup responses
   */
  getAllPopupResponses(): PopupResponse[] {
    return Array.from(this.popupResponses.values());
  }

  /**
   * Simulate connection issues
   */
  simulateConnectionLoss(): void {
    this.emit('connection_lost');
  }

  simulateConnectionRestore(): void {
    this.emit('connection_restored');
  }

  /**
   * Simulate VS Code being busy or unresponsive
   */
  simulateUnresponsive(duration: number): void {
    this.autoRespond = false;
    setTimeout(() => {
      this.autoRespond = true;
    }, duration);
  }

  /**
   * Configure response behavior
   */
  setAutoRespond(enabled: boolean, delay?: number, defaultResponse?: PopupResponse): void {
    this.autoRespond = enabled;
    if (delay !== undefined) this.responseDelay = delay;
    if (defaultResponse) this.defaultResponse = defaultResponse;
  }

  /**
   * Simulate multiple concurrent users
   */
  simulateMultipleUsers(popupIds: string[], responses: Partial<PopupResponse>[]): void {
    popupIds.forEach((popupId, index) => {
      const delay = Math.random() * 2000; // Random delay up to 2 seconds
      setTimeout(() => {
        const response = {
          popupId,
          timestamp: Date.now(),
          ...responses[index % responses.length]
        } as PopupResponse;
        
        this.respondToPopup(popupId, response);
      }, delay);
    });
  }

  /**
   * Create a default response for a popup
   */
  private createDefaultResponse(config: PopupConfig): PopupResponse {
    if (this.defaultResponse) {
      return {
        ...this.defaultResponse,
        popupId: config.id,
        timestamp: Date.now()
      };
    }

    // Choose first button or default behavior
    const buttonId = config.buttons?.[0]?.id || 'ok';
    
    return {
      popupId: config.id,
      buttonId,
      timestamp: Date.now(),
      dismissed: false
    };
  }

  // Getters
  get id(): string {
    return this.instanceId;
  }

  get activePopupCount(): number {
    return this.activePopups.size;
  }

  get responseCount(): number {
    return this.popupResponses.size;
  }

  // Test utilities
  getState(): {
    instanceId: string;
    activePopups: number;
    totalResponses: number;
    autoRespond: boolean;
    responseDelay: number;
  } {
    return {
      instanceId: this.instanceId,
      activePopups: this.activePopups.size,
      totalResponses: this.popupResponses.size,
      autoRespond: this.autoRespond,
      responseDelay: this.responseDelay
    };
  }

  // Reset state for testing
  reset(): void {
    this.activePopups.clear();
    this.popupResponses.clear();
    this.removeAllListeners();
  }

  // Cleanup
  dispose(): void {
    this.reset();
  }
}