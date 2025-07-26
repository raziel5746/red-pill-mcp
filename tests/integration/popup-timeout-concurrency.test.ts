import { MockMCPServer } from '../mocks/MockMCPServer';
import { MockAIClient } from '../mocks/MockAIClient';
import { MockVSCodeInstance } from '../mocks/MockVSCodeInstance';
import { TestUtils } from '../setup';
import { TestScenarios } from '../fixtures/TestScenarios';

describe('Popup Timeout and Concurrency Tests', () => {
  let mockServer: MockMCPServer;
  let aiClient: MockAIClient;
  let vscodeInstance: MockVSCodeInstance;

  beforeEach(async () => {
    mockServer = new MockMCPServer({ port: 8085, autoStart: true });
    await TestUtils.delay(200);

    aiClient = new MockAIClient({
      clientId: 'ai-timeout-concurrency',
      serverUrl: 'ws://localhost:8085',
      autoConnect: true
    });

    vscodeInstance = new MockVSCodeInstance({
      instanceId: 'vscode-timeout-concurrency',
      autoRespond: false, // Manual response control for timeout tests
      responseDelay: 500
    });

    await TestUtils.delay(200);
  });

  afterEach(async () => {
    if (aiClient) aiClient.dispose();
    if (vscodeInstance) vscodeInstance.dispose();
    if (mockServer) await mockServer.stop();
  });

  describe('Popup Timeout Scenarios', () => {
    it('should timeout popup after specified duration', async () => {
      const popup = await aiClient.showPopup({
        title: 'Timeout Test',
        message: 'This popup will timeout in 1 second',
        type: 'warning',
        timeout: 1000
      });

      const startTime = Date.now();

      // Don't respond - let it timeout
      await expect(
        aiClient.getUserResponse(popup.popupId, 2000)
      ).rejects.toThrow('Popup response timeout');

      const endTime = Date.now();
      const actualTimeout = endTime - startTime;

      // Should timeout around 1000ms (allow some tolerance)
      expect(actualTimeout).toBeGreaterThan(900);
      expect(actualTimeout).toBeLessThan(1500);

      // Popup should be cleaned up
      const activePopups = await aiClient.listActivePopups();
      expect(activePopups.popups).toHaveLength(0);
    });

    it('should respect different timeout values for multiple popups', async () => {
      const popups = await Promise.all([
        aiClient.showPopup({
          title: 'Short Timeout',
          message: 'Times out in 500ms',
          type: 'warning',
          timeout: 500
        }),
        aiClient.showPopup({
          title: 'Medium Timeout',
          message: 'Times out in 1000ms',
          type: 'warning',
          timeout: 1000
        }),
        aiClient.showPopup({
          title: 'Long Timeout',
          message: 'Times out in 2000ms',
          type: 'warning',
          timeout: 2000
        })
      ]);

      const startTime = Date.now();

      // Wait for all to timeout
      const timeoutPromises = popups.map(popup =>
        aiClient.getUserResponse(popup.popupId, 3000).catch(error => ({
          popupId: popup.popupId,
          error: error.message,
          timeoutAt: Date.now() - startTime
        }))
      );

      const results = await Promise.all(timeoutPromises);

      // All should have timed out
      results.forEach(result => {
        expect(result.error).toMatch(/timeout/i);
      });

      // Check timeout order (with some tolerance)
      const timeouts = results.map(r => r.timeoutAt).sort((a, b) => a - b);
      expect(timeouts[0]).toBeLessThan(700); // ~500ms timeout
      expect(timeouts[1]).toBeLessThan(1200); // ~1000ms timeout
      expect(timeouts[2]).toBeLessThan(2200); // ~2000ms timeout
    });

    it('should handle response before timeout', async () => {
      const popup = await aiClient.showPopup({
        title: 'Response Before Timeout',
        message: 'Will respond before timeout',
        type: 'info',
        timeout: 2000
      });

      // Respond after 500ms (before 2000ms timeout)
      setTimeout(() => {
        mockServer.simulateUserResponse(popup.popupId, {
          popupId: popup.popupId,
          buttonId: 'btn-0',
          timestamp: Date.now(),
          dismissed: false
        });
      }, 500);

      const startTime = Date.now();
      const response = await aiClient.getUserResponse(popup.popupId, 3000);
      const responseTime = Date.now() - startTime;

      expect(response.buttonId).toBe('btn-0');
      expect(responseTime).toBeLessThan(1000); // Should respond quickly, not timeout
    });

    it('should handle popup timeout with custom cleanup', async () => {
      const popup = await aiClient.showPopup({
        title: 'Custom Cleanup Test',
        message: 'Custom cleanup on timeout',
        type: 'error',
        timeout: 800
      });

      // Monitor server state
      let activeCountBeforeTimeout = 0;
      let activeCountAfterTimeout = 0;

      setTimeout(async () => {
        const before = await aiClient.listActivePopups();
        activeCountBeforeTimeout = before.popups.length;
      }, 400);

      setTimeout(async () => {
        const after = await aiClient.listActivePopups();
        activeCountAfterTimeout = after.popups.length;
      }, 1200);

      await expect(
        aiClient.getUserResponse(popup.popupId, 1500)
      ).rejects.toThrow();

      await TestUtils.delay(1300);

      expect(activeCountBeforeTimeout).toBe(1);
      expect(activeCountAfterTimeout).toBe(0);
    });

    it('should handle zero timeout (immediate timeout)', async () => {
      const popup = await aiClient.showPopup({
        title: 'Immediate Timeout',
        message: 'Should timeout immediately',
        type: 'error',
        timeout: 0
      });

      await expect(
        aiClient.getUserResponse(popup.popupId, 1000)
      ).rejects.toThrow();
    });

    it('should handle very long timeout', async () => {
      const popup = await aiClient.showPopup({
        title: 'Long Timeout',
        message: 'Has very long timeout',
        type: 'info',
        timeout: 30000 // 30 seconds
      });

      // Respond quickly
      setTimeout(() => {
        mockServer.simulateUserResponse(popup.popupId, {
          popupId: popup.popupId,
          buttonId: 'btn-0',
          timestamp: Date.now(),
          dismissed: false
        });
      }, 200);

      const response = await aiClient.getUserResponse(popup.popupId, 5000);
      expect(response.buttonId).toBe('btn-0');
    });
  });

  describe('Concurrency Scenarios', () => {
    it('should handle maximum concurrent popups limit', async () => {
      const maxConcurrent = 3;
      const popupPromises = [];

      // Create more popups than the limit
      for (let i = 0; i < maxConcurrent + 2; i++) {
        popupPromises.push(
          aiClient.showPopup({
            title: `Concurrent Popup ${i}`,
            message: `Testing concurrency ${i}`,
            type: 'info',
            timeout: 5000
          }).catch(error => ({ error: error.message, index: i }))
        );
      }

      const results = await Promise.all(popupPromises);

      // First 3 should succeed, last 2 might fail or queue
      const successful = results.filter(r => !r.error);
      const failed = results.filter(r => r.error);

      expect(successful.length).toBeGreaterThanOrEqual(maxConcurrent);
      
      // Check active popup count doesn't exceed limit
      const activePopups = await aiClient.listActivePopups();
      expect(activePopups.popups.length).toBeLessThanOrEqual(maxConcurrent);
    });

    it('should handle rapid popup creation and resolution', async () => {
      const popupCount = 10;
      const popupIds: string[] = [];

      // Create popups rapidly
      for (let i = 0; i < popupCount; i++) {
        const popup = await aiClient.showPopup({
          title: `Rapid Popup ${i}`,
          message: `Rapid creation test ${i}`,
          type: 'info',
          timeout: 3000
        });
        popupIds.push(popup.popupId);

        // Small delay to prevent overwhelming
        await TestUtils.delay(50);
      }

      expect(popupIds).toHaveLength(popupCount);

      // Respond to all popups rapidly
      popupIds.forEach((popupId, index) => {
        setTimeout(() => {
          mockServer.simulateUserResponse(popupId, {
            popupId,
            buttonId: 'btn-0',
            customData: { index },
            timestamp: Date.now(),
            dismissed: false
          });
        }, 100 + (index * 20));
      });

      // Wait for all responses
      const responsePromises = popupIds.map(popupId =>
        aiClient.getUserResponse(popupId, 5000)
      );

      const responses = await Promise.all(responsePromises);
      expect(responses).toHaveLength(popupCount);

      // All popups should be resolved
      const finalActivePopups = await aiClient.listActivePopups();
      expect(finalActivePopups.popups).toHaveLength(0);
    });

    it('should handle concurrent timeout and response', async () => {
      const popup = await aiClient.showPopup({
        title: 'Race Condition Test',
        message: 'Testing timeout vs response race',
        type: 'warning',
        timeout: 800
      });

      // Set up race condition: response at ~750ms, timeout at 800ms
      setTimeout(() => {
        mockServer.simulateUserResponse(popup.popupId, {
          popupId: popup.popupId,
          buttonId: 'btn-0',
          timestamp: Date.now(),
          dismissed: false
        });
      }, 750);

      const startTime = Date.now();
      
      try {
        const response = await aiClient.getUserResponse(popup.popupId, 1500);
        const responseTime = Date.now() - startTime;
        
        // Should get response, not timeout
        expect(response.buttonId).toBe('btn-0');
        expect(responseTime).toBeLessThan(800);
        
      } catch (error) {
        // If timeout won the race, that's also valid
        const timeoutTime = Date.now() - startTime;
        expect(timeoutTime).toBeGreaterThan(700);
        expect(error.message).toMatch(/timeout/i);
      }
    });

    it('should handle multiple clients with concurrent popups', async () => {
      // Create additional clients
      const client2 = new MockAIClient({
        clientId: 'ai-concurrent-2',
        serverUrl: 'ws://localhost:8085',
        autoConnect: true
      });

      const client3 = new MockAIClient({
        clientId: 'ai-concurrent-3',
        serverUrl: 'ws://localhost:8085',
        autoConnect: true
      });

      await TestUtils.delay(200);

      try {
        // Each client creates multiple popups
        const client1Popups = await Promise.all([
          aiClient.showPopup({ title: 'C1P1', message: 'Client 1 Popup 1', type: 'info' }),
          aiClient.showPopup({ title: 'C1P2', message: 'Client 1 Popup 2', type: 'info' })
        ]);

        const client2Popups = await Promise.all([
          client2.showPopup({ title: 'C2P1', message: 'Client 2 Popup 1', type: 'warning' }),
          client2.showPopup({ title: 'C2P2', message: 'Client 2 Popup 2', type: 'warning' })
        ]);

        const client3Popups = await Promise.all([
          client3.showPopup({ title: 'C3P1', message: 'Client 3 Popup 1', type: 'error' }),
          client3.showPopup({ title: 'C3P2', message: 'Client 3 Popup 2', type: 'error' })
        ]);

        // Verify all popups created
        const allPopups = [...client1Popups, ...client2Popups, ...client3Popups];
        expect(allPopups).toHaveLength(6);

        // Respond to all popups with different timing
        allPopups.forEach((popup, index) => {
          setTimeout(() => {
            mockServer.simulateUserResponse(popup.popupId, {
              popupId: popup.popupId,
              buttonId: 'btn-0',
              customData: { popupIndex: index },
              timestamp: Date.now(),
              dismissed: false
            });
          }, 100 + (index * 100));
        });

        // Each client waits for their responses
        const [responses1, responses2, responses3] = await Promise.all([
          Promise.all(client1Popups.map(p => aiClient.getUserResponse(p.popupId, 5000))),
          Promise.all(client2Popups.map(p => client2.getUserResponse(p.popupId, 5000))),
          Promise.all(client3Popups.map(p => client3.getUserResponse(p.popupId, 5000)))
        ]);

        expect(responses1).toHaveLength(2);
        expect(responses2).toHaveLength(2);
        expect(responses3).toHaveLength(2);

      } finally {
        client2.dispose();
        client3.dispose();
      }
    });

    it('should handle concurrent popup closure', async () => {
      // Create multiple popups
      const popups = await Promise.all([
        aiClient.showPopup({ title: 'Close Test 1', message: 'First', type: 'info' }),
        aiClient.showPopup({ title: 'Close Test 2', message: 'Second', type: 'info' }),
        aiClient.showPopup({ title: 'Close Test 3', message: 'Third', type: 'info' }),
        aiClient.showPopup({ title: 'Close Test 4', message: 'Fourth', type: 'info' }),
        aiClient.showPopup({ title: 'Close Test 5', message: 'Fifth', type: 'info' })
      ]);

      expect(popups).toHaveLength(5);

      // Close popups concurrently
      const closePromises = [
        aiClient.closePopup(popups[0].popupId),
        aiClient.closePopup(popups[1].popupId),
        aiClient.closePopup(popups[2].popupId),
        aiClient.closePopup(), // Close all remaining
      ];

      const closeResults = await Promise.all(closePromises);

      // Verify closures
      expect(closeResults[0].closed).toContain(popups[0].popupId);
      expect(closeResults[1].closed).toContain(popups[1].popupId);
      expect(closeResults[2].closed).toContain(popups[2].popupId);

      // All should be closed
      const finalPopups = await aiClient.listActivePopups();
      expect(finalPopups.popups).toHaveLength(0);
    });
  });

  describe('Mixed Timeout and Concurrency Scenarios', () => {
    it('should handle concurrent popups with different timeouts', async () => {
      const popups = await Promise.all([
        aiClient.showPopup({
          title: 'Fast Timeout',
          message: 'Times out quickly',
          type: 'warning',
          timeout: 500
        }),
        aiClient.showPopup({
          title: 'Medium Timeout',
          message: 'Medium timeout',
          type: 'warning',
          timeout: 1000
        }),
        aiClient.showPopup({
          title: 'Slow Timeout',
          message: 'Times out slowly',
          type: 'warning',
          timeout: 1500
        }),
        aiClient.showPopup({
          title: 'No Timeout',
          message: 'No timeout set',
          type: 'info'
          // No timeout specified
        })
      ]);

      const startTime = Date.now();

      // Respond to the no-timeout popup
      setTimeout(() => {
        mockServer.simulateUserResponse(popups[3].popupId, {
          popupId: popups[3].popupId,
          buttonId: 'btn-0',
          timestamp: Date.now(),
          dismissed: false
        });
      }, 300);

      // Wait for responses/timeouts
      const promises = popups.map((popup, index) => {
        if (index === 3) {
          // This one should respond
          return aiClient.getUserResponse(popup.popupId, 3000);
        } else {
          // These should timeout
          return aiClient.getUserResponse(popup.popupId, 3000)
            .catch(error => ({
              popupId: popup.popupId,
              error: error.message,
              timeoutAt: Date.now() - startTime
            }));
        }
      });

      const results = await Promise.all(promises);

      // First three should have timed out
      expect(results[0].error).toMatch(/timeout/i);
      expect(results[1].error).toMatch(/timeout/i);
      expect(results[2].error).toMatch(/timeout/i);

      // Last one should have responded
      expect(results[3].buttonId).toBe('btn-0');
    });

    it('should handle timeout cleanup with concurrent operations', async () => {
      // Create popup with timeout
      const timeoutPopup = await aiClient.showPopup({
        title: 'Will Timeout',
        message: 'This will timeout during other operations',
        type: 'warning',
        timeout: 800
      });

      // Create other popups for concurrent operations
      const otherPopups = await Promise.all([
        aiClient.showPopup({ title: 'Other 1', message: 'Other popup 1', type: 'info' }),
        aiClient.showPopup({ title: 'Other 2', message: 'Other popup 2', type: 'info' })
      ]);

      // Respond to other popups while first one times out
      setTimeout(() => {
        mockServer.simulateUserResponse(otherPopups[0].popupId, {
          popupId: otherPopups[0].popupId,
          buttonId: 'btn-0',
          timestamp: Date.now(),
          dismissed: false
        });
      }, 300);

      setTimeout(() => {
        mockServer.simulateUserResponse(otherPopups[1].popupId, {
          popupId: otherPopups[1].popupId,
          buttonId: 'btn-0',
          timestamp: Date.now(),
          dismissed: false
        });
      }, 600);

      // Wait for all to complete
      const [timeoutResult, response1, response2] = await Promise.all([
        aiClient.getUserResponse(timeoutPopup.popupId, 2000).catch(e => ({ error: e.message })),
        aiClient.getUserResponse(otherPopups[0].popupId, 2000),
        aiClient.getUserResponse(otherPopups[1].popupId, 2000)
      ]);

      expect(timeoutResult.error).toMatch(/timeout/i);
      expect(response1.buttonId).toBe('btn-0');
      expect(response2.buttonId).toBe('btn-0');

      // Only the timeout popup should be cleaned up
      const activePopups = await aiClient.listActivePopups();
      expect(activePopups.popups).toHaveLength(0);
    });

    it('should handle stress test with timeouts and concurrency', async () => {
      const popupCount = 20;
      const popupPromises = [];

      // Create many popups with random timeouts
      for (let i = 0; i < popupCount; i++) {
        const timeout = Math.random() > 0.5 ? Math.floor(Math.random() * 2000) + 500 : undefined;
        
        popupPromises.push(
          aiClient.showPopup({
            title: `Stress Popup ${i}`,
            message: `Stress test popup ${i}`,
            type: 'info',
            timeout
          }).catch(error => ({ error: error.message, index: i }))
        );

        // Small delay to prevent overwhelming
        await TestUtils.delay(25);
      }

      const popups = await Promise.all(popupPromises);
      const successfulPopups = popups.filter(p => !p.error);

      // Respond to some popups randomly
      successfulPopups.forEach((popup, index) => {
        if (Math.random() > 0.3) { // 70% chance of response
          setTimeout(() => {
            mockServer.simulateUserResponse(popup.popupId, {
              popupId: popup.popupId,
              buttonId: 'btn-0',
              customData: { index },
              timestamp: Date.now(),
              dismissed: false
            });
          }, Math.floor(Math.random() * 1000) + 100);
        }
      });

      // Wait for all to complete (response or timeout)
      const responsePromises = successfulPopups.map(popup =>
        aiClient.getUserResponse(popup.popupId, 4000)
          .catch(error => ({ error: error.message, popupId: popup.popupId }))
      );

      const results = await Promise.all(responsePromises);
      expect(results).toHaveLength(successfulPopups.length);

      // Should have mix of responses and timeouts
      const responses = results.filter(r => !r.error);
      const timeouts = results.filter(r => r.error);

      expect(responses.length + timeouts.length).toBe(successfulPopups.length);

      // All should be cleaned up
      await TestUtils.delay(500);
      const finalActivePopups = await aiClient.listActivePopups();
      expect(finalActivePopups.popups).toHaveLength(0);
    });
  });
});