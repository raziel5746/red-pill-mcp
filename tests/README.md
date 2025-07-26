# Red Pill MCP - Comprehensive Test Suite

This directory contains a comprehensive test suite for the Red Pill MCP VS Code extension and MCP server project. The test suite validates the entire AI→MCP→VS Code→User→AI communication flow across various scenarios.

## 📁 Test Structure

```
tests/
├── setup.ts                          # Global test configuration and utilities
├── mocks/                            # Mock implementations for testing
│   ├── MockAIClient.ts               # Simulates AI client connections
│   ├── MockVSCodeInstance.ts         # Simulates VS Code extension instances
│   └── MockMCPServer.ts              # Mock MCP server for testing
├── fixtures/                         # Test data and scenarios
│   └── TestScenarios.ts              # Pre-defined test scenarios and data
├── unit/                             # Unit tests for individual components
│   ├── managers/
│   │   └── PopupManager.test.ts      # PopupManager component tests
│   ├── communication/
│   │   └── McpBridge.test.ts         # MCP communication bridge tests
│   └── ui/
│       └── PopupWebviewProvider.test.ts # Webview provider tests
├── integration/                       # Integration tests for tool interactions
│   ├── mcp-tools.test.ts             # MCP tool implementations
│   └── popup-timeout-concurrency.test.ts # Timeout and concurrency tests
├── e2e/                              # End-to-end test scenarios
│   ├── multi-client-scenarios.test.ts # Multi-client/instance scenarios
│   └── connection-scenarios.test.ts   # Connection failure/recovery tests
├── performance/                       # Performance and load testing
│   ├── load-testing.test.ts          # Load testing scenarios
│   └── benchmarks.test.ts            # Performance benchmarks
└── core/                             # Legacy/existing tests
    └── mcp-server.test.ts            # Basic MCP server tests
```

## 🧪 Test Categories

### Unit Tests
- **PopupManager**: Tests popup creation, management, timeout handling, and cleanup
- **McpBridge**: Tests WebSocket communication, message handling, and connection management
- **PopupWebviewProvider**: Tests HTML generation, content formatting, and security measures

### Integration Tests
- **MCP Tools**: Tests all MCP tool implementations (show_popup, get_user_response, close_popup, list_active_popups)
- **Timeout & Concurrency**: Tests popup timeout behavior and concurrent popup management

### End-to-End Tests
- **Multi-Client Scenarios**: Tests various client/instance combinations:
  - Single AI client → Single VS Code instance
  - Multiple AI clients → Single VS Code instance
  - Single AI client → Multiple VS Code instances
  - Multiple AI clients → Multiple VS Code instances
- **Connection Scenarios**: Tests connection failures, recovery, and error handling

### Performance Tests
- **Load Testing**: Tests system behavior under various load conditions
- **Benchmarks**: Measures performance metrics for core operations

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ installed
- All project dependencies installed (`npm install`)
- Jest testing framework configured

### Running All Tests
```bash
# Run complete test suite
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Running Specific Test Categories
```bash
# Unit tests only
npm test -- tests/unit

# Integration tests only
npm test -- tests/integration

# End-to-end tests only
npm test -- tests/e2e

# Performance tests only
npm test -- tests/performance
```

### Running Individual Test Files
```bash
# Run popup manager tests
npm test -- tests/unit/managers/PopupManager.test.ts

# Run multi-client scenarios
npm test -- tests/e2e/multi-client-scenarios.test.ts

# Run performance benchmarks
npm test -- tests/performance/benchmarks.test.ts
```

## 🔧 Test Configuration

### Jest Configuration
The test suite uses Jest with TypeScript support. Key configuration options:

```javascript
// jest.config.js
{
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,    // 30 second timeout for integration tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // ... other options
}
```

### Environment Variables
Some tests can be configured with environment variables:

```bash
# Increase test timeout for slow environments
JEST_TIMEOUT=60000 npm test

# Enable verbose logging
DEBUG=true npm test

# Skip performance tests (for CI)
SKIP_PERFORMANCE=true npm test
```

## 🎯 Test Scenarios

### Basic Functionality Tests
- ✅ Popup creation and display
- ✅ User response handling
- ✅ Popup timeout behavior
- ✅ Popup closure and cleanup
- ✅ Active popup listing

### Multi-Client Communication Tests
- ✅ Sequential popup requests from multiple clients
- ✅ Concurrent popup requests
- ✅ Instance-specific popup targeting
- ✅ Cross-client popup management

### Connection Reliability Tests
- ✅ Server shutdown during active popups
- ✅ Client disconnection handling
- ✅ Connection recovery mechanisms
- ✅ Network timeout scenarios
- ✅ Partial message handling

### Performance Tests
- ✅ High-frequency popup creation (100+ popups)
- ✅ Concurrent client load (20+ clients)
- ✅ Memory usage efficiency
- ✅ Response time benchmarks
- ✅ System limits testing

### Error Handling Tests
- ✅ Invalid popup configurations
- ✅ Duplicate popup IDs
- ✅ Response to non-existent popups
- ✅ Maximum concurrent popup limits
- ✅ Malformed message handling

## 📊 Mock Components

### MockAIClient
Simulates an AI client connecting to the MCP server:
- WebSocket connection management
- MCP tool calling (show_popup, get_user_response, etc.)
- Conversation flow simulation
- Connection state tracking

```typescript
const client = new MockAIClient({
  clientId: 'test-client',
  serverUrl: 'ws://localhost:8080',
  autoConnect: true,
  responseDelay: 100
});

// Show popup
const popup = await client.showPopup({
  title: 'Test Popup',
  message: 'Testing the system',
  type: 'info'
});

// Get user response
const response = await client.getUserResponse(popup.popupId, 5000);
```

### MockVSCodeInstance
Simulates a VS Code extension instance:
- Popup reception and response
- Auto-response configuration
- Connection simulation
- Multi-instance scenarios

```typescript
const vscode = new MockVSCodeInstance({
  instanceId: 'test-vscode',
  autoRespond: true,
  responseDelay: 500
});

// Manual response simulation
vscode.simulateButtonClick(popupId, 'ok');
vscode.simulateDismiss(popupId);
vscode.simulateTimeout(popupId);
```

### MockMCPServer
Provides a test MCP server implementation:
- WebSocket server functionality
- Client connection management
- Tool request handling
- Response simulation

```typescript
const server = new MockMCPServer({ 
  port: 8080, 
  autoStart: true 
});

// Simulate user response
server.simulateUserResponse(popupId, {
  popupId,
  buttonId: 'ok',
  timestamp: Date.now(),
  dismissed: false
});
```

## 🐛 Debugging Tests

### Enabling Debug Logging
```bash
# Enable debug output
DEBUG=true npm test

# Run specific test with debugging
DEBUG=true npm test -- tests/unit/managers/PopupManager.test.ts --verbose
```

### Common Debugging Techniques
1. **Use `console.log` in tests**: Temporary debugging output
2. **Check mock call history**: Verify mock function calls
3. **Add delays**: Use `TestUtils.delay()` to debug timing issues
4. **Monitor connections**: Check WebSocket connection states

### Test Isolation Issues
If tests are interfering with each other:
1. Ensure proper cleanup in `afterEach` blocks
2. Use different ports for different test files
3. Clear global state between tests
4. Dispose of all mock objects

## 📈 Performance Expectations

### Baseline Performance Metrics
- **Popup Creation**: >20 operations/second
- **Response Handling**: >15 operations/second  
- **Popup Closure**: >50 operations/second
- **Connection Establishment**: >5 connections/second
- **Memory Usage**: <100MB increase for 200 popups

### Load Testing Limits
- **Concurrent Popups**: System should handle 20+ concurrent popups
- **Multiple Clients**: Support 10+ simultaneous AI clients
- **Sustained Load**: Maintain >80% success rate under continuous load
- **Recovery**: System should recover within 2 seconds after overload

## ❗ Troubleshooting

### Common Test Failures

#### WebSocket Connection Issues
```
Error: WebSocket connection failed
```
**Solution**: Ensure mock server is started and ports are available

#### Timeout Errors
```
Error: Test timeout exceeded
```
**Solution**: Increase Jest timeout or check for hanging promises

#### Memory Issues
```
Error: JavaScript heap out of memory
```
**Solution**: Run fewer concurrent tests or increase Node.js memory limit

#### Mock Setup Problems
```
Error: Cannot read property of undefined
```
**Solution**: Verify mock setup in `beforeEach` blocks

### Environment-Specific Issues

#### Windows
- Use appropriate path separators
- Watch for firewall blocking WebSocket connections
- Ensure ports are not blocked by antivirus

#### CI/CD Environments
- Increase timeouts for slower environments
- Skip performance tests if needed
- Use headless mode for UI tests

## 🔍 Test Coverage

### Coverage Reports
Generate coverage reports with:
```bash
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory with:
- HTML report: `coverage/index.html`
- LCOV data: `coverage/lcov.info`
- JSON data: `coverage/coverage-final.json`

### Coverage Expectations
Target coverage levels:
- **Statements**: >90%
- **Branches**: >85%
- **Functions**: >90%
- **Lines**: >90%

## 🚢 Continuous Integration

### GitHub Actions Example
```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v2
        with:
          file: ./coverage/lcov.info
```

### Test Strategies for CI
1. **Parallel Execution**: Run test categories in parallel
2. **Fail Fast**: Stop on first failure for quick feedback
3. **Retry Logic**: Retry flaky tests automatically
4. **Performance Baseline**: Compare against baseline metrics

## 📝 Contributing to Tests

### Adding New Tests
1. **Choose appropriate category**: Unit, integration, e2e, or performance
2. **Follow naming conventions**: `describe` blocks for components, `it` blocks for specific behaviors
3. **Use proper setup/teardown**: Ensure tests are isolated
4. **Include performance considerations**: Don't create tests that are too slow

### Test Writing Guidelines
1. **Descriptive test names**: Clearly state what is being tested
2. **Arrange-Act-Assert pattern**: Structure tests clearly
3. **Mock external dependencies**: Use provided mock components
4. **Test edge cases**: Include error conditions and boundary values
5. **Document complex tests**: Add comments for complex test logic

### Mock Component Extensions
When extending mock components:
1. **Maintain compatibility**: Don't break existing functionality
2. **Add proper typing**: Use TypeScript interfaces
3. **Include documentation**: Document new features
4. **Test the mocks**: Ensure mock behavior is correct

## 📋 Test Checklist

Before submitting code changes, ensure:

- [ ] All existing tests pass
- [ ] New functionality has corresponding tests
- [ ] Test coverage meets requirements (>90%)
- [ ] Performance tests pass within expected limits
- [ ] Integration tests cover new MCP tools
- [ ] Error handling scenarios are tested
- [ ] Documentation is updated

## 🆘 Getting Help

### Resources
- **Jest Documentation**: https://jestjs.io/docs/getting-started
- **TypeScript Testing**: https://kulshekhar.github.io/ts-jest/
- **WebSocket Testing**: https://github.com/websockets/ws

### Common Questions

**Q: Tests are running slowly, how can I speed them up?**
A: Use `--maxWorkers` to limit parallel execution, skip performance tests with environment variables, or run specific test files instead of the full suite.

**Q: Mock connections aren't working, what should I check?**
A: Verify port availability, check firewall settings, ensure proper async/await usage, and confirm mock server startup timing.

**Q: How do I test timeout scenarios?**
A: Use `jest.useFakeTimers()` and `jest.advanceTimersByTime()` for controlled timing, or set very short timeouts for faster test execution.

**Q: Performance tests are failing in CI, what should I do?**
A: CI environments are often slower - increase timeout values, reduce operation counts, or skip performance tests in CI using environment variables.

---

This test suite provides comprehensive coverage of the Red Pill MCP system, ensuring reliability, performance, and correctness across all communication scenarios between AI clients, MCP servers, and VS Code instances.