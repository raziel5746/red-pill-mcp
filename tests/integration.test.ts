import { describe, it, expect } from '@jest/globals';

describe('Red Pill MCP Extension Integration', () => {
  
  it('should have all required extension files', () => {
    // Basic smoke test to ensure core files exist
    expect(() => require('../out/extension.js')).not.toThrow();
  });

  it('should export activation function', () => {
    const extension = require('../out/extension.js');
    expect(typeof extension.activate).toBe('function');
    expect(typeof extension.deactivate).toBe('function');
  });

  it('should have required package.json configuration', () => {
    const packageJson = require('../package.json');
    
    expect(packageJson.name).toBe('red-pill-mcp');
    expect(packageJson.engines).toBeDefined();
    expect(packageJson.engines.vscode).toBeDefined();
    expect(packageJson.activationEvents).toBeDefined();
    expect(packageJson.main).toBe('./out/extension.js');
    expect(packageJson.contributes).toBeDefined();
  });

  it('should have correct dependencies', () => {
    const packageJson = require('../package.json');
    
    // Check for required runtime dependencies
    expect(packageJson.dependencies).toBeDefined();
    expect(packageJson.dependencies.uuid).toBeDefined();
    expect(packageJson.dependencies.ws).toBeDefined();
    
    // Check for required dev dependencies
    expect(packageJson.devDependencies).toBeDefined();
    expect(packageJson.devDependencies.typescript).toBeDefined();
    expect(packageJson.devDependencies['@types/vscode']).toBeDefined();
  });

  it('should have proper extension structure', () => {
    const fs = require('fs');
    const path = require('path');
    
    // Check that compiled output exists
    expect(fs.existsSync(path.join(__dirname, '../out/extension.js'))).toBe(true);
    
    // Check that source files exist
    expect(fs.existsSync(path.join(__dirname, '../src/extension.ts'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../src/types/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../src/managers/PopupManager.ts'))).toBe(true);
  });

});

describe('MCP Server Components', () => {
  
  it('should have MCP server implementation', () => {
    const fs = require('fs');
    const path = require('path');
    
    // Check MCP server structure
    expect(fs.existsSync(path.join(__dirname, '../src/mcp-server.ts'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../src/managers/PopupManager.ts'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../src/communication/McpBridge.ts'))).toBe(true);
  });

  it('should have required startup scripts', () => {
    const fs = require('fs');
    const path = require('path');
    
    expect(fs.existsSync(path.join(__dirname, '../scripts/start.sh'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../scripts/stop.sh'))).toBe(true);
  });

});