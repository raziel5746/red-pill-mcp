import { MockMCPServer } from '../mocks/MockMCPServer';
import { MockAIClient } from '../mocks/MockAIClient';
import { MockVSCodeInstance } from '../mocks/MockVSCodeInstance';
import { TestUtils } from '../setup';
import { TestScenarios } from '../fixtures/TestScenarios';

interface PerformanceMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  memoryUsage: NodeJS.MemoryUsage;
  operationsPerSecond: number;
  successCount: number;
  errorCount: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  throughput: number;
}

describe('Performance and Load Testing Suite', () => {
  let mockServer: MockMCPServer;
  let clients: MockAIClient[] = [];
  let vscodeInstances: MockVSCodeInstance[] = [];

  beforeEach(async () => {
    mockServer = new MockMCPServer({ port: 8086, autoStart: true });
    await TestUtils.delay(300);
  });

  afterEach(async () => {
    // Clean up all clients and instances
    clients.forEach(client => client.dispose());
    vscodeInstances.forEach(instance => instance.dispose());
    clients = [];
    vscodeInstances = [];
    
    if (mockServer) {
      await mockServer.stop();
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  async function createClients(count: number): Promise<MockAIClient[]> {
    const clientPromises = [];
    for (let i = 0; i < count; i++) {
      clientPromises.push(
        new MockAIClient({
          clientId: `load-test-client-${i}`,
          serverUrl: 'ws://localhost:8086',
          autoConnect: true,
          responseDelay: 10 // Faster for load testing
        })
      );
    }

    const newClients = await Promise.all(clientPromises);
    clients.push(...newClients);
    await TestUtils.delay(200); // Allow connections to establish
    return newClients;
  }

  async function createVSCodeInstances(count: number): Promise<MockVSCodeInstance[]> {
    const instances = [];
    for (let i = 0; i < count; i++) {
      const instance = new MockVSCodeInstance({
        instanceId: `load-test-vscode-${i}`,
        autoRespond: true,
        responseDelay: 100
      });
      instances.push(instance);
    }
    vscodeInstances.push(...instances);
    return instances;
  }

  function measurePerformance<T>(
    operation: () => Promise<T>,
    operationCount: number = 1
  ): Promise<{ result: T; metrics: PerformanceMetrics }> {
    return new Promise(async (resolve) => {
      const startMemory = process.memoryUsage();
      const startTime = Date.now();
      const responseTimes: number[] = [];
      let successCount = 0;
      let errorCount = 0;

      try {
        const operationStart = Date.now();
        const result = await operation();
        const operationTime = Date.now() - operationStart;
        
        responseTimes.push(operationTime);
        successCount++;

        const endTime = Date.now();
        const endMemory = process.memoryUsage();
        const duration = endTime - startTime;

        const metrics: PerformanceMetrics = {
          startTime,
          endTime,
          duration,
          memoryUsage: {
            rss: endMemory.rss - startMemory.rss,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
            external: endMemory.external - startMemory.external,
            arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
          },
          operationsPerSecond: operationCount / (duration / 1000),
          successCount,
          errorCount,
          averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
          minResponseTime: Math.min(...responseTimes),
          maxResponseTime: Math.max(...responseTimes),
          throughput: successCount / (duration / 1000)
        };

        resolve({ result, metrics });
      } catch (error) {
        errorCount++;
        throw error;
      }
    });
  }

  describe('Single Client Load Tests', () => {
    it('should handle high-frequency popup creation', async () => {
      const client = (await createClients(1))[0];
      const vscode = (await createVSCodeInstances(1))[0];

      const popupCount = 100;
      
      const { result, metrics } = await measurePerformance(async () => {
        const popupPromises = [];
        
        for (let i = 0; i < popupCount; i++) {
          popupPromises.push(
            client.showPopup({
              title: `Load Test Popup ${i}`,
              message: `High frequency popup ${i}`,
              type: 'info',
              timeout: 30000
            })
          );
        }

        return Promise.all(popupPromises);
      }, popupCount);

      expect(result).toHaveLength(popupCount);
      expect(metrics.successCount).toBe(1);
      expect(metrics.operationsPerSecond).toBeGreaterThan(10); // At least 10 operations per second
      
      console.log('High-frequency popup creation metrics:', {
        duration: `${metrics.duration}ms`,
        operationsPerSecond: metrics.operationsPerSecond.toFixed(2),
        memoryIncrease: `${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`
      });

      // Clean up
      await client.closePopup();
    }, 30000);

    it('should handle rapid popup resolution', async () => {
      const client = (await createClients(1))[0];
      const vscode = (await createVSCodeInstances(1))[0];

      const popupCount = 50;

      // Create popups
      const popups = [];
      for (let i = 0; i < popupCount; i++) {
        const popup = await client.showPopup({
          title: `Rapid Resolution ${i}`,
          message: `Popup for rapid resolution test ${i}`,
          type: 'info'
        });
        popups.push(popup);
      }

      const { result, metrics } = await measurePerformance(async () => {
        // Respond to all popups rapidly
        popups.forEach((popup, index) => {
          setTimeout(() => {
            mockServer.simulateUserResponse(popup.popupId, {
              popupId: popup.popupId,
              buttonId: 'btn-0',
              customData: { index },
              timestamp: Date.now(),
              dismissed: false
            });
          }, index * 10); // Very rapid responses
        });

        // Wait for all responses
        return Promise.all(
          popups.map(popup => client.getUserResponse(popup.popupId, 10000))
        );
      }, popupCount);

      expect(result).toHaveLength(popupCount);
      expect(metrics.throughput).toBeGreaterThan(5); // At least 5 responses per second
      
      console.log('Rapid popup resolution metrics:', {
        duration: `${metrics.duration}ms`,
        throughput: metrics.throughput.toFixed(2),
        avgResponseTime: `${metrics.averageResponseTime.toFixed(2)}ms`
      });
    }, 30000);

    it('should handle memory efficiency with popup lifecycle', async () => {
      const client = (await createClients(1))[0];
      const vscode = (await createVSCodeInstances(1))[0];

      const cycles = 10;
      const popupsPerCycle = 20;
      
      const initialMemory = process.memoryUsage();
      const memorySnapshots: number[] = [];

      for (let cycle = 0; cycle < cycles; cycle++) {
        // Create popups
        const popups = [];
        for (let i = 0; i < popupsPerCycle; i++) {
          const popup = await client.showPopup({
            title: `Memory Test ${cycle}-${i}`,
            message: `Memory efficiency test popup`,
            type: 'info'
          });
          popups.push(popup);
        }

        // Respond to and cleanup popups
        popups.forEach((popup, index) => {
          setTimeout(() => {
            mockServer.simulateUserResponse(popup.popupId, {
              popupId: popup.popupId,
              buttonId: 'btn-0',
              timestamp: Date.now(),
              dismissed: false
            });
          }, index * 5);
        });

        await Promise.all(
          popups.map(popup => client.getUserResponse(popup.popupId, 5000))
        );

        // Take memory snapshot
        const currentMemory = process.memoryUsage();
        memorySnapshots.push(currentMemory.heapUsed);

        // Force cleanup
        if (global.gc) global.gc();
        await TestUtils.delay(100);
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

      console.log('Memory efficiency test:', {
        cycles,
        totalPopups: cycles * popupsPerCycle,
        memoryIncrease: `${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`,
        memoryIncreasePercent: `${memoryIncreasePercent.toFixed(2)}%`
      });

      // Memory increase should be reasonable (less than 50MB for this test)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    }, 60000);
  });

  describe('Multi-Client Load Tests', () => {
    it('should handle concurrent clients with high load', async () => {
      const clientCount = 10;
      const popupsPerClient = 20;
      
      const testClients = await createClients(clientCount);
      const vscodes = await createVSCodeInstances(3);

      const { result, metrics } = await measurePerformance(async () => {
        const allPromises = testClients.map((client, clientIndex) =>
          client.generateConcurrentPopups(popupsPerClient, {
            timeout: 30000
          })
        );

        return Promise.all(allPromises);
      }, clientCount * popupsPerClient);

      expect(result).toHaveLength(clientCount);
      result.forEach(clientPopups => {
        expect(clientPopups).toHaveLength(popupsPerClient);
      });

      console.log('Multi-client concurrent load test:', {
        clients: clientCount,
        popupsPerClient,
        totalPopups: clientCount * popupsPerClient,
        duration: `${metrics.duration}ms`,
        throughput: metrics.throughput.toFixed(2)
      });

      // Verify server can handle the load
      const serverStats = mockServer.getServerStats();
      expect(serverStats.clientCount).toBeGreaterThanOrEqual(clientCount);

      // Clean up
      await testClients[0].closePopup();
    }, 45000);

    it('should handle connection churning', async () => {
      const connectionCycles = 20;
      const clientsPerCycle = 5;
      
      const { result, metrics } = await measurePerformance(async () => {
        const results = [];

        for (let cycle = 0; cycle < connectionCycles; cycle++) {
          // Create clients
          const cycleClients = [];
          for (let i = 0; i < clientsPerCycle; i++) {
            const client = new MockAIClient({
              clientId: `churn-${cycle}-${i}`,
              serverUrl: 'ws://localhost:8086',
              autoConnect: true
            });
            cycleClients.push(client);
          }

          await TestUtils.delay(50);

          // Each client creates a popup
          const popups = await Promise.all(
            cycleClients.map((client, index) =>
              client.showPopup({
                title: `Churn Test ${cycle}-${index}`,
                message: `Connection churn test`,
                type: 'info'
              })
            )
          );

          results.push(popups);

          // Disconnect clients
          cycleClients.forEach(client => client.dispose());
          
          await TestUtils.delay(20);
        }

        return results;
      }, connectionCycles);

      expect(result).toHaveLength(connectionCycles);
      
      console.log('Connection churning test:', {
        cycles: connectionCycles,
        clientsPerCycle,
        duration: `${metrics.duration}ms`,
        averageConnectionTime: `${(metrics.duration / connectionCycles).toFixed(2)}ms`
      });
    }, 60000);

    it('should handle sustained high throughput', async () => {
      const testDuration = 10000; // 10 seconds
      const clientCount = 5;
      const testClients = await createClients(clientCount);
      const vscodes = await createVSCodeInstances(2);

      const startTime = Date.now();
      let operationCount = 0;
      const errors: string[] = [];

      const { result, metrics } = await measurePerformance(async () => {
        const operations: Promise<any>[] = [];

        // Run operations for specified duration
        while (Date.now() - startTime < testDuration) {
          const clientIndex = operationCount % clientCount;
          const client = testClients[clientIndex];

          operations.push(
            client.showPopup({
              title: `Sustained Load ${operationCount}`,
              message: `High throughput test popup`,
              type: 'info',
              timeout: 5000
            }).then(popup => {
              // Auto-respond after short delay
              setTimeout(() => {
                mockServer.simulateUserResponse(popup.popupId, {
                  popupId: popup.popupId,
                  buttonId: 'btn-0',
                  timestamp: Date.now(),
                  dismissed: false
                });
              }, 200);

              return client.getUserResponse(popup.popupId, 3000);
            }).catch(error => {
              errors.push(error.message);
              return null;
            })
          );

          operationCount++;
          await TestUtils.delay(50); // Control rate
        }

        return Promise.all(operations);
      }, operationCount);

      const successfulOperations = result.filter(r => r !== null).length;
      const errorRate = errors.length / operationCount;

      console.log('Sustained high throughput test:', {
        duration: `${testDuration}ms`,
        totalOperations: operationCount,
        successfulOperations,
        errorRate: `${(errorRate * 100).toFixed(2)}%`,
        avgThroughput: `${(operationCount / (testDuration / 1000)).toFixed(2)} ops/sec`
      });

      expect(errorRate).toBeLessThan(0.1); // Less than 10% error rate
      expect(successfulOperations).toBeGreaterThan(operationCount * 0.8); // At least 80% success
    }, 30000);
  });

  describe('Resource Usage Tests', () => {
    it('should monitor CPU and memory usage under load', async () => {
      const client = (await createClients(1))[0];
      const vscode = (await createVSCodeInstances(1))[0];

      const memorySnapshots: NodeJS.MemoryUsage[] = [];
      const popupCount = 200;

      // Monitor memory during test
      const memoryMonitor = setInterval(() => {
        memorySnapshots.push(process.memoryUsage());
      }, 100);

      try {
        const { result, metrics } = await measurePerformance(async () => {
          const popups = [];

          // Create popups in batches to avoid overwhelming
          for (let batch = 0; batch < 10; batch++) {
            const batchPromises = [];
            for (let i = 0; i < 20; i++) {
              const popupIndex = batch * 20 + i;
              batchPromises.push(
                client.showPopup({
                  title: `Resource Test ${popupIndex}`,
                  message: `Resource monitoring popup ${popupIndex}`,
                  type: 'info'
                })
              );
            }
            
            const batchPopups = await Promise.all(batchPromises);
            popups.push(...batchPopups);
            
            await TestUtils.delay(100); // Brief pause between batches
          }

          return popups;
        }, popupCount);

        clearInterval(memoryMonitor);

        // Analyze memory usage
        const heapUsages = memorySnapshots.map(s => s.heapUsed);
        const maxHeapUsed = Math.max(...heapUsages);
        const minHeapUsed = Math.min(...heapUsages);
        const avgHeapUsed = heapUsages.reduce((a, b) => a + b, 0) / heapUsages.length;

        console.log('Resource usage analysis:', {
          popupCount,
          duration: `${metrics.duration}ms`,
          memoryIncrease: `${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
          maxHeapUsed: `${(maxHeapUsed / 1024 / 1024).toFixed(2)}MB`,
          avgHeapUsed: `${(avgHeapUsed / 1024 / 1024).toFixed(2)}MB`,
          memoryVariation: `${((maxHeapUsed - minHeapUsed) / 1024 / 1024).toFixed(2)}MB`
        });

        expect(result).toHaveLength(popupCount);
        
        // Memory usage should be reasonable
        expect(metrics.memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase

        // Clean up
        await client.closePopup();
        
      } finally {
        clearInterval(memoryMonitor);
      }
    }, 60000);

    it('should handle garbage collection efficiency', async () => {
      const client = (await createClients(1))[0];
      const vscode = (await createVSCodeInstances(1))[0];

      const cycles = 5;
      const popupsPerCycle = 50;
      const memoryReadings: number[] = [];

      for (let cycle = 0; cycle < cycles; cycle++) {
        // Create and resolve popups
        const popups = [];
        for (let i = 0; i < popupsPerCycle; i++) {
          const popup = await client.showPopup({
            title: `GC Test ${cycle}-${i}`,
            message: `Garbage collection test popup`,
            type: 'info'
          });
          popups.push(popup);
        }

        // Resolve all popups
        popups.forEach((popup, index) => {
          setTimeout(() => {
            mockServer.simulateUserResponse(popup.popupId, {
              popupId: popup.popupId,
              buttonId: 'btn-0',
              timestamp: Date.now(),
              dismissed: false
            });
          }, index * 5);
        });

        await Promise.all(
          popups.map(popup => client.getUserResponse(popup.popupId, 10000))
        );

        // Force garbage collection
        if (global.gc) {
          global.gc();
          await TestUtils.delay(100);
        }

        // Record memory usage
        memoryReadings.push(process.memoryUsage().heapUsed);
      }

      // Analyze memory pattern
      const maxMemory = Math.max(...memoryReadings);
      const minMemory = Math.min(...memoryReadings);
      const memoryVariation = maxMemory - minMemory;
      const memoryGrowth = memoryReadings[memoryReadings.length - 1] - memoryReadings[0];

      console.log('Garbage collection efficiency:', {
        cycles,
        popupsPerCycle,
        totalPopups: cycles * popupsPerCycle,
        maxMemory: `${(maxMemory / 1024 / 1024).toFixed(2)}MB`,
        minMemory: `${(minMemory / 1024 / 1024).toFixed(2)}MB`,
        memoryVariation: `${(memoryVariation / 1024 / 1024).toFixed(2)}MB`,
        memoryGrowth: `${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`
      });

      // Memory growth should be minimal
      expect(memoryGrowth).toBeLessThan(20 * 1024 * 1024); // Less than 20MB growth
    }, 45000);
  });

  describe('Stress Tests', () => {
    it('should handle extreme concurrent load', async () => {
      const clientCount = 20;
      const popupsPerClient = 10;
      const testClients = await createClients(clientCount);
      const vscodes = await createVSCodeInstances(5);

      const { result, metrics } = await measurePerformance(async () => {
        // All clients create popups simultaneously
        const allOperations = testClients.map((client, clientIndex) =>
          Promise.all(
            Array.from({ length: popupsPerClient }, (_, popupIndex) =>
              client.showPopup({
                title: `Extreme Load ${clientIndex}-${popupIndex}`,
                message: `Extreme concurrent load test`,
                type: 'info',
                timeout: 30000
              })
            )
          )
        );

        return Promise.all(allOperations);
      }, clientCount * popupsPerClient);

      const totalPopups = result.reduce((sum, clientPopups) => sum + clientPopups.length, 0);
      
      console.log('Extreme concurrent load test:', {
        clients: clientCount,
        popupsPerClient,
        totalPopups,
        duration: `${metrics.duration}ms`,
        throughput: metrics.throughput.toFixed(2),
        serverStats: mockServer.getServerStats()
      });

      expect(totalPopups).toBeGreaterThan(clientCount * popupsPerClient * 0.8); // At least 80% success

      // Clean up
      await testClients[0].closePopup();
    }, 60000);

    it('should handle system limits gracefully', async () => {
      const client = (await createClients(1))[0];
      const vscode = (await createVSCodeInstances(1))[0];

      let maxConcurrentPopups = 0;
      let errorStartsAt = 0;

      try {
        // Keep creating popups until we hit limits
        for (let i = 0; i < 1000; i++) {
          try {
            await client.showPopup({
              title: `Limit Test ${i}`,
              message: `Testing system limits`,
              type: 'info',
              timeout: 60000
            });
            maxConcurrentPopups = i + 1;
          } catch (error) {
            if (errorStartsAt === 0) {
              errorStartsAt = i;
            }
            break;
          }
        }

        console.log('System limits test:', {
          maxConcurrentPopups,
          errorStartsAt,
          serverStats: mockServer.getServerStats()
        });

        expect(maxConcurrentPopups).toBeGreaterThan(10); // Should handle at least 10
        
      } finally {
        // Clean up all popups
        await client.closePopup();
      }
    }, 120000);
  });
});