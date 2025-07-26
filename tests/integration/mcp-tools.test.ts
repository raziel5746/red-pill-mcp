import { MockMCPServer } from '../mocks/MockMCPServer';
import { MockAIClient } from '../mocks/MockAIClient';
import { MockVSCodeInstance } from '../mocks/MockVSCodeInstance';
import { TestUtils } from '../setup';
import { TestScenarios } from '../fixtures/TestScenarios';

describe('MCP Tool Integration Tests', () => {
  let mockServer: MockMCPServer;
  let aiClient: MockAIClient;
  let vscodeInstance: MockVSCodeInstance;

  beforeEach(async () => {
    // Start mock server
    mockServer = new MockMCPServer({ port: 8082, autoStart: true });
    await TestUtils.delay(100); // Allow server to start

    // Create AI client
    aiClient = new MockAIClient({
      clientId: 'test-ai-client-1',
      serverUrl: 'ws://localhost:8082',
      autoConnect: true
    });

    // Create VS Code instance
    vscodeInstance = new MockVSCodeInstance({
      instanceId: 'test-vscode-1',
      autoRespond: true,
      responseDelay: 500
    });

    // Wait for connections
    await TestUtils.delay(200);
  });

  afterEach(async () => {
    if (aiClient) aiClient.dispose();
    if (vscodeInstance) vscodeInstance.dispose();
    if (mockServer) await mockServer.stop();
  });

  describe('show_popup tool', () => {
    it('should create popup successfully', async () => {
      const popupOptions = {
        title: 'Test Integration Popup',
        message: 'This is an integration test popup',
        type: 'info' as const,
        buttons: ['OK', 'Cancel']
      };

      const result = await aiClient.showPopup(popupOptions);

      expect(result).toHaveProperty('popupId');
      expect(typeof result.popupId).toBe('string');

      // Verify popup appears in server state
      const activePopups = mockServer.getActivePopups();
      expect(activePopups).toHaveLength(1);
      expect(activePopups[0].title).toBe(popupOptions.title);
    });

    it('should handle popup with timeout', async () => {
      const popupOptions = {
        title: 'Timeout Popup',
        message: 'This popup will timeout',
        type: 'warning' as const,
        timeout: 1000
      };

      const result = await aiClient.showPopup(popupOptions);
      expect(result).toHaveProperty('popupId');

      // Wait for timeout
      await TestUtils.delay(1500);

      // Popup should be cleaned up after timeout
      const activePopups = mockServer.getActivePopups();
      expect(activePopups).toHaveLength(0);
    });

    it('should handle popup with custom buttons', async () => {
      const popupOptions = {
        title: 'Custom Buttons',
        message: 'Choose an option',
        type: 'question' as const,
        buttons: ['Option A', 'Option B', 'Option C']
      };

      const result = await aiClient.showPopup(popupOptions);
      expect(result).toHaveProperty('popupId');

      const activePopups = mockServer.getActivePopups();
      expect(activePopups[0].buttons).toHaveLength(3);
    });

    it('should reject invalid popup options', async () => {
      const invalidOptions = {
        title: '',
        message: '',
        type: 'invalid' as any
      };

      await expect(aiClient.showPopup(invalidOptions)).rejects.toThrow();
    });
  });

  describe('get_user_response tool', () => {
    it('should wait for and return user response', async () => {
      // Create popup first
      const popupResult = await aiClient.showPopup({
        title: 'Response Test',
        message: 'Click OK',
        type: 'info',
        buttons: ['OK', 'Cancel']
      });

      // Simulate user clicking OK after delay
      setTimeout(() => {
        mockServer.simulateUserResponse(popupResult.popupId, {
          popupId: popupResult.popupId,
          buttonId: 'btn-0', // First button (OK)
          timestamp: Date.now(),
          dismissed: false
        });
      }, 500);

      const response = await aiClient.getUserResponse(popupResult.popupId, 5000);

      expect(response).toHaveProperty('popupId', popupResult.popupId);
      expect(response).toHaveProperty('buttonId', 'btn-0');
      expect(response).toHaveProperty('dismissed', false);
    });

    it('should timeout if no response received', async () => {
      const popupResult = await aiClient.showPopup({
        title: 'No Response Test',
        message: 'This will timeout',
        type: 'info'
      });

      await expect(
        aiClient.getUserResponse(popupResult.popupId, 1000)
      ).rejects.toThrow('Popup response timeout');
    });

    it('should wait for any popup response when no specific ID provided', async () => {
      // Create multiple popups
      const popup1 = await aiClient.showPopup({
        title: 'Popup 1',
        message: 'First popup',
        type: 'info'
      });

      const popup2 = await aiClient.showPopup({
        title: 'Popup 2',
        message: 'Second popup',
        type: 'info'
      });

      // Respond to second popup
      setTimeout(() => {
        mockServer.simulateUserResponse(popup2.popupId, {
          popupId: popup2.popupId,
          buttonId: 'btn-0',
          timestamp: Date.now(),
          dismissed: false
        });
      }, 300);

      const response = await aiClient.getUserResponse(undefined, 5000);
      expect(response.popupId).toBe(popup2.popupId);
    });

    it('should handle dismissed popups', async () => {
      const popupResult = await aiClient.showPopup({
        title: 'Dismiss Test',
        message: 'This will be dismissed',
        type: 'info'
      });

      setTimeout(() => {
        mockServer.simulateUserResponse(popupResult.popupId, {
          popupId: popupResult.popupId,
          timestamp: Date.now(),
          dismissed: true
        });
      }, 300);

      const response = await aiClient.getUserResponse(popupResult.popupId, 5000);
      expect(response.dismissed).toBe(true);
    });
  });

  describe('close_popup tool', () => {
    it('should close specific popup', async () => {
      const popup1 = await aiClient.showPopup({
        title: 'Popup 1',
        message: 'First popup',
        type: 'info'
      });

      const popup2 = await aiClient.showPopup({
        title: 'Popup 2',
        message: 'Second popup',
        type: 'info'
      });

      expect(mockServer.getActivePopups()).toHaveLength(2);

      const closeResult = await aiClient.closePopup(popup1.popupId);
      expect(closeResult.closed).toContain(popup1.popupId);
      expect(mockServer.getActivePopups()).toHaveLength(1);
    });

    it('should close all popups when no ID specified', async () => {
      // Create multiple popups
      await aiClient.showPopup({ title: 'Popup 1', message: 'First', type: 'info' });
      await aiClient.showPopup({ title: 'Popup 2', message: 'Second', type: 'info' });
      await aiClient.showPopup({ title: 'Popup 3', message: 'Third', type: 'info' });

      expect(mockServer.getActivePopups()).toHaveLength(3);

      const closeResult = await aiClient.closePopup();
      expect(closeResult.closed).toHaveLength(3);
      expect(mockServer.getActivePopups()).toHaveLength(0);
    });

    it('should handle closing non-existent popup', async () => {
      const closeResult = await aiClient.closePopup('non-existent-popup');
      expect(closeResult.closed).toHaveLength(0);
    });
  });

  describe('list_active_popups tool', () => {
    it('should list all active popups', async () => {
      const popup1 = await aiClient.showPopup({
        title: 'Popup 1',
        message: 'First popup',
        type: 'info'
      });

      const popup2 = await aiClient.showPopup({
        title: 'Popup 2',
        message: 'Second popup',
        type: 'warning'
      });

      const listResult = await aiClient.listActivePopups();
      
      expect(listResult.popups).toHaveLength(2);
      expect(listResult.popups.some(p => p.id === popup1.popupId)).toBe(true);
      expect(listResult.popups.some(p => p.id === popup2.popupId)).toBe(true);
    });

    it('should return empty list when no popups active', async () => {
      const listResult = await aiClient.listActivePopups();
      expect(listResult.popups).toHaveLength(0);
    });

    it('should include popup metadata in list', async () => {
      await aiClient.showPopup({
        title: 'Detailed Popup',
        message: 'Popup with details',
        type: 'info'
      });

      const listResult = await aiClient.listActivePopups();
      const popup = listResult.popups[0];

      expect(popup).toHaveProperty('id');
      expect(popup).toHaveProperty('title', 'Detailed Popup');
      expect(popup).toHaveProperty('content', 'Popup with details');
      expect(popup).toHaveProperty('createdAt');
    });
  });

  describe('complex interaction flows', () => {
    it('should handle conversation-style interaction', async () => {
      // Step 1: AI asks a question
      const questionPopup = await aiClient.showPopup({
        title: 'Question',
        message: 'Do you want to continue?',
        type: 'question',
        buttons: ['Yes', 'No']
      });

      // Step 2: User responds "Yes"
      setTimeout(() => {
        mockServer.simulateUserResponse(questionPopup.popupId, {
          popupId: questionPopup.popupId,
          buttonId: 'btn-0', // Yes
          timestamp: Date.now(),
          dismissed: false
        });
      }, 200);

      const response1 = await aiClient.getUserResponse(questionPopup.popupId, 5000);
      expect(response1.buttonId).toBe('btn-0');

      // Step 3: AI shows confirmation
      const confirmPopup = await aiClient.showPopup({
        title: 'Confirmation',
        message: 'Great! Proceeding with the action.',
        type: 'info',
        buttons: ['OK']
      });

      // Step 4: User acknowledges
      setTimeout(() => {
        mockServer.simulateUserResponse(confirmPopup.popupId, {
          popupId: confirmPopup.popupId,
          buttonId: 'btn-0', // OK
          timestamp: Date.now(),
          dismissed: false
        });
      }, 200);

      const response2 = await aiClient.getUserResponse(confirmPopup.popupId, 5000);
      expect(response2.buttonId).toBe('btn-0');
    });

    it('should handle rapid popup creation and closure', async () => {
      const popupPromises = [];

      // Create 5 popups rapidly
      for (let i = 0; i < 5; i++) {
        popupPromises.push(
          aiClient.showPopup({
            title: `Rapid Popup ${i}`,
            message: `This is popup number ${i}`,
            type: 'info'
          })
        );
      }

      const popupResults = await Promise.all(popupPromises);
      expect(popupResults).toHaveLength(5);

      // Verify all are active
      const activePopups = await aiClient.listActivePopups();
      expect(activePopups.popups).toHaveLength(5);

      // Close all at once
      const closeResult = await aiClient.closePopup();
      expect(closeResult.closed).toHaveLength(5);

      // Verify all are closed
      const finalActivePopups = await aiClient.listActivePopups();
      expect(finalActivePopups.popups).toHaveLength(0);
    });

    it('should handle mixed response types', async () => {
      // Create popup with custom data expectation
      const dataPopup = await aiClient.showPopup({
        title: 'Data Input',
        message: 'Please provide input',
        type: 'input',
        buttons: ['Submit', 'Cancel']
      });

      // Simulate user providing custom data
      setTimeout(() => {
        mockServer.simulateUserResponse(dataPopup.popupId, {
          popupId: dataPopup.popupId,
          buttonId: 'btn-0', // Submit
          customData: {
            userInput: 'Test input data',
            formValues: {
              name: 'John Doe',
              email: 'john@example.com'
            }
          },
          timestamp: Date.now(),
          dismissed: false
        });
      }, 300);

      const response = await aiClient.getUserResponse(dataPopup.popupId, 5000);
      
      expect(response.buttonId).toBe('btn-0');
      expect(response.customData).toEqual({
        userInput: 'Test input data',
        formValues: {
          name: 'John Doe',
          email: 'john@example.com'
        }
      });
    });
  });

  describe('error handling', () => {
    it('should handle server disconnect during operation', async () => {
      const popup = await aiClient.showPopup({
        title: 'Disconnect Test',
        message: 'Server will disconnect',
        type: 'warning'
      });

      // Stop server while popup is active
      await mockServer.stop();

      // Attempting to get response should fail
      await expect(
        aiClient.getUserResponse(popup.popupId, 2000)
      ).rejects.toThrow();
    });

    it('should handle invalid tool parameters', async () => {
      await expect(
        aiClient.callTool('show_popup', { invalid: 'parameters' })
      ).rejects.toThrow();
    });

    it('should handle unknown tool calls', async () => {
      await expect(
        aiClient.callTool('unknown_tool', {})
      ).rejects.toThrow('Unknown tool: unknown_tool');
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple clients simultaneously', async () => {
      // Create second AI client
      const aiClient2 = new MockAIClient({
        clientId: 'test-ai-client-2',
        serverUrl: 'ws://localhost:8082',
        autoConnect: true
      });

      await TestUtils.delay(200);

      try {
        // Both clients create popups simultaneously
        const [popup1, popup2] = await Promise.all([
          aiClient.showPopup({
            title: 'Client 1 Popup',
            message: 'From client 1',
            type: 'info'
          }),
          aiClient2.showPopup({
            title: 'Client 2 Popup',
            message: 'From client 2',
            type: 'info'
          })
        ]);

        expect(popup1.popupId).toBeDefined();
        expect(popup2.popupId).toBeDefined();
        expect(popup1.popupId).not.toBe(popup2.popupId);

        // Both should be active
        const activePopups = await aiClient.listActivePopups();
        expect(activePopups.popups).toHaveLength(2);

      } finally {
        aiClient2.dispose();
      }
    });

    it('should handle concurrent responses', async () => {
      // Create multiple popups
      const popups = await Promise.all([
        aiClient.showPopup({ title: 'Popup 1', message: 'First', type: 'info' }),
        aiClient.showPopup({ title: 'Popup 2', message: 'Second', type: 'info' }),
        aiClient.showPopup({ title: 'Popup 3', message: 'Third', type: 'info' })
      ]);

      // Simulate concurrent responses
      const responsePromises = popups.map((popup, index) => {
        setTimeout(() => {
          mockServer.simulateUserResponse(popup.popupId, {
            popupId: popup.popupId,
            buttonId: `btn-${index}`,
            timestamp: Date.now(),
            dismissed: false
          });
        }, 100 + (index * 50));

        return aiClient.getUserResponse(popup.popupId, 5000);
      });

      const responses = await Promise.all(responsePromises);
      
      expect(responses).toHaveLength(3);
      responses.forEach((response, index) => {
        expect(response.buttonId).toBe(`btn-${index}`);
      });
    });
  });
});