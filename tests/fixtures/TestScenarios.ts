import { PopupConfig, PopupResponse } from '../../src/types';

/**
 * Test scenarios and fixtures for comprehensive testing
 */
export class TestScenarios {
  
  /**
   * Basic popup configurations for testing
   */
  static readonly POPUP_CONFIGS = {
    SIMPLE_INFO: {
      id: 'simple-info',
      title: 'Information',
      content: 'This is a simple information popup',
      buttons: [
        { id: 'ok', label: 'OK', style: 'primary' as const }
      ]
    },

    QUESTION_WITH_BUTTONS: {
      id: 'question',
      title: 'Confirmation',
      content: 'Do you want to continue with this action?',
      buttons: [
        { id: 'yes', label: 'Yes', style: 'primary' as const },
        { id: 'no', label: 'No', style: 'secondary' as const },
        { id: 'cancel', label: 'Cancel', style: 'secondary' as const }
      ]
    },

    WITH_TIMEOUT: {
      id: 'timeout-popup',
      title: 'Timed Popup',
      content: 'This popup will timeout in 5 seconds',
      timeout: 5000,
      buttons: [
        { id: 'ok', label: 'OK', style: 'primary' as const }
      ]
    },

    ERROR_POPUP: {
      id: 'error',
      title: 'Error',
      content: 'An error has occurred. Please check the logs.',
      buttons: [
        { id: 'ok', label: 'OK', style: 'danger' as const },
        { id: 'details', label: 'Show Details', style: 'secondary' as const }
      ]
    },

    INPUT_REQUEST: {
      id: 'input-request',
      title: 'Input Required',
      content: 'Please provide your input:',
      buttons: [
        { id: 'submit', label: 'Submit', style: 'primary' as const },
        { id: 'cancel', label: 'Cancel', style: 'secondary' as const }
      ],
      metadata: {
        inputType: 'text',
        required: true
      }
    }
  };

  /**
   * Test user response scenarios
   */
  static readonly USER_RESPONSES = {
    QUICK_OK: {
      buttonId: 'ok',
      timestamp: Date.now(),
      dismissed: false
    },

    CANCEL_ACTION: {
      buttonId: 'cancel',
      timestamp: Date.now(),
      dismissed: false
    },

    DISMISS_POPUP: {
      timestamp: Date.now(),
      dismissed: true
    },

    WITH_CUSTOM_DATA: {
      buttonId: 'submit',
      customData: {
        userInput: 'Test input value',
        formData: {
          field1: 'value1',
          field2: 'value2'
        }
      },
      timestamp: Date.now(),
      dismissed: false
    }
  };

  /**
   * Multi-client communication scenarios
   */
  static readonly MULTI_CLIENT_SCENARIOS = [
    {
      name: 'Sequential Popups',
      description: 'Multiple AI clients showing popups sequentially',
      clients: 2,
      vscodeInstances: 1,
      steps: [
        { clientId: 0, action: 'show_popup', data: TestScenarios.POPUP_CONFIGS.SIMPLE_INFO, delay: 0 },
        { clientId: 0, action: 'wait_response', timeout: 5000 },
        { clientId: 1, action: 'show_popup', data: TestScenarios.POPUP_CONFIGS.QUESTION_WITH_BUTTONS, delay: 1000 },
        { clientId: 1, action: 'wait_response', timeout: 5000 }
      ]
    },

    {
      name: 'Concurrent Popups',
      description: 'Multiple AI clients showing popups concurrently',
      clients: 3,
      vscodeInstances: 1,
      steps: [
        { clientId: 0, action: 'show_popup', data: TestScenarios.POPUP_CONFIGS.SIMPLE_INFO, delay: 0 },
        { clientId: 1, action: 'show_popup', data: TestScenarios.POPUP_CONFIGS.QUESTION_WITH_BUTTONS, delay: 100 },
        { clientId: 2, action: 'show_popup', data: TestScenarios.POPUP_CONFIGS.ERROR_POPUP, delay: 200 },
        { clientId: 0, action: 'wait_response', timeout: 10000 },
        { clientId: 1, action: 'wait_response', timeout: 10000 },
        { clientId: 2, action: 'wait_response', timeout: 10000 }
      ]
    },

    {
      name: 'Multi-Instance Distribution',
      description: 'Single AI client communicating with multiple VS Code instances',
      clients: 1,
      vscodeInstances: 3,
      steps: [
        { clientId: 0, action: 'show_popup', vscodeInstance: 0, data: TestScenarios.POPUP_CONFIGS.SIMPLE_INFO, delay: 0 },
        { clientId: 0, action: 'show_popup', vscodeInstance: 1, data: TestScenarios.POPUP_CONFIGS.QUESTION_WITH_BUTTONS, delay: 500 },
        { clientId: 0, action: 'show_popup', vscodeInstance: 2, data: TestScenarios.POPUP_CONFIGS.ERROR_POPUP, delay: 1000 },
        { clientId: 0, action: 'wait_response', timeout: 15000 }
      ]
    }
  ];

  /**
   * Connection failure scenarios
   */
  static readonly CONNECTION_SCENARIOS = [
    {
      name: 'Client Disconnect During Popup',
      description: 'AI client disconnects while popup is active',
      setup: () => ({
        showPopup: true,
        disconnectAfter: 2000,
        expectCleanup: true
      })
    },

    {
      name: 'VS Code Instance Disconnect',
      description: 'VS Code instance disconnects during interaction',
      setup: () => ({
        showPopup: true,
        vscodeDisconnectAfter: 1500,
        expectError: true
      })
    },

    {
      name: 'Reconnection Recovery',
      description: 'Client reconnects and resumes operation',
      setup: () => ({
        showPopup: true,
        disconnectAfter: 1000,
        reconnectAfter: 2000,
        resumeOperation: true
      })
    }
  ];

  /**
   * Performance test scenarios
   */
  static readonly PERFORMANCE_SCENARIOS = [
    {
      name: 'High Volume Popups',
      description: 'Test with many concurrent popups',
      config: {
        clientCount: 5,
        popupsPerClient: 10,
        maxConcurrent: 15,
        timeoutMs: 30000
      }
    },

    {
      name: 'Long Running Session',
      description: 'Test system stability over time',
      config: {
        durationMs: 60000, // 1 minute
        popupIntervalMs: 1000,
        clientCount: 3,
        randomResponses: true
      }
    },

    {
      name: 'Memory Leak Detection',
      description: 'Test for memory leaks with popup creation/destruction',
      config: {
        cycles: 100,
        popupsPerCycle: 5,
        cleanupBetweenCycles: true,
        measureMemory: true
      }
    }
  ];

  /**
   * Edge case scenarios
   */
  static readonly EDGE_CASES = [
    {
      name: 'Invalid Popup Configuration',
      test: () => ({
        config: {
          id: '',
          title: '',
          content: '',
          buttons: []
        },
        expectError: true
      })
    },

    {
      name: 'Duplicate Popup IDs',
      test: () => ({
        popups: [
          { ...TestScenarios.POPUP_CONFIGS.SIMPLE_INFO, id: 'duplicate' },
          { ...TestScenarios.POPUP_CONFIGS.QUESTION_WITH_BUTTONS, id: 'duplicate' }
        ],
        expectError: true
      })
    },

    {
      name: 'Popup Response After Timeout',
      test: () => ({
        config: { ...TestScenarios.POPUP_CONFIGS.WITH_TIMEOUT, timeout: 1000 },
        responseDelay: 2000,
        expectTimeout: true
      })
    },

    {
      name: 'Maximum Concurrent Popups Exceeded',
      test: () => ({
        maxConcurrent: 3,
        popupCount: 5,
        expectSomeRejected: true
      })
    },

    {
      name: 'Response to Non-existent Popup',
      test: () => ({
        popupId: 'non-existent',
        response: TestScenarios.USER_RESPONSES.QUICK_OK,
        expectError: true
      })
    }
  ];

  /**
   * Generate a random popup configuration for stress testing
   */
  static generateRandomPopup(index: number): PopupConfig {
    const types = ['info', 'warning', 'error', 'question'];
    const buttonCounts = [1, 2, 3];
    
    const type = types[Math.floor(Math.random() * types.length)];
    const buttonCount = buttonCounts[Math.floor(Math.random() * buttonCounts.length)];
    
    const buttons = [];
    for (let i = 0; i < buttonCount; i++) {
      buttons.push({
        id: `btn-${i}`,
        label: `Button ${i + 1}`,
        style: i === 0 ? 'primary' as const : 'secondary' as const
      });
    }

    return {
      id: `random-popup-${index}`,
      title: `Random ${type.charAt(0).toUpperCase() + type.slice(1)} ${index}`,
      content: `This is a randomly generated ${type} popup for testing. Index: ${index}`,
      buttons,
      timeout: Math.random() > 0.5 ? Math.floor(Math.random() * 30000) + 5000 : undefined
    };
  }

  /**
   * Generate a test conversation flow
   */
  static generateConversationFlow(steps: number): Array<{
    type: 'show_popup' | 'get_response' | 'delay';
    data?: any;
  }> {
    const flow = [];
    
    for (let i = 0; i < steps; i++) {
      // Show popup
      flow.push({
        type: 'show_popup' as const,
        data: this.generateRandomPopup(i)
      });

      // Random delay
      flow.push({
        type: 'delay' as const,
        data: { duration: Math.floor(Math.random() * 1000) + 500 }
      });

      // Get response
      flow.push({
        type: 'get_response' as const,
        data: { timeout: 10000 }
      });
    }

    return flow;
  }

  /**
   * Create a stress test scenario
   */
  static createStressTestScenario(config: {
    clientCount: number;
    popupsPerClient: number;
    duration: number;
  }) {
    return {
      name: `Stress Test - ${config.clientCount} clients, ${config.popupsPerClient} popups each`,
      config,
      execute: async (clients: any[], vscodeInstances: any[]) => {
        const promises = [];
        
        for (let i = 0; i < config.clientCount; i++) {
          const client = clients[i];
          promises.push(
            client.generateConcurrentPopups(config.popupsPerClient, {
              timeout: config.duration
            })
          );
        }

        return Promise.all(promises);
      }
    };
  }
}

/**
 * Test data generators
 */
export class TestDataGenerators {
  
  static createPopupConfig(overrides: Partial<PopupConfig> = {}): PopupConfig {
    return {
      id: `test-popup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: 'Test Popup',
      content: 'This is a test popup for automated testing',
      buttons: [
        { id: 'ok', label: 'OK', style: 'primary' },
        { id: 'cancel', label: 'Cancel', style: 'secondary' }
      ],
      ...overrides
    };
  }

  static createPopupResponse(popupId: string, overrides: Partial<PopupResponse> = {}): PopupResponse {
    return {
      popupId,
      buttonId: 'ok',
      timestamp: Date.now(),
      dismissed: false,
      ...overrides
    };
  }

  static createBatchPopupConfigs(count: number): PopupConfig[] {
    return Array.from({ length: count }, (_, i) => 
      this.createPopupConfig({
        id: `batch-popup-${i}`,
        title: `Batch Popup ${i + 1}`,
        content: `This is batch popup number ${i + 1}`
      })
    );
  }
}