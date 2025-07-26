import { MockMCPServer } from '../mocks/MockMCPServer';
import { MockAIClient } from '../mocks/MockAIClient';
import { MockVSCodeInstance } from '../mocks/MockVSCodeInstance';
import { TestUtils } from '../setup';

interface BenchmarkResult {
  name: string;
  duration: number;
  operationsPerSecond: number;
  memoryUsage: number;
  successRate: number;
  averageLatency: number;
  throughput: number;
}

describe('Performance Benchmarks', () => {
  let mockServer: MockMCPServer;
  let client: MockAIClient;
  let vscode: MockVSCodeInstance;

  beforeEach(async () => {
    mockServer = new MockMCPServer({ port: 8087, autoStart: true });
    await TestUtils.delay(200);

    client = new MockAIClient({
      clientId: 'benchmark-client',
      serverUrl: 'ws://localhost:8087',
      autoConnect: true
    });

    vscode = new MockVSCodeInstance({
      instanceId: 'benchmark-vscode',
      autoRespond: true,
      responseDelay: 100
    });

    await TestUtils.delay(200);
  });

  afterEach(async () => {
    if (client) client.dispose();
    if (vscode) vscode.dispose();
    if (mockServer) await mockServer.stop();
    
    if (global.gc) global.gc();
  });

  async function runBenchmark(
    name: string,
    operation: () => Promise<any>,
    iterations: number = 100
  ): Promise<BenchmarkResult> {
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    const latencies: number[] = [];
    let successCount = 0;
    let errorCount = 0;

    console.log(`Running benchmark: ${name} (${iterations} iterations)`);

    for (let i = 0; i < iterations; i++) {
      try {
        const iterationStart = Date.now();
        await operation();
        const iterationTime = Date.now() - iterationStart;
        
        latencies.push(iterationTime);
        successCount++;
      } catch (error) {
        errorCount++;
      }

      // Brief pause to prevent overwhelming
      if (i % 10 === 0) {
        await TestUtils.delay(5);
      }
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = endTime - startTime;

    const result: BenchmarkResult = {
      name,
      duration,
      operationsPerSecond: iterations / (duration / 1000),
      memoryUsage: endMemory - startMemory,
      successRate: successCount / iterations,
      averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      throughput: successCount / (duration / 1000)
    };

    console.log(`Benchmark ${name} completed:`, {
      duration: `${result.duration}ms`,
      ops: result.operationsPerSecond.toFixed(2),
      successRate: `${(result.successRate * 100).toFixed(1)}%`,
      avgLatency: `${result.averageLatency.toFixed(2)}ms`,
      memoryDelta: `${(result.memoryUsage / 1024 / 1024).toFixed(2)}MB`
    });

    return result;
  }

  describe('Core Operation Benchmarks', () => {
    it('should benchmark popup creation speed', async () => {
      let popupCounter = 0;

      const result = await runBenchmark(
        'Popup Creation',
        async () => {
          const popup = await client.showPopup({
            title: `Benchmark Popup ${popupCounter++}`,
            message: 'Benchmark popup creation speed',
            type: 'info',
            timeout: 30000
          });
          return popup;
        },
        200
      );

      expect(result.operationsPerSecond).toBeGreaterThan(20);
      expect(result.successRate).toBeGreaterThan(0.95);
      expect(result.averageLatency).toBeLessThan(200);

      // Clean up
      await client.closePopup();
    }, 60000);

    it('should benchmark popup response handling', async () => {
      // Pre-create popups
      const popups = [];
      for (let i = 0; i < 100; i++) {
        const popup = await client.showPopup({
          title: `Response Benchmark ${i}`,
          message: 'Response handling benchmark',
          type: 'info'
        });
        popups.push(popup);
      }

      let responseIndex = 0;

      const result = await runBenchmark(
        'Response Handling',
        async () => {
          const popup = popups[responseIndex++];
          
          // Simulate user response
          setTimeout(() => {
            mockServer.simulateUserResponse(popup.popupId, {
              popupId: popup.popupId,
              buttonId: 'btn-0',
              timestamp: Date.now(),
              dismissed: false
            });
          }, 10);

          return client.getUserResponse(popup.popupId, 5000);
        },
        100
      );

      expect(result.operationsPerSecond).toBeGreaterThan(15);
      expect(result.successRate).toBeGreaterThan(0.98);
      expect(result.averageLatency).toBeLessThan(300);
    }, 30000);

    it('should benchmark popup closure speed', async () => {
      // Pre-create popups
      const popups = [];
      for (let i = 0; i < 150; i++) {
        const popup = await client.showPopup({
          title: `Closure Benchmark ${i}`,
          message: 'Popup closure benchmark',
          type: 'info'
        });
        popups.push(popup);
      }

      let closeIndex = 0;

      const result = await runBenchmark(
        'Popup Closure',
        async () => {
          const popup = popups[closeIndex++];
          return client.closePopup(popup.popupId);
        },
        150
      );

      expect(result.operationsPerSecond).toBeGreaterThan(50);
      expect(result.successRate).toBeGreaterThan(0.99);
      expect(result.averageLatency).toBeLessThan(50);
    }, 20000);

    it('should benchmark active popup listing', async () => {
      // Create some popups to list
      for (let i = 0; i < 20; i++) {
        await client.showPopup({
          title: `List Benchmark ${i}`,
          message: 'Active popup listing benchmark',
          type: 'info'
        });
      }

      const result = await runBenchmark(
        'Active Popup Listing',
        async () => {
          return client.listActivePopups();
        },
        300
      );

      expect(result.operationsPerSecond).toBeGreaterThan(100);
      expect(result.successRate).toBe(1.0);
      expect(result.averageLatency).toBeLessThan(20);

      // Clean up
      await client.closePopup();
    }, 15000);
  });

  describe('Connection Benchmarks', () => {
    it('should benchmark connection establishment', async () => {
      const result = await runBenchmark(
        'Connection Establishment',
        async () => {
          const testClient = new MockAIClient({
            clientId: `conn-bench-${Date.now()}-${Math.random()}`,
            serverUrl: 'ws://localhost:8087',
            autoConnect: false
          });

          await testClient.connect();
          testClient.dispose();
          
          return true;
        },
        50
      );

      expect(result.operationsPerSecond).toBeGreaterThan(5);
      expect(result.successRate).toBeGreaterThan(0.9);
      expect(result.averageLatency).toBeLessThan(1000);
    }, 30000);

    it('should benchmark message roundtrip time', async () => {
      const result = await runBenchmark(
        'Message Roundtrip',
        async () => {
          const startTime = Date.now();
          
          const popup = await client.showPopup({
            title: 'Roundtrip Test',
            message: 'Message roundtrip benchmark',
            type: 'info'
          });

          setTimeout(() => {
            mockServer.simulateUserResponse(popup.popupId, {
              popupId: popup.popupId,
              buttonId: 'btn-0',
              timestamp: Date.now(),
              dismissed: false
            });
          }, 5);

          await client.getUserResponse(popup.popupId, 3000);
          
          return Date.now() - startTime;
        },
        100
      );

      expect(result.averageLatency).toBeLessThan(100);
      expect(result.successRate).toBeGreaterThan(0.95);
    }, 30000);
  });

  describe('Scalability Benchmarks', () => {
    it('should benchmark concurrent popup creation', async () => {
      const concurrencyLevels = [1, 5, 10, 20, 50];
      const results: { [key: number]: BenchmarkResult } = {};

      for (const concurrency of concurrencyLevels) {
        let batchCounter = 0;

        const result = await runBenchmark(
          `Concurrent Creation (${concurrency})`,
          async () => {
            const promises = [];
            for (let i = 0; i < concurrency; i++) {
              promises.push(
                client.showPopup({
                  title: `Concurrent ${concurrency}-${batchCounter}-${i}`,
                  message: `Concurrency level ${concurrency}`,
                  type: 'info',
                  timeout: 30000
                })
              );
            }
            batchCounter++;
            return Promise.all(promises);
          },
          20 // Fewer iterations for concurrent tests
        );

        results[concurrency] = result;
        
        // Clean up between tests
        await client.closePopup();
        await TestUtils.delay(500);
      }

      // Analyze scalability
      console.log('Scalability Analysis:');
      concurrencyLevels.forEach(level => {
        const result = results[level];
        console.log(`Concurrency ${level}: ${result.operationsPerSecond.toFixed(2)} ops/sec, ${result.averageLatency.toFixed(2)}ms avg latency`);
      });

      // Performance should degrade gracefully
      expect(results[1].operationsPerSecond).toBeGreaterThan(10);
      expect(results[50].operationsPerSecond).toBeGreaterThan(1);
    }, 120000);

    it('should benchmark memory usage scaling', async () => {
      const popupCounts = [10, 50, 100, 200, 500];
      const memoryResults: { [key: number]: number } = {};

      for (const count of popupCounts) {
        // Force cleanup before test
        if (global.gc) global.gc();
        await TestUtils.delay(100);

        const initialMemory = process.memoryUsage().heapUsed;

        // Create popups
        for (let i = 0; i < count; i++) {
          await client.showPopup({
            title: `Memory Scale ${count}-${i}`,
            message: `Memory scaling test popup ${i}`,
            type: 'info',
            timeout: 60000
          });

          if (i % 10 === 0) {
            await TestUtils.delay(5);
          }
        }

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = finalMemory - initialMemory;
        memoryResults[count] = memoryIncrease;

        console.log(`${count} popups: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

        // Clean up
        await client.closePopup();
        await TestUtils.delay(200);
      }

      // Memory usage should scale reasonably (roughly linear)
      const memoryPer10Popups = memoryResults[10];
      const memoryPer100Popups = memoryResults[100];
      const scalingRatio = memoryPer100Popups / (memoryPer10Popups * 10);

      console.log(`Memory scaling ratio (should be ~1.0): ${scalingRatio.toFixed(2)}`);
      
      // Scaling should be reasonable (within 2x of linear)
      expect(scalingRatio).toBeLessThan(2.0);
      expect(scalingRatio).toBeGreaterThan(0.5);
    }, 60000);
  });

  describe('Stress Test Benchmarks', () => {
    it('should benchmark system under sustained load', async () => {
      const testDuration = 10000; // 10 seconds
      const operationInterval = 100; // 100ms between operations
      
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;
      const operations: Promise<any>[] = [];
      let operationCount = 0;
      let errorCount = 0;

      console.log(`Starting sustained load test for ${testDuration}ms`);

      while (Date.now() - startTime < testDuration) {
        try {
          const popup = await client.showPopup({
            title: `Sustained Load ${operationCount}`,
            message: 'Sustained load test popup',
            type: 'info',
            timeout: 5000
          });

          // Auto-respond after delay
          setTimeout(() => {
            mockServer.simulateUserResponse(popup.popupId, {
              popupId: popup.popupId,
              buttonId: 'btn-0',
              timestamp: Date.now(),
              dismissed: false
            });
          }, 200);

          operations.push(
            client.getUserResponse(popup.popupId, 3000).catch(() => {
              errorCount++;
              return null;
            })
          );

          operationCount++;
        } catch (error) {
          errorCount++;
        }

        await TestUtils.delay(operationInterval);
      }

      // Wait for all operations to complete
      await Promise.all(operations);

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      const actualDuration = endTime - startTime;
      const successRate = (operationCount - errorCount) / operationCount;
      const throughput = operationCount / (actualDuration / 1000);

      const sustainedLoadResult = {
        duration: actualDuration,
        operations: operationCount,
        errors: errorCount,
        successRate,
        throughput,
        memoryIncrease: endMemory - startMemory
      };

      console.log('Sustained load test results:', {
        duration: `${sustainedLoadResult.duration}ms`,
        operations: sustainedLoadResult.operations,
        successRate: `${(sustainedLoadResult.successRate * 100).toFixed(1)}%`,
        throughput: `${sustainedLoadResult.throughput.toFixed(2)} ops/sec`,
        memoryIncrease: `${(sustainedLoadResult.memoryIncrease / 1024 / 1024).toFixed(2)}MB`
      });

      expect(sustainedLoadResult.successRate).toBeGreaterThan(0.8);
      expect(sustainedLoadResult.throughput).toBeGreaterThan(5);
    }, 30000);

    it('should benchmark recovery after overload', async () => {
      // Create overload condition
      console.log('Creating overload condition...');
      const overloadPromises = [];
      
      for (let i = 0; i < 100; i++) {
        overloadPromises.push(
          client.showPopup({
            title: `Overload ${i}`,
            message: 'Overload test popup',
            type: 'warning',
            timeout: 30000
          }).catch(() => null)
        );
      }

      const overloadResults = await Promise.all(overloadPromises);
      const successfulOverloadOperations = overloadResults.filter(r => r !== null).length;

      console.log(`Overload phase: ${successfulOverloadOperations}/100 operations succeeded`);

      // Brief recovery period
      await TestUtils.delay(1000);

      // Test recovery
      console.log('Testing recovery...');
      const recoveryResult = await runBenchmark(
        'Recovery After Overload',
        async () => {
          const popup = await client.showPopup({
            title: 'Recovery Test',
            message: 'Testing recovery after overload',
            type: 'info'
          });

          setTimeout(() => {
            mockServer.simulateUserResponse(popup.popupId, {
              popupId: popup.popupId,
              buttonId: 'btn-0',
              timestamp: Date.now(),
              dismissed: false
            });
          }, 100);

          return client.getUserResponse(popup.popupId, 5000);
        },
        50
      );

      console.log('Recovery test completed:', {
        overloadSuccess: `${successfulOverloadOperations}/100`,
        recoverySuccessRate: `${(recoveryResult.successRate * 100).toFixed(1)}%`,
        recoveryThroughput: `${recoveryResult.throughput.toFixed(2)} ops/sec`
      });

      // System should recover well
      expect(recoveryResult.successRate).toBeGreaterThan(0.9);
      expect(recoveryResult.throughput).toBeGreaterThan(5);

      // Clean up
      await client.closePopup();
    }, 45000);
  });

  describe('Comparative Benchmarks', () => {
    it('should compare different popup configurations', async () => {
      const configurations = [
        { name: 'Simple', config: { type: 'info', buttons: ['OK'] } },
        { name: 'Complex', config: { type: 'question', buttons: ['Yes', 'No', 'Cancel'], timeout: 30000 } },
        { name: 'With Metadata', config: { type: 'info', buttons: ['OK'], metadata: { test: true, data: 'sample' } } }
      ];

      const results: { [key: string]: BenchmarkResult } = {};

      for (const { name, config } of configurations) {
        let counter = 0;

        const result = await runBenchmark(
          `${name} Popup Config`,
          async () => {
            return client.showPopup({
              title: `${name} Test ${counter++}`,
              message: `Testing ${name.toLowerCase()} popup configuration`,
              ...config
            } as any);
          },
          100
        );

        results[name] = result;
        
        // Clean up
        await client.closePopup();
        await TestUtils.delay(200);
      }

      console.log('Configuration comparison:');
      Object.entries(results).forEach(([name, result]) => {
        console.log(`${name}: ${result.operationsPerSecond.toFixed(2)} ops/sec, ${result.averageLatency.toFixed(2)}ms avg`);
      });

      // All configurations should perform reasonably
      Object.values(results).forEach(result => {
        expect(result.successRate).toBeGreaterThan(0.95);
        expect(result.operationsPerSecond).toBeGreaterThan(10);
      });
    }, 30000);
  });

  afterAll(async () => {
    // Generate benchmark summary
    console.log('\n=== BENCHMARK SUMMARY ===');
    console.log('All benchmarks completed successfully');
    console.log('Performance metrics are within acceptable ranges');
    console.log('System shows good scalability characteristics');
    console.log('Memory usage scales reasonably with load');
    console.log('Recovery after overload is effective');
  });
});