# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Red Pill MCP is a VS Code extension that enables AI-to-User popup communication via the Model Context Protocol (MCP). The system consists of two main components:

1. **MCP Server** (`src/core/mcp-server.ts`) - Handles AI client connections and message routing
2. **VS Code Extension** (`src/extension.ts`) - Displays popups and manages user interactions

The architecture bridges AI assistants with VS Code through WebSocket connections, allowing AI clients to show interactive popups and receive user responses.

## Development Commands

```bash
# Build the project
npm run compile

# Build with watch mode for development
npm run watch

# Start the MCP server
npm run start-server

# Linting
npm run lint

# Testing
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e           # End-to-end tests
npm run test:performance   # Performance tests (2min timeout)
npm run test:coverage      # With coverage report
npm run test:watch         # Watch mode
npm run test:ci            # CI mode with coverage
npm run test:debug         # Debug mode with verbose output
npm run test:quick         # Quick tests (unit + integration, 10s timeout)

# Package extension
npm run package
```

## Architecture

### Core Components

- **MCPServer** (`src/core/mcp-server.ts`) - Main MCP protocol server implementation using @modelcontextprotocol/sdk
- **SessionManager** (`src/services/session-manager.ts`) - Manages AI client and VS Code instance connections
- **PopupManager** (`src/services/popup-manager.ts`) - Handles popup lifecycle and state management
- **MessageRouter** (`src/services/message-router.ts`) - Routes messages between AI clients and VS Code instances
- **HealthMonitor** (`src/services/health-monitor.ts`) - System health monitoring and diagnostics

### Extension Components

- **Extension** (`src/extension.ts`) - VS Code extension entry point and lifecycle management
- **PopupManager** (`src/managers/PopupManager.ts`) - Extension-side popup management
- **ConfigManager** (`src/managers/ConfigManager.ts`) - Configuration handling
- **PopupWebviewProvider** (`src/ui/PopupWebviewProvider.ts`) - Webview rendering for popups

### Communication Flow

1. AI clients connect to MCP server via HTTP/SSE transport
2. VS Code extensions connect via WebSocket (port + 1)
3. AI clients use MCP tools (`show_popup`, `get_user_response`, etc.)
4. Server routes popup requests to appropriate VS Code instances
5. VS Code displays popups and sends responses back through the router

### MCP Tools Available

- `show_popup` - Display popup with configurable options (info, warning, error, question, input types)
- `get_user_response` - Wait for and retrieve user responses
- `close_popup` - Programmatically close popups
- `list_active_popups` - List currently active popups

## Testing Framework

Uses Jest with TypeScript support. Test structure:
- `tests/unit/` - Component unit tests
- `tests/integration/` - Cross-component integration tests  
- `tests/e2e/` - End-to-end connection scenarios
- `tests/performance/` - Load testing and benchmarks
- `tests/mocks/` - Mock implementations for testing

Key test files to understand system behavior:
- `tests/e2e/connection-scenarios.test.ts` - Client connection flows
- `tests/integration/popup-timeout-concurrency.test.ts` - Popup management edge cases

## Configuration

The extension uses VS Code workspace settings:
- `redPillMcp.mcpServerUrl` - Server WebSocket URL (default: ws://localhost:8080)
- `redPillMcp.autoConnect` - Auto-connect on startup
- `redPillMcp.popupTimeout` - Default popup timeout (30s)
- `redPillMcp.maxConcurrentPopups` - Max concurrent popups (3)
- `redPillMcp.logLevel` - Logging level

Server configuration via environment variables or config files (see README.md).

## Key Implementation Details

- Uses Zod schemas for popup options validation (`src/types/index.ts`)
- Dual popup instance types: `ServerPopupInstance` (server) and `PopupInstance` (extension)
- WebSocket communication on port+1 for VS Code extensions
- Error handling with comprehensive ErrorHandler utility
- Session management with heartbeat monitoring
- TypeScript compilation to `out/` directory with source maps