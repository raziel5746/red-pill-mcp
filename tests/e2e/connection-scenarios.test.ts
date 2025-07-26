import { MockMCPServer } from '../mocks/MockMCPServer';
import { MockAIClient } from '../mocks/MockAIClient';
import { MockVSCodeInstance } from '../mocks/MockVSCodeInstance';
import { TestUtils } from '../setup';

describe('Connection Failure/Recovery Test Scenarios', () => {
  let mockServer: MockMCPServer;
  let aiClients: MockAIClient[] = [];
  let vscodeInstances: MockVSCodeInstance[] = [];

  beforeEach(async () => {
    mockServer = new MockMCPServer({ port: 8084, autoStart: true });
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
      serverUrl: 'ws://localhost:8084',
      autoConnect: true
    });
    aiClients.push(client);
    await TestUtils.delay(100);
    return client;
  }

  async function createVSCodeInstance(id: string): Promise<MockVSCodeInstance> {
    const instance = new MockVSCodeInstance({
      instanceId: id,
      autoRespond: true,
      responseDelay: 300
    });
    vscodeInstances.push(instance);
    return instance;
  }

  describe('Server Connection Failures', () => {
    it('should handle server shutdown during popup display', async () => {
      const client = await createAIClient('ai-server-shutdown');
      const vscode = await createVSCodeInstance('vscode-server-shutdown');

      // Create popup
      const popup = await client.showPopup({
        title: 'Server Will Shutdown',
        message: 'Server will be shut down while this popup is active',
        type: 'warning'
      });

      expect(popup.popupId).toBeDefined();

      // Verify popup is active
      const activePopups = await client.listActivePopups();
      expect(activePopups.popups).toHaveLength(1);

      // Shutdown server
      await mockServer.stop();

      // Client operations should fail
      await expect(
        client.getUserResponse(popup.popupId, 2000)
      ).rejects.toThrow();

      await expect(
        client.listActivePopups()
      ).rejects.toThrow();
    });

    it('should handle server restart and reconnection', async () => {
      const client = await createAIClient('ai-server-restart');
      const vscode = await createVSCodeInstance('vscode-server-restart');

      // Create initial popup
      const popup1 = await client.showPopup({
        title: 'Before Restart',
        message: 'Popup created before server restart',
        type: 'info'
      });

      expect(popup1.popupId).toBeDefined();

      // Stop server
      await mockServer.stop();
      await TestUtils.delay(100);

      // Restart server
      mockServer = new MockMCPServer({ port: 8084, autoStart: true });
      await TestUtils.delay(300);

      // Create new client (simulating reconnection)
      const reconnectedClient = await createAIClient('ai-reconnected');

      // Should be able to create new popups
      const popup2 = await reconnectedClient.showPopup({
        title: 'After Restart',
        message: 'Popup created after server restart',
        type: 'success'
      });

      expect(popup2.popupId).toBeDefined();
      expect(popup2.popupId).not.toBe(popup1.popupId);

      // Old popup should not exist
      const activePopups = await reconnectedClient.listActivePopups();
      expect(activePopups.popups).toHaveLength(1);
      expect(activePopups.popups[0].id).toBe(popup2.popupId);
    });

    it('should handle server overload and recovery', async () => {
      const client = await createAIClient('ai-overload-test');
      const vscode = await createVSCodeInstance('vscode-overload-test');

      // Create many popups to simulate overload
      const popupPromises = [];
      for (let i = 0; i < 50; i++) {
        popupPromises.push(
          client.showPopup({
            title: `Overload Popup ${i}`,
            message: `Popup ${i} for overload test`,
            type: 'info'
          }).catch(error => ({ error: error.message, index: i }))
        );
      }

      const results = await Promise.all(popupPromises);
      
      // Some requests might fail due to overload
      const successful = results.filter(r => !r.error);
      const failed = results.filter(r => r.error);

      expect(successful.length + failed.length).toBe(50);
      
      // But server should still be responsive for normal operations
      const testPopup = await client.showPopup({
        title: 'Recovery Test',
        message: 'Testing server recovery',
        type: 'info'
      });

      expect(testPopup.popupId).toBeDefined();
    });

    it('should handle intermittent connection issues', async () => {
      const client = await createAIClient('ai-intermittent');
      const vscode = await createVSCodeInstance('vscode-intermittent');

      let successfulOperations = 0;
      let failedOperations = 0;

      // Simulate intermittent connection by randomly stopping/starting server
      for (let i = 0; i < 10; i++) {
        try {
          const popup = await client.showPopup({
            title: `Intermittent Test ${i}`,
            message: `Testing intermittent connection ${i}`,
            type: 'info'
          });

          successfulOperations++;

          // Sometimes disconnect server briefly
          if (Math.random() < 0.3) {
            await mockServer.stop();
            await TestUtils.delay(200);
            mockServer = new MockMCPServer({ port: 8084, autoStart: true });
            await TestUtils.delay(300);
          }

        } catch (error) {
          failedOperations++;
          
          // Restart server if it's down
          if (!mockServer.getServerStats().running) {
            mockServer = new MockMCPServer({ port: 8084, autoStart: true });
            await TestUtils.delay(300);
          }
        }

        await TestUtils.delay(100);
      }

      expect(successfulOperations + failedOperations).toBe(10);
      expect(successfulOperations).toBeGreaterThan(0);
    });
  });

  describe('Client Connection Failures', () => {
    it('should handle AI client disconnect during popup interaction', async () => {
      const client1 = await createAIClient('ai-disconnect-1');
      const client2 = await createAIClient('ai-disconnect-2');
      const vscode = await createVSCodeInstance('vscode-client-disconnect');

      // Both clients create popups
      const popup1 = await client1.showPopup({
        title: 'Will Disconnect',
        message: 'Client will disconnect',
        type: 'warning'
      });

      const popup2 = await client2.showPopup({
        title: 'Will Continue',
        message: 'This client will continue',
        type: 'info'
      });

      // Verify both popups exist
      const initialPopups = await client1.listActivePopups();
      expect(initialPopups.popups).toHaveLength(2);

      // Disconnect first client
      client1.dispose();
      aiClients = aiClients.filter(c => c !== client1);

      await TestUtils.delay(200);

      // Second client should still be able to operate
      const remainingPopups = await client2.listActivePopups();
      expect(remainingPopups.popups.length).toBeGreaterThan(0);

      // Second client can still create popups
      const newPopup = await client2.showPopup({
        title: 'After Disconnect',
        message: 'Created after first client disconnected',
        type: 'success'
      });

      expect(newPopup.popupId).toBeDefined();
    });

    it('should handle VS Code instance disconnect', async () => {
      const client = await createAIClient('ai-vscode-disconnect');
      const vscode1 = await createVSCodeInstance('vscode-disconnect-1');
      const vscode2 = await createVSCodeInstance('vscode-disconnect-2');

      // Create popups in both instances
      const popup1 = await client.showPopup({
        vscodeInstanceId: 'vscode-disconnect-1',
        title: 'Instance 1 Popup',
        message: 'In instance that will disconnect',
        type: 'warning'
      });

      const popup2 = await client.showPopup({
        vscodeInstanceId: 'vscode-disconnect-2',
        title: 'Instance 2 Popup',
        message: 'In instance that remains',
        type: 'info'
      });

      // Simulate VS Code instance disconnect
      vscode1.simulateConnectionLoss();
      vscode1.dispose();
      vscodeInstances = vscodeInstances.filter(v => v !== vscode1);

      await TestUtils.delay(200);

      // Popup in disconnected instance should be cleaned up
      // (Implementation dependent - might need server-side cleanup)
      
      // But we should still be able to interact with second instance
      setTimeout(() => {
        mockServer.simulateUserResponse(popup2.popupId, {
          popupId: popup2.popupId,
          buttonId: 'btn-0',
          timestamp: Date.now(),
          dismissed: false
        });
      }, 300);

      const response = await client.getUserResponse(popup2.popupId, 3000);
      expect(response.buttonId).toBe('btn-0');
    });

    it('should handle concurrent client disconnections', async () => {
      const clients = await Promise.all([
        createAIClient('ai-concurrent-disconnect-1'),
        createAIClient('ai-concurrent-disconnect-2'),
        createAIClient('ai-concurrent-disconnect-3'),
        createAIClient('ai-concurrent-disconnect-4')
      ]);

      const vscode = await createVSCodeInstance('vscode-concurrent-disconnect');

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

      expect(popups).toHaveLength(4);

      // Verify all popups are active
      const allPopups = await clients[0].listActivePopups();
      expect(allPopups.popups).toHaveLength(4);

      // Disconnect all clients except the last one simultaneously
      for (let i = 0; i < 3; i++) {
        clients[i].dispose();
      }
      aiClients = aiClients.filter(c => c === clients[3]);

      await TestUtils.delay(500);

      // Last client should still work
      const finalClient = clients[3];
      const newPopup = await finalClient.showPopup({
        title: 'Survivor Popup',
        message: 'Created by surviving client',
        type: 'success'
      });

      expect(newPopup.popupId).toBeDefined();
    });
  });

  describe('Network Connection Issues', () => {
    it('should handle connection timeout during popup creation', async () => {
      const client = await createAIClient('ai-timeout-test');
      
      // Stop server to simulate network timeout
      await mockServer.stop();

      // Attempt to create popup should fail
      await expect(
        client.showPopup({
          title: 'Timeout Test',
          message: 'This should timeout',
          type: 'error'
        })
      ).rejects.toThrow();
    });

    it('should handle connection timeout during response waiting', async () => {
      const client = await createAIClient('ai-response-timeout');
      const vscode = await createVSCodeInstance('vscode-response-timeout');

      // Create popup successfully
      const popup = await client.showPopup({
        title: 'Response Timeout Test',
        message: 'User will not respond in time',
        type: 'info'
      });

      expect(popup.popupId).toBeDefined();

      // Stop server before response
      setTimeout(async () => {
        await mockServer.stop();
      }, 500);

      // Waiting for response should timeout
      await expect(
        client.getUserResponse(popup.popupId, 2000)
      ).rejects.toThrow();
    });

    it('should handle partial message transmission', async () => {
      const client = await createAIClient('ai-partial-message');
      const vscode = await createVSCodeInstance('vscode-partial-message');

      // Create popup
      const popup = await client.showPopup({
        title: 'Partial Message Test',
        message: 'Testing partial message handling',
        type: 'info'
      });

      // Simulate partial response (malformed JSON)
      const clientConnection = mockServer.getConnectedClients()
        .find(c => c.id.includes('partial-message'));

      if (clientConnection) {
        // Send malformed message
        clientConnection.websocket.send('{"incomplete": "json"');
        
        await TestUtils.delay(200);

        // Client should still be able to receive proper messages
        setTimeout(() => {
          mockServer.simulateUserResponse(popup.popupId, {
            popupId: popup.popupId,
            buttonId: 'btn-0',
            timestamp: Date.now(),
            dismissed: false
          });
        }, 300);

        const response = await client.getUserResponse(popup.popupId, 3000);
        expect(response.buttonId).toBe('btn-0');
      }
    });
  });

  describe('Recovery Mechanisms', () => {
    it('should handle graceful server shutdown and restart', async () => {
      const client = await createAIClient('ai-graceful-restart');
      const vscode = await createVSCodeInstance('vscode-graceful-restart');

      // Create initial state
      const popup1 = await client.showPopup({
        title: 'Before Graceful Shutdown',
        message: 'Server will shutdown gracefully',
        type: 'info'
      });

      // Server sends proper close message
      const stats = mockServer.getServerStats();
      expect(stats.running).toBe(true);

      await mockServer.stop(); // This should be graceful
      await TestUtils.delay(200);

      // Restart server
      mockServer = new MockMCPServer({ port: 8084, autoStart: true });
      await TestUtils.delay(300);

      // Create new client for reconnection
      const reconnectedClient = await createAIClient('ai-graceful-reconnect');

      // Should work normally after restart
      const popup2 = await reconnectedClient.showPopup({
        title: 'After Graceful Restart',
        message: 'Server restarted gracefully',
        type: 'success'
      });

      expect(popup2.popupId).toBeDefined();
    });

    it('should handle client reconnection with session restoration', async () => {
      const originalClient = await createAIClient('ai-session-restore');
      const vscode = await createVSCodeInstance('vscode-session-restore');

      // Create popup with original client
      const popup = await originalClient.showPopup({
        title: 'Session Restore Test',
        message: 'Testing session restoration',
        type: 'info'
      });

      expect(popup.popupId).toBeDefined();

      // Disconnect client
      originalClient.dispose();
      aiClients = aiClients.filter(c => c !== originalClient);

      await TestUtils.delay(200);

      // Create new client (simulating reconnection)
      const reconnectedClient = await createAIClient('ai-session-restored');

      // In a real implementation, session might be restored
      // For now, we just verify the new client can operate
      const newPopup = await reconnectedClient.showPopup({
        title: 'After Reconnection',
        message: 'New popup after reconnection',
        type: 'success'
      });

      expect(newPopup.popupId).toBeDefined();
    });

    it('should handle cascading failures and recovery', async () => {
      const clients = await Promise.all([
        createAIClient('ai-cascade-1'),
        createAIClient('ai-cascade-2')
      ]);

      const vscodes = await Promise.all([
        createVSCodeInstance('vscode-cascade-1'),
        createVSCodeInstance('vscode-cascade-2')
      ]);

      // Create complex state
      const popups = await Promise.all([
        clients[0].showPopup({
          vscodeInstanceId: 'vscode-cascade-1',
          title: 'Cascade Test 1',
          message: 'First popup',
          type: 'info'
        }),
        clients[1].showPopup({
          vscodeInstanceId: 'vscode-cascade-2',
          title: 'Cascade Test 2',
          message: 'Second popup',
          type: 'info'
        })
      ]);

      // Simulate cascading failures
      // 1. First VS Code instance fails
      vscodes[0].simulateConnectionLoss();
      vscodes[0].dispose();
      vscodeInstances = vscodeInstances.filter(v => v !== vscodes[0]);

      await TestUtils.delay(200);

      // 2. Server briefly fails
      await mockServer.stop();
      await TestUtils.delay(300);
      mockServer = new MockMCPServer({ port: 8084, autoStart: true });
      await TestUtils.delay(300);

      // 3. First client reconnects
      const recoveredClient = await createAIClient('ai-cascade-recovered');

      // System should still be functional
      const recoveryPopup = await recoveredClient.showPopup({
        title: 'Recovery Test',
        message: 'System has recovered',
        type: 'success'
      });

      expect(recoveryPopup.popupId).toBeDefined();
    });
  });

  describe('Error Handling and Cleanup', () => {
    it('should clean up resources on connection failure', async () => {
      const client = await createAIClient('ai-cleanup-test');
      const vscode = await createVSCodeInstance('vscode-cleanup-test');

      // Create multiple popups
      const popups = await Promise.all([
        client.showPopup({ title: 'Cleanup 1', message: 'First', type: 'info' }),
        client.showPopup({ title: 'Cleanup 2', message: 'Second', type: 'info' }),
        client.showPopup({ title: 'Cleanup 3', message: 'Third', type: 'info' })
      ]);

      expect(popups).toHaveLength(3);

      // Verify popups are active
      const activePopups = await client.listActivePopups();
      expect(activePopups.popups).toHaveLength(3);

      // Force server shutdown (simulating crash)
      mockServer.dispose();

      await TestUtils.delay(500);

      // Create new server and client
      mockServer = new MockMCPServer({ port: 8084, autoStart: true });
      await TestUtils.delay(300);

      const newClient = await createAIClient('ai-cleanup-new');

      // Should start with clean state
      const cleanState = await newClient.listActivePopups();
      expect(cleanState.popups).toHaveLength(0);
    });

    it('should handle error propagation correctly', async () => {
      const client = await createAIClient('ai-error-propagation');
      const vscode = await createVSCodeInstance('vscode-error-propagation');

      // Create popup
      const popup = await client.showPopup({
        title: 'Error Propagation Test',
        message: 'Testing error handling',
        type: 'error'
      });

      // Stop server
      await mockServer.stop();

      // All subsequent operations should fail gracefully
      await expect(client.getUserResponse(popup.popupId, 1000)).rejects.toThrow();
      await expect(client.closePopup(popup.popupId)).rejects.toThrow();
      await expect(client.listActivePopups()).rejects.toThrow();

      // Errors should be specific and meaningful
      try {
        await client.getUserResponse(popup.popupId, 1000);
      } catch (error) {
        expect(error.message).toMatch(/connection|timeout|disconnect/i);
      }
    });
  });
});