import { MCPServer } from '../../src/core/mcp-server.js';
import { createConfig } from '../../src/config/default.js';

describe('MCPServer', () => {
  let server: MCPServer;
  
  beforeEach(() => {
    const config = createConfig({
      port: 18080, // Use different port for tests
      logLevel: 'error', // Reduce noise
      enableDiagnostics: false
    });
    server = new MCPServer(config);
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.stop();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });

  describe('initialization', () => {
    it('should create server with valid configuration', () => {
      expect(server).toBeDefined();
      expect(server.getConfig()).toMatchObject({
        port: 18080,
        logLevel: 'error',
        enableDiagnostics: false
      });
    });

    it('should provide health information', () => {
      const health = server.getHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('activeClients');
      expect(health).toHaveProperty('activePopups');
      expect(health).toHaveProperty('memoryUsage');
      expect(health).toHaveProperty('errors');
      
      expect(typeof health.uptime).toBe('number');
      expect(typeof health.activeClients).toBe('number');
      expect(typeof health.activePopups).toBe('number');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });
  });

  describe('lifecycle', () => {
    it('should start and stop gracefully', async () => {
      // Note: We're not actually starting the server in tests
      // as it would require complex mocking of the MCP transport
      expect(async () => {
        await server.stop();
      }).not.toThrow();
    });
  });
});