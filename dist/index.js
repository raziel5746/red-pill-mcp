#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = exports.createConfig = exports.loadConfigFromEnv = exports.MCPServer = void 0;
const mcp_server_js_1 = require("./core/mcp-server.js");
const default_js_1 = require("./config/default.js");
const server_logger_js_1 = require("./utils/server-logger.js");
// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
async function main() {
    const config = (0, default_js_1.loadConfigFromEnv)();
    const logger = new server_logger_js_1.Logger(config.logLevel);
    logger.info('Starting Red Pill MCP Server', { config });
    const server = new mcp_server_js_1.MCPServer(config);
    // Set up graceful shutdown
    const shutdown = async (signal) => {
        logger.info(`Received ${signal}, shutting down gracefully`);
        try {
            await server.stop();
            logger.info('Server stopped successfully');
            process.exit(0);
        }
        catch (error) {
            logger.error('Error during shutdown', error);
            process.exit(1);
        }
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    // Set up server event handlers
    server.on('client_connected', (event) => {
        logger.info('Client connected', {
            clientId: event.clientId,
            type: event.metadata.clientName || 'unknown'
        });
    });
    server.on('client_disconnected', (event) => {
        logger.info('Client disconnected', {
            clientId: event.clientId,
            reason: event.reason
        });
    });
    server.on('popup_created', (event) => {
        logger.debug('Popup created', {
            popupId: event.popupId,
            aiClient: event.aiClientId,
            vscodeInstance: event.vscodeInstanceId
        });
    });
    server.on('popup_resolved', (event) => {
        logger.debug('Popup resolved', {
            popupId: event.popupId,
            result: event.result
        });
    });
    server.on('message_routed', (event) => {
        logger.debug('Message routed', {
            from: event.fromClientId,
            to: event.toClientId,
            type: event.messageType
        });
    });
    server.on('error_occurred', (event) => {
        logger.error('Server error', event.error);
    });
    try {
        await server.start();
        logger.info('Red Pill MCP Server started successfully');
        // Keep process alive
        setInterval(() => {
            const health = server.getHealth();
            logger.debug('Server health check', health);
        }, 60000); // Every minute
    }
    catch (error) {
        logger.error('Failed to start server', error);
        process.exit(1);
    }
}
// Run the server
if (require.main === module) {
    main().catch((error) => {
        console.error('Failed to start application:', error);
        process.exit(1);
    });
}
var mcp_server_js_2 = require("./core/mcp-server.js");
Object.defineProperty(exports, "MCPServer", { enumerable: true, get: function () { return mcp_server_js_2.MCPServer; } });
var default_js_2 = require("./config/default.js");
Object.defineProperty(exports, "loadConfigFromEnv", { enumerable: true, get: function () { return default_js_2.loadConfigFromEnv; } });
Object.defineProperty(exports, "createConfig", { enumerable: true, get: function () { return default_js_2.createConfig; } });
Object.defineProperty(exports, "defaultConfig", { enumerable: true, get: function () { return default_js_2.defaultConfig; } });
__exportStar(require("./types/index.js"), exports);
//# sourceMappingURL=index.js.map