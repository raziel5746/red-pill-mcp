# Red Pill MCP Server

A robust Model Context Protocol (MCP) server that bridges AI Assistants with VS Code extensions for popup communication and seamless interaction.

## Features

- **MCP Protocol Compliance**: Full implementation of MCP specification
- **Multi-Client Support**: Handle multiple simultaneous AI client connections
- **VS Code Integration**: Direct communication with VS Code extensions via WebSocket
- **Popup Management**: Show, manage, and respond to popups in VS Code
- **Message Routing**: Intelligent routing between AI clients and VS Code instances
- **Health Monitoring**: Built-in diagnostics and health checking
- **Error Recovery**: Comprehensive error handling and automatic recovery
- **Port Management**: Automatic port conflict resolution
- **Session Management**: Robust connection lifecycle management

## Quick Start

### Prerequisites

- Node.js 18.0 or later
- npm or yarn package manager

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd red-pill-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start
```

### Development Mode

```bash
# Start in development mode with hot reload
npm run dev

# Or use the start script
./scripts/start.sh --dev
```

## Configuration

### Environment Variables

```bash
# Server Configuration
MCP_PORT=8080                    # Main server port
MCP_MAX_CLIENTS=50              # Maximum concurrent clients
MCP_LOG_LEVEL=info              # Log level: debug, info, warn, error

# Popup Configuration
MCP_POPUP_TIMEOUT=30000         # Default popup timeout (ms)

# Health Monitoring
MCP_HEARTBEAT_INTERVAL=10000    # Heartbeat interval (ms)
MCP_ENABLE_DIAGNOSTICS=true     # Enable health diagnostics

# CORS Configuration
MCP_CORS_ENABLED=true           # Enable CORS
MCP_CORS_ORIGINS=*              # Allowed origins (comma-separated)
```

### Configuration File

Create a configuration file at `config/production.json`:

```json
{
  "port": 8080,
  "maxClients": 50,
  "popupTimeout": 30000,
  "heartbeatInterval": 10000,
  "logLevel": "info",
  "enableDiagnostics": true,
  "cors": {
    "enabled": true,
    "origins": ["*"]
  }
}
```

## API Reference

### Tools

The MCP server provides the following tools for AI clients:

#### `show_popup`

Display a popup in VS Code with text and options.

```json
{
  "name": "show_popup",
  "arguments": {
    "vscodeInstanceId": "optional-instance-id",
    "options": {
      "title": "Popup Title",
      "message": "Popup message content",
      "type": "info|warning|error|question|input",
      "buttons": ["OK", "Cancel"],
      "defaultButton": "OK",
      "timeout": 30000,
      "modal": true,
      "inputPlaceholder": "Enter value..."
    }
  }
}
```

#### `get_user_response`

Wait for and return user response from a popup.

```json
{
  "name": "get_user_response",
  "arguments": {
    "popupId": "optional-popup-id",
    "timeout": 30000
  }
}
```

#### `close_popup`

Programmatically close popups.

```json
{
  "name": "close_popup",
  "arguments": {
    "popupId": "optional-popup-id",
    "vscodeInstanceId": "optional-instance-id"
  }
}
```

#### `list_active_popups`

List current active popups.

```json
{
  "name": "list_active_popups",
  "arguments": {
    "vscodeInstanceId": "optional-instance-id"
  }
}
```

## VS Code Extension Integration

### WebSocket Connection

VS Code extensions connect via WebSocket on port `MCP_PORT + 1` (default: 8081).

### Connection Protocol

1. **Connect**: Open WebSocket connection to `ws://localhost:8081`
2. **Identify**: Send identification message
3. **Receive**: Handle incoming popup requests
4. **Respond**: Send user responses back to server

### Message Format

#### Identification Message (VS Code → Server)

```json
{
  "type": "identify",
  "payload": {
    "type": "vscode",
    "instanceId": "unique-instance-id",
    "version": "1.0.0",
    "workspaceName": "My Project",
    "capabilities": ["popup_management"]
  }
}
```

#### Show Popup (Server → VS Code)

```json
{
  "type": "show_popup",
  "payload": {
    "popupId": "popup-123",
    "options": {
      "title": "Confirmation",
      "message": "Are you sure?",
      "type": "question",
      "buttons": ["Yes", "No"]
    },
    "aiClientId": "ai-client-456"
  }
}
```

#### Popup Response (VS Code → Server)

```json
{
  "type": "popup_response",
  "payload": {
    "popupId": "popup-123",
    "result": {
      "button": "Yes"
    }
  }
}
```

## Deployment

### Production Deployment

```bash
# Build for production
npm run build

# Start with production configuration
./scripts/start.sh --config config/production.json

# Or start as daemon
./scripts/start.sh --daemon
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY config ./config

EXPOSE 8080 8081

CMD ["node", "dist/index.js"]
```

### Systemd Service

```bash
# Install as systemd service
sudo cp scripts/red-pill-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable red-pill-mcp
sudo systemctl start red-pill-mcp
```

## Monitoring and Health

### Health Endpoint

The server provides health information via the MCP protocol:

```bash
# Check server health
curl -X POST http://localhost:8080/health
```

### Logs

Logs are written to:
- Console output (configurable level)
- `logs/server.log` (when running as daemon)

### Metrics

Monitor these key metrics:
- Active client connections
- Active popups
- Message routing statistics
- Memory usage
- Error rates

## Development

### Project Structure

```
src/
├── core/           # Core MCP server implementation
├── services/       # Business logic services
├── handlers/       # Protocol and message handlers
├── utils/          # Utility functions and helpers
├── types/          # TypeScript type definitions
└── config/         # Configuration management

scripts/            # Deployment and utility scripts
tests/              # Test files
docs/               # Documentation
```

### Building

```bash
# Build TypeScript
npm run build

# Build with watch mode
npm run watch

# Clean build artifacts
npm run clean
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run linting
npm run lint
```

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add tests for new functionality
5. Run the test suite: `npm test`
6. Commit your changes: `git commit -am 'Add new feature'`
7. Push to the branch: `git push origin feature/my-feature`
8. Submit a pull request

## Troubleshooting

### Common Issues

**Port Already in Use**
```bash
# Find process using the port
lsof -i :8080

# Kill the process
kill -9 <PID>

# Or use a different port
MCP_PORT=9090 npm start
```

**Connection Issues**
- Check firewall settings
- Verify VS Code extension is properly configured
- Check WebSocket connection on port 8081

**Memory Issues**
- Monitor memory usage with health endpoint
- Adjust `MCP_MAX_CLIENTS` if needed
- Enable garbage collection with `--expose-gc`

### Debug Mode

```bash
# Start with debug logging
MCP_LOG_LEVEL=debug npm start

# Or use the start script
./scripts/start.sh --log-level debug
```

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the API documentation