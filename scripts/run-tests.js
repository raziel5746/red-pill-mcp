#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// ANSI color codes for output formatting
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Test suite definitions
const testSuites = {
  all: {
    name: 'Complete Test Suite',
    description: 'Run all tests including unit, integration, e2e, and performance',
    command: 'npm',
    args: ['test'],
    timeout: 300000 // 5 minutes
  },
  unit: {
    name: 'Unit Tests',
    description: 'Run unit tests for individual components',
    command: 'npm',
    args: ['run', 'test:unit'],
    timeout: 60000 // 1 minute
  },
  integration: {
    name: 'Integration Tests',
    description: 'Run integration tests for MCP tools and interactions',
    command: 'npm',
    args: ['run', 'test:integration'],
    timeout: 120000 // 2 minutes
  },
  e2e: {
    name: 'End-to-End Tests',
    description: 'Run end-to-end scenarios with multi-client/instance tests',
    command: 'npm',
    args: ['run', 'test:e2e'],
    timeout: 180000 // 3 minutes
  },
  performance: {
    name: 'Performance Tests',
    description: 'Run performance and load testing suite',
    command: 'npm',
    args: ['run', 'test:performance'],
    timeout: 300000 // 5 minutes
  },
  coverage: {
    name: 'Coverage Report',
    description: 'Run tests and generate coverage report',
    command: 'npm',
    args: ['run', 'test:coverage'],
    timeout: 240000 // 4 minutes
  },
  quick: {
    name: 'Quick Tests',
    description: 'Run unit and integration tests only (faster)',
    command: 'npm',
    args: ['run', 'test:quick'],
    timeout: 90000 // 1.5 minutes
  },
  watch: {
    name: 'Watch Mode',
    description: 'Run tests in watch mode for development',
    command: 'npm',
    args: ['run', 'test:watch'],
    timeout: 0 // No timeout for watch mode
  },
  debug: {
    name: 'Debug Mode',
    description: 'Run tests with debug output and verbose logging',
    command: 'npm',
    args: ['run', 'test:debug'],
    timeout: 240000 // 4 minutes
  }
};

function printUsage() {
  console.log(`${colors.bright}Red Pill MCP Test Runner${colors.reset}\n`);
  console.log('Usage: node scripts/run-tests.js [suite] [options]\n');
  
  console.log(`${colors.bright}Available Test Suites:${colors.reset}`);
  Object.entries(testSuites).forEach(([key, suite]) => {
    console.log(`  ${colors.cyan}${key.padEnd(12)}${colors.reset} - ${suite.description}`);
  });
  
  console.log(`\n${colors.bright}Options:${colors.reset}`);
  console.log(`  ${colors.cyan}--help${colors.reset}      - Show this help message`);
  console.log(`  ${colors.cyan}--list${colors.reset}      - List all available test suites`);
  console.log(`  ${colors.cyan}--verbose${colors.reset}   - Enable verbose output`);
  console.log(`  ${colors.cyan}--no-coverage${colors.reset} - Skip coverage reporting`);
  console.log(`  ${colors.cyan}--parallel${colors.reset} - Run tests in parallel (Jest default)`);
  
  console.log(`\n${colors.bright}Examples:${colors.reset}`);
  console.log(`  ${colors.yellow}node scripts/run-tests.js unit${colors.reset}        # Run unit tests only`);
  console.log(`  ${colors.yellow}node scripts/run-tests.js all --verbose${colors.reset}  # Run all tests with verbose output`);
  console.log(`  ${colors.yellow}node scripts/run-tests.js coverage${colors.reset}      # Generate coverage report`);
  console.log(`  ${colors.yellow}node scripts/run-tests.js watch${colors.reset}        # Run in watch mode`);
}

function printTestSuites() {
  console.log(`${colors.bright}Available Test Suites:${colors.reset}\n`);
  
  Object.entries(testSuites).forEach(([key, suite]) => {
    console.log(`${colors.bright}${colors.cyan}${key}${colors.reset}`);
    console.log(`  Name: ${suite.name}`);
    console.log(`  Description: ${suite.description}`);
    console.log(`  Command: ${suite.command} ${suite.args.join(' ')}`);
    console.log(`  Timeout: ${suite.timeout === 0 ? 'No timeout' : `${suite.timeout / 1000}s`}`);
    console.log('');
  });
}

function runTests(suiteKey, options = {}) {
  const suite = testSuites[suiteKey];
  
  if (!suite) {
    console.error(`${colors.red}Error: Unknown test suite '${suiteKey}'${colors.reset}`);
    console.log(`\nAvailable suites: ${Object.keys(testSuites).join(', ')}`);
    process.exit(1);
  }

  console.log(`${colors.bright}${colors.blue}Starting: ${suite.name}${colors.reset}`);
  console.log(`${colors.cyan}Description: ${suite.description}${colors.reset}`);
  console.log(`${colors.cyan}Command: ${suite.command} ${suite.args.join(' ')}${colors.reset}\n`);

  const startTime = Date.now();
  
  // Prepare command arguments
  let args = [...suite.args];
  
  if (options.verbose) {
    args.push('--verbose');
  }
  
  if (options.noCoverage && args.includes('--coverage')) {
    args = args.filter(arg => arg !== '--coverage');
  }

  // Spawn the test process
  const testProcess = spawn(suite.command, args, {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd()
  });

  // Set up timeout if specified
  let timeoutId;
  if (suite.timeout > 0) {
    timeoutId = setTimeout(() => {
      console.log(`\n${colors.yellow}Test suite timed out after ${suite.timeout / 1000} seconds${colors.reset}`);
      testProcess.kill('SIGTERM');
      
      setTimeout(() => {
        testProcess.kill('SIGKILL');
      }, 5000);
    }, suite.timeout);
  }

  testProcess.on('close', (code) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n${colors.bright}Test Suite Completed${colors.reset}`);
    console.log(`Duration: ${duration}s`);
    
    if (code === 0) {
      console.log(`${colors.green}✅ All tests passed!${colors.reset}`);
      
      if (suite.name.includes('Coverage')) {
        console.log(`\n${colors.cyan}Coverage report generated in: coverage/index.html${colors.reset}`);
      }
    } else {
      console.log(`${colors.red}❌ Tests failed with exit code ${code}${colors.reset}`);
    }
    
    process.exit(code);
  });

  testProcess.on('error', (error) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    console.error(`${colors.red}Failed to start test process: ${error.message}${colors.reset}`);
    process.exit(1);
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}Terminating test suite...${colors.reset}`);
    testProcess.kill('SIGTERM');
    
    setTimeout(() => {
      testProcess.kill('SIGKILL');
      process.exit(1);
    }, 5000);
  });
}

function checkPrerequisites() {
  const fs = require('fs');
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.error(`${colors.red}Error: package.json not found. Please run from project root.${colors.reset}`);
    process.exit(1);
  }

  const jestConfigPath = path.join(process.cwd(), 'jest.config.js');
  if (!fs.existsSync(jestConfigPath)) {
    console.error(`${colors.red}Error: jest.config.js not found. Please ensure Jest is configured.${colors.reset}`);
    process.exit(1);
  }

  // Check if node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    console.error(`${colors.red}Error: node_modules not found. Please run 'npm install' first.${colors.reset}`);
    process.exit(1);
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }
  
  if (args.includes('--list') || args.includes('-l')) {
    printTestSuites();
    return;
  }

  // Check prerequisites
  checkPrerequisites();
  
  // Parse arguments
  const suiteKey = args.find(arg => !arg.startsWith('--')) || 'all';
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    noCoverage: args.includes('--no-coverage'),
    parallel: args.includes('--parallel')
  };

  // Display environment info
  console.log(`${colors.bright}Red Pill MCP Test Runner${colors.reset}`);
  console.log(`Node.js: ${process.version}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`Working Directory: ${process.cwd()}`);
  console.log('');

  // Run the tests
  runTests(suiteKey, options);
}

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error(`${colors.red}Unhandled Rejection at:${colors.reset}`, promise, `${colors.red}reason:${colors.reset}`, reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(`${colors.red}Uncaught Exception:${colors.reset}`, error);
  process.exit(1);
});

if (require.main === module) {
  main();
}