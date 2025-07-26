import { MockMCPServer } from '../mocks/MockMCPServer';
import { MockAIClient } from '../mocks/MockAIClient';
import { MockVSCodeInstance } from '../mocks/MockVSCodeInstance';
import { TestUtils } from '../setup';
import { TestScenarios } from '../fixtures/TestScenarios';

describe('Multi-Client/Multi-Instance E2E Tests', () => {
  let mockServer: MockMCPServer;
  let aiClients: MockAIClient[] = [];
  let vscodeInstances: MockVSCodeInstance[] = [];

  beforeEach(async () => {
    mockServer = new MockMCPServer({ port: 8083, autoStart: true });
    await TestUtils.delay(200);
  });

  afterEach(async () => {
    // Clean up all clients and instances
    aiClients.forEach(client => client.dispose());
    vscodeInstances.forEach(instance => instance.dispose());
    aiClients = [];
    vscodeInstances = [];
    
    if (mockServer) {
      await mockServer.stop();
    }
  });

  async function createAIClient(id: string): Promise<MockAIClient> {
    const client = new MockAIClient({
      clientId: id,
      serverUrl: 'ws://localhost:8083',
      autoConnect: true
    });
    aiClients.push(client);
    await TestUtils.delay(100);
    return client;
  }

  async function createVSCodeInstance(id: string, autoRespond = true): Promise<MockVSCodeInstance> {
    const instance = new MockVSCodeInstance({
      instanceId: id,
      autoRespond,
      responseDelay: 500
    });
    vscodeInstances.push(instance);
    return instance;
  }

  describe('Single AI Client → Single VS Code Instance', () => {
    it('should handle basic popup interaction', async () => {
      const client = await createAIClient('ai-1');
      const vscode = await createVSCodeInstance('vscode-1');

      // AI shows popup
      const popup = await client.showPopup({
        title: 'Basic Interaction',
        message: 'This is a test popup',
        type: 'info',
        buttons: ['OK']
      });

      // Simulate user response
      setTimeout(() => {
        mockServer.simulateUserResponse(popup.popupId, {
          popupId: popup.popupId,
          buttonId: 'btn-0',
          timestamp: Date.now(),
          dismissed: false
        });
      }, 300);

      const response = await client.getUserResponse(popup.popupId, 5000);
      expect(response.buttonId).toBe('btn-0');
    });

    it('should handle conversation flow', async () => {
      const client = await createAIClient('ai-conv');
      const vscode = await createVSCodeInstance('vscode-conv');

      const conversation = TestScenarios.generateConversationFlow(3);
      const results = await client.simulateConversation(conversation);

      expect(results).toHaveLength(9); // 3 steps × 3 operations each
      
      // Verify no popups are left active
      const activePopups = await client.listActivePopups();
      expect(activePopups.popups).toHaveLength(0);
    });
  });

  describe('Multiple AI Clients → Single VS Code Instance', () => {
    it('should handle sequential popup requests', async () => {
      const client1 = await createAIClient('ai-seq-1');
      const client2 = await createAIClient('ai-seq-2');
      const vscode = await createVSCodeInstance('vscode-single');

      // Client 1 shows popup
      const popup1 = await client1.showPopup({
        title: 'From Client 1',
        message: 'First popup',
        type: 'info'
      });

      // Simulate response to first popup
      setTimeout(() => {
        mockServer.simulateUserResponse(popup1.popupId, {
          popupId: popup1.popupId,
          buttonId: 'btn-0',
          timestamp: Date.now(),
          dismissed: false
        });
      }, 200);

      const response1 = await client1.getUserResponse(popup1.popupId, 3000);
      expect(response1.buttonId).toBe('btn-0');

      // Client 2 shows popup after first is done
      const popup2 = await client2.showPopup({
        title: 'From Client 2',
        message: 'Second popup',
        type: 'warning'
      });

      setTimeout(() => {
        mockServer.simulateUserResponse(popup2.popupId, {
          popupId: popup2.popupId,
          buttonId: 'btn-0',
          timestamp: Date.now(),
          dismissed: false
        });
      }, 200);

      const response2 = await client2.getUserResponse(popup2.popupId, 3000);
      expect(response2.buttonId).toBe('btn-0');
    });

    it('should handle concurrent popup requests', async () => {
      const clients = await Promise.all([
        createAIClient('ai-conc-1'),
        createAIClient('ai-conc-2'),
        createAIClient('ai-conc-3')
      ]);
      const vscode = await createVSCodeInstance('vscode-concurrent');

      // All clients show popups simultaneously
      const popupPromises = clients.map((client, index) =>
        client.showPopup({
          title: `Concurrent Popup ${index + 1}`,
          message: `From client ${index + 1}`,
          type: 'info'
        })
      );

      const popups = await Promise.all(popupPromises);
      expect(popups).toHaveLength(3);

      // Verify all popups are active
      const activePopups = await clients[0].listActivePopups();
      expect(activePopups.popups).toHaveLength(3);

      // Simulate responses to all popups
      popups.forEach((popup, index) => {
        setTimeout(() => {
          mockServer.simulateUserResponse(popup.popupId, {
            popupId: popup.popupId,
            buttonId: `btn-${index}`,
            timestamp: Date.now(),
            dismissed: false
          });
        }, 100 + (index * 50));
      });

      // All clients wait for their responses
      const responsePromises = clients.map((client, index) =>
        client.getUserResponse(popups[index].popupId, 5000)
      );

      const responses = await Promise.all(responsePromises);
      expect(responses).toHaveLength(3);
      
      responses.forEach((response, index) => {
        expect(response.buttonId).toBe(`btn-${index}`);
      });
    });

    it('should handle client disconnection during active popups', async () => {
      const client1 = await createAIClient('ai-disc-1');
      const client2 = await createAIClient('ai-disc-2');
      const vscode = await createVSCodeInstance('vscode-disconnect-test');

      // Both clients create popups
      const popup1 = await client1.showPopup({
        title: 'Will Disconnect',
        message: 'Client will disconnect',
        type: 'warning'
      });

      const popup2 = await client2.showPopup({
        title: 'Will Continue',
        message: 'This client continues',
        type: 'info'
      });

      // Disconnect first client
      client1.dispose();
      aiClients = aiClients.filter(c => c !== client1);

      // Second client should still work
      setTimeout(() => {
        mockServer.simulateUserResponse(popup2.popupId, {
          popupId: popup2.popupId,
          buttonId: 'btn-0',
          timestamp: Date.now(),
          dismissed: false
        });
      }, 300);

      const response = await client2.getUserResponse(popup2.popupId, 5000);
      expect(response.buttonId).toBe('btn-0');
    });
  });

  describe('Single AI Client → Multiple VS Code Instances', () => {
    it('should distribute popups across instances', async () => {
      const client = await createAIClient('ai-multi-instance');
      const vscode1 = await createVSCodeInstance('vscode-1');
      const vscode2 = await createVSCodeInstance('vscode-2');
      const vscode3 = await createVSCodeInstance('vscode-3');

      // Create popups for different instances
      const popup1 = await client.showPopup({
        vscodeInstanceId: 'vscode-1',
        title: 'For Instance 1',
        message: 'Popup for first instance',
        type: 'info'
      });

      const popup2 = await client.showPopup({
        vscodeInstanceId: 'vscode-2',
        title: 'For Instance 2',
        message: 'Popup for second instance',
        type: 'info'
      });

      expect(popup1.popupId).toBeDefined();
      expect(popup2.popupId).toBeDefined();

      // Simulate responses from different instances
      setTimeout(() => {
        mockServer.simulateUserResponse(popup1.popupId, {
          popupId: popup1.popupId,
          buttonId: 'btn-0',
          customData: { source: 'instance-1' },
          timestamp: Date.now(),
          dismissed: false
        });
      }, 200);

      setTimeout(() => {
        mockServer.simulateUserResponse(popup2.popupId, {
          popupId: popup2.popupId,
          buttonId: 'btn-0',
          customData: { source: 'instance-2' },
          timestamp: Date.now(),
          dismissed: false
        });
      }, 400);

      const [response1, response2] = await Promise.all([
        client.getUserResponse(popup1.popupId, 5000),
        client.getUserResponse(popup2.popupId, 5000)
      ]);

      expect(response1.customData?.source).toBe('instance-1');
      expect(response2.customData?.source).toBe('instance-2');
    });

    it('should handle instance-specific popup closure', async () => {
      const client = await createAIClient('ai-instance-close');
      const vscode1 = await createVSCodeInstance('vscode-close-1');
      const vscode2 = await createVSCodeInstance('vscode-close-2');

      // Create popups in both instances
      await client.showPopup({
        vscodeInstanceId: 'vscode-close-1',
        title: 'Instance 1 Popup 1',
        message: 'First popup in instance 1',
        type: 'info'
      });

      await client.showPopup({
        vscodeInstanceId: 'vscode-close-1',
        title: 'Instance 1 Popup 2',
        message: 'Second popup in instance 1',
        type: 'info'
      });

      await client.showPopup({
        vscodeInstanceId: 'vscode-close-2',
        title: 'Instance 2 Popup',
        message: 'Popup in instance 2',
        type: 'info'
      });

      // Verify all popups exist
      const allPopups = await client.listActivePopups();
      expect(allPopups.popups).toHaveLength(3);

      // Close popups in instance 1 only
      const closeResult = await client.closePopup(undefined, 'vscode-close-1');
      expect(closeResult.closed).toHaveLength(2);

      // Instance 2 popup should still exist
      const remainingPopups = await client.listActivePopups();
      expect(remainingPopups.popups).toHaveLength(1);
      expect(remainingPopups.popups[0].title).toBe('Instance 2 Popup');
    });
  });

  describe('Multiple AI Clients → Multiple VS Code Instances', () => {
    it('should handle complex multi-client multi-instance scenario', async () => {
      // Create 3 AI clients and 2 VS Code instances
      const clients = await Promise.all([
        createAIClient('ai-complex-1'),
        createAIClient('ai-complex-2'),
        createAIClient('ai-complex-3')
      ]);

      const vscodes = await Promise.all([
        createVSCodeInstance('vscode-complex-1'),
        createVSCodeInstance('vscode-complex-2')
      ]);

      // Each client creates a popup in a different instance
      const popups = await Promise.all([
        clients[0].showPopup({
          vscodeInstanceId: 'vscode-complex-1',
          title: 'Client 1 → Instance 1',
          message: 'From client 1 to instance 1',
          type: 'info'
        }),
        clients[1].showPopup({
          vscodeInstanceId: 'vscode-complex-2',
          title: 'Client 2 → Instance 2',
          message: 'From client 2 to instance 2',
          type: 'warning'
        }),
        clients[2].showPopup({
          vscodeInstanceId: 'vscode-complex-1',
          title: 'Client 3 → Instance 1',
          message: 'From client 3 to instance 1',
          type: 'error'
        })
      ]);

      // Verify all popups created
      expect(popups).toHaveLength(3);
      const activePopups = await clients[0].listActivePopups();
      expect(activePopups.popups).toHaveLength(3);

      // Simulate responses with varying delays
      popups.forEach((popup, index) => {
        setTimeout(() => {
          mockServer.simulateUserResponse(popup.popupId, {
            popupId: popup.popupId,
            buttonId: 'btn-0',
            customData: { clientIndex: index },
            timestamp: Date.now(),
            dismissed: false
          });
        }, 100 + (index * 200));
      });

      // Each client waits for their response
      const responsePromises = clients.map((client, index) =>
        client.getUserResponse(popups[index].popupId, 5000)
      );

      const responses = await Promise.all(responsePromises);
      
      responses.forEach((response, index) => {
        expect(response.customData?.clientIndex).toBe(index);
      });
    });

    it('should handle load balancing scenario', async () => {
      // Create multiple clients and instances for load testing
      const clients = await Promise.all(
        Array.from({ length: 5 }, (_, i) => createAIClient(`ai-load-${i}`))
      );

      const vscodes = await Promise.all(
        Array.from({ length: 3 }, (_, i) => createVSCodeInstance(`vscode-load-${i}`))
      );

      // Each client creates multiple popups distributed across instances
      const allPopupPromises: Promise<any>[] = [];

      clients.forEach((client, clientIndex) => {
        for (let popupIndex = 0; popupIndex < 3; popupIndex++) {
          const instanceIndex = (clientIndex + popupIndex) % vscodes.length;
          
          allPopupPromises.push(
            client.showPopup({
              vscodeInstanceId: `vscode-load-${instanceIndex}`,
              title: `Client ${clientIndex} Popup ${popupIndex}`,
              message: `Load test popup from client ${clientIndex}`,
              type: 'info'
            })
          );
        }
      });

      const allPopups = await Promise.all(allPopupPromises);
      expect(allPopups).toHaveLength(15); // 5 clients × 3 popups each

      // Verify distribution
      const activePopups = await clients[0].listActivePopups();
      expect(activePopups.popups).toHaveLength(15);

      // Close all popups
      const closeResult = await clients[0].closePopup();
      expect(closeResult.closed).toHaveLength(15);
    });
  });

  describe('Connection Management Scenarios', () => {
    it('should handle server restart with active connections', async () => {
      const client = await createAIClient('ai-restart-test');
      const vscode = await createVSCodeInstance('vscode-restart-test');

      // Create initial popup
      const popup1 = await client.showPopup({
        title: 'Before Restart',
        message: 'This popup exists before server restart',
        type: 'info'
      });

      expect(popup1.popupId).toBeDefined();

      // Restart server
      await mockServer.stop();
      mockServer = new MockMCPServer({ port: 8083, autoStart: true });
      await TestUtils.delay(300);

      // Reconnect client (in real scenario, this would be automatic)
      client.dispose();
      aiClients = aiClients.filter(c => c !== client);
      
      const newClient = await createAIClient('ai-restart-reconnect');

      // Create new popup after restart
      const popup2 = await newClient.showPopup({
        title: 'After Restart',
        message: 'This popup exists after server restart',
        type: 'info'
      });

      expect(popup2.popupId).toBeDefined();
      expect(popup2.popupId).not.toBe(popup1.popupId);
    });

    it('should handle gradual client disconnections', async () => {
      const clients = await Promise.all([
        createAIClient('ai-gradual-1'),
        createAIClient('ai-gradual-2'),
        createAIClient('ai-gradual-3'),
        createAIClient('ai-gradual-4')
      ]);

      const vscode = await createVSCodeInstance('vscode-gradual');

      // All clients create popups
      const popups = await Promise.all(
        clients.map((client, index) =>
          client.showPopup({
            title: `Client ${index + 1} Popup`,
            message: `From client ${index + 1}`,
            type: 'info'
          })
        )
      );

      // Verify all popups exist
      let activePopups = await clients[0].listActivePopups();
      expect(activePopups.popups).toHaveLength(4);

      // Disconnect clients one by one
      for (let i = 0; i < 3; i++) {
        clients[i].dispose();
        aiClients = aiClients.filter(c => c !== clients[i]);
        await TestUtils.delay(200);

        // Check remaining client can still operate
        activePopups = await clients[3].listActivePopups();
        expect(activePopups.popups).toHaveLength(4 - i); // Popups may be cleaned up
      }

      // Last client should still work
      const finalPopup = await clients[3].showPopup({
        title: 'Final Popup',
        message: 'Last client standing',
        type: 'success'
      });

      expect(finalPopup.popupId).toBeDefined();
    });
  });

  describe('Stress Test Scenarios', () => {
    it('should handle high-frequency popup creation', async () => {
      const client = await createAIClient('ai-stress');
      const vscode = await createVSCodeInstance('vscode-stress');

      const popupCount = 20;
      const popupPromises = [];

      // Create many popups quickly
      for (let i = 0; i < popupCount; i++) {
        popupPromises.push(
          client.showPopup({
            title: `Stress Popup ${i}`,
            message: `High frequency popup ${i}`,
            type: 'info'
          })
        );
      }

      const popups = await Promise.all(popupPromises);
      expect(popups).toHaveLength(popupCount);

      // Verify server can handle the load
      const activePopups = await client.listActivePopups();
      expect(activePopups.popups).toHaveLength(popupCount);

      // Clean up
      await client.closePopup();
    });

    it('should handle rapid response simulation', async () => {
      const client = await createAIClient('ai-rapid-response');
      const vscode = await createVSCodeInstance('vscode-rapid-response');

      const popupCount = 10;
      const popups = [];

      // Create popups
      for (let i = 0; i < popupCount; i++) {
        const popup = await client.showPopup({
          title: `Rapid Response ${i}`,
          message: `Popup for rapid response test ${i}`,
          type: 'info'
        });
        popups.push(popup);
      }

      // Simulate rapid responses
      const responsePromises = popups.map((popup, index) => {
        setTimeout(() => {
          mockServer.simulateUserResponse(popup.popupId, {
            popupId: popup.popupId,
            buttonId: 'btn-0',
            customData: { index },
            timestamp: Date.now(),
            dismissed: false
          });
        }, 10 + (index * 5)); // Very rapid responses

        return client.getUserResponse(popup.popupId, 5000);
      });

      const responses = await Promise.all(responsePromises);
      expect(responses).toHaveLength(popupCount);

      responses.forEach((response, index) => {
        expect(response.customData?.index).toBe(index);
      });
    });
  });
});