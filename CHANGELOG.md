# Change Log

All notable changes to the "Red Pill MCP" extension will be documented in this file.

## [0.1.0] - 2024-07-26

### Added
- Initial implementation of VS Code extension for AI-to-User popup communication
- WebSocket-based MCP (Model Context Protocol) communication bridge
- Dynamic popup creation with configurable content, buttons, and styling
- Webview-based popup UI components with VS Code theme integration
- Popup manager with lifecycle management and timeout support
- Configuration management with user-configurable settings
- Comprehensive error handling and logging system
- Command palette integration with extension commands
- Multi-instance popup support with concurrent limits
- Keyboard navigation and accessibility features
- Auto-reconnection logic for MCP server connections
- Heartbeat mechanism for connection health monitoring

### Features
- **Popup Creation**: AI can create custom popups with rich content
- **Button Interactions**: Support for multiple button styles (primary, secondary, danger)
- **Timeout Management**: Configurable popup timeouts with visual countdown
- **Theme Integration**: Popups match VS Code's current theme
- **Error Recovery**: Automatic reconnection and graceful error handling
- **Logging**: Comprehensive logging with configurable levels
- **Configuration**: User-friendly settings through VS Code preferences

### Commands
- `redPillMcp.showPopup` - Create a test popup
- `redPillMcp.clearAllPopups` - Close all active popups  
- `redPillMcp.toggleConnection` - Toggle MCP server connection

### Configuration Options
- `redPillMcp.mcpServerUrl` - MCP server WebSocket URL
- `redPillMcp.autoConnect` - Auto-connect on startup
- `redPillMcp.popupTimeout` - Default popup timeout
- `redPillMcp.maxConcurrentPopups` - Maximum concurrent popups
- `redPillMcp.logLevel` - Logging verbosity level

### Technical Implementation
- TypeScript implementation with strict type checking
- Event-driven architecture with proper cleanup
- WebSocket communication with reconnection logic
- Webview-based UI with custom HTML/CSS/JavaScript
- Comprehensive error handling with user-friendly messages
- Memory leak prevention with proper disposal patterns

## [Unreleased]

### Planned Features
- Popup templates and customization options
- File attachment support in popups
- Integration with VS Code's notification system
- Plugin API for third-party integrations
- Advanced styling and theming options
- Popup history and analytics