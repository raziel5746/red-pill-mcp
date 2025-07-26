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
exports.Logger = void 0;
const vscode = __importStar(require("vscode"));
class Logger {
    constructor(channelName) {
        this.outputChannel = vscode.window.createOutputChannel(channelName);
        this.logLevel = vscode.workspace.getConfiguration('redPillMcp').get('logLevel', 'info');
    }
    shouldLog(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const messageLevelIndex = levels.indexOf(level);
        return messageLevelIndex >= currentLevelIndex;
    }
    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ') : '';
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
    }
    debug(message, ...args) {
        if (this.shouldLog('debug')) {
            const formattedMessage = this.formatMessage('debug', message, ...args);
            this.outputChannel.appendLine(formattedMessage);
            console.debug(formattedMessage);
        }
    }
    info(message, ...args) {
        if (this.shouldLog('info')) {
            const formattedMessage = this.formatMessage('info', message, ...args);
            this.outputChannel.appendLine(formattedMessage);
            console.info(formattedMessage);
        }
    }
    warn(message, ...args) {
        if (this.shouldLog('warn')) {
            const formattedMessage = this.formatMessage('warn', message, ...args);
            this.outputChannel.appendLine(formattedMessage);
            console.warn(formattedMessage);
        }
    }
    error(message, ...args) {
        if (this.shouldLog('error')) {
            const formattedMessage = this.formatMessage('error', message, ...args);
            this.outputChannel.appendLine(formattedMessage);
            console.error(formattedMessage);
        }
    }
    show() {
        this.outputChannel.show();
    }
    dispose() {
        this.outputChannel.dispose();
    }
    updateLogLevel(newLevel) {
        this.logLevel = newLevel;
        this.info(`Log level updated to: ${newLevel}`);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=Logger.js.map