"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = void 0;
exports.createConfig = createConfig;
exports.loadConfigFromEnv = loadConfigFromEnv;
exports.defaultConfig = {
    port: 8080,
    maxClients: 50,
    popupTimeout: 30000, // 30 seconds
    heartbeatInterval: 10000, // 10 seconds
    logLevel: 'info',
    enableDiagnostics: true,
    cors: {
        enabled: true,
        origins: ['*'] // In production, specify allowed origins
    }
};
function createConfig(overrides = {}) {
    return {
        ...exports.defaultConfig,
        ...overrides,
        cors: {
            ...exports.defaultConfig.cors,
            ...overrides.cors
        }
    };
}
function loadConfigFromEnv() {
    const config = {};
    if (process.env.MCP_PORT) {
        config.port = parseInt(process.env.MCP_PORT, 10);
    }
    if (process.env.MCP_MAX_CLIENTS) {
        config.maxClients = parseInt(process.env.MCP_MAX_CLIENTS, 10);
    }
    if (process.env.MCP_POPUP_TIMEOUT) {
        config.popupTimeout = parseInt(process.env.MCP_POPUP_TIMEOUT, 10);
    }
    if (process.env.MCP_HEARTBEAT_INTERVAL) {
        config.heartbeatInterval = parseInt(process.env.MCP_HEARTBEAT_INTERVAL, 10);
    }
    if (process.env.MCP_LOG_LEVEL) {
        const level = process.env.MCP_LOG_LEVEL.toLowerCase();
        if (['debug', 'info', 'warn', 'error'].includes(level)) {
            config.logLevel = level;
        }
    }
    if (process.env.MCP_ENABLE_DIAGNOSTICS !== undefined) {
        config.enableDiagnostics = process.env.MCP_ENABLE_DIAGNOSTICS === 'true';
    }
    if (process.env.MCP_CORS_ENABLED !== undefined) {
        config.cors = {
            enabled: process.env.MCP_CORS_ENABLED === 'true',
            origins: process.env.MCP_CORS_ORIGINS ?
                process.env.MCP_CORS_ORIGINS.split(',') :
                ['*']
        };
    }
    return createConfig(config);
}
//# sourceMappingURL=default.js.map