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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = void 0;
const vscode = __importStar(require("vscode"));
class ConfigManager {
    getConfig() {
        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        return {
            mcpServerUrl: config.get('mcpServerUrl', 'ws://localhost:8080'),
            autoConnect: config.get('autoConnect', true),
            popupTimeout: config.get('popupTimeout', 30000),
            maxConcurrentPopups: config.get('maxConcurrentPopups', 3),
            logLevel: config.get('logLevel', 'info')
        };
    }
    async updateConfig(key, value) {
        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        await config.update(key, value, vscode.ConfigurationTarget.Global);
    }
    refresh() {
        // Configuration is automatically refreshed when accessed via getConfig()
        // This method can be used to trigger any additional refresh logic
    }
    onConfigurationChanged(callback) {
        return vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(ConfigManager.CONFIG_SECTION)) {
                callback(event);
            }
        });
    }
    validateConfig() {
        const config = this.getConfig();
        const errors = [];
        // Validate MCP server URL
        try {
            new URL(config.mcpServerUrl);
        }
        catch {
            errors.push('Invalid MCP server URL format');
        }
        // Validate popup timeout
        if (config.popupTimeout < 0) {
            errors.push('Popup timeout must be non-negative');
        }
        // Validate max concurrent popups
        if (config.maxConcurrentPopups < 1 || config.maxConcurrentPopups > 10) {
            errors.push('Max concurrent popups must be between 1 and 10');
        }
        // Validate log level
        const validLogLevels = ['debug', 'info', 'warn', 'error'];
        if (!validLogLevels.includes(config.logLevel)) {
            errors.push('Invalid log level');
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
}
exports.ConfigManager = ConfigManager;
ConfigManager.CONFIG_SECTION = 'redPillMcp';
//# sourceMappingURL=ConfigManager.js.map