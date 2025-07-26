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
exports.ErrorHandler = void 0;
const vscode = __importStar(require("vscode"));
const Logger_1 = require("./Logger");
class ErrorHandler {
    constructor(logger) {
        this.errorCounts = new Map();
        this.maxErrorsPerType = 10;
        this.logger = logger;
    }
    handleError(error, context, showToUser = true) {
        const errorKey = `${context.component}:${context.operation}`;
        const errorCount = this.errorCounts.get(errorKey) || 0;
        // Increment error count
        this.errorCounts.set(errorKey, errorCount + 1);
        // Log the error with context
        this.logger.error(`Error in ${context.component}.${context.operation}:`, {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context,
            occurrence: errorCount + 1
        });
        // Show user notification if needed and not too many errors
        if (showToUser && errorCount < 3) {
            this.showUserError(error, context);
        }
        // If too many errors of the same type, suggest restart
        if (errorCount >= this.maxErrorsPerType) {
            this.handleCriticalError(errorKey, context);
        }
    }
    handleAsyncError(promise, context, fallbackValue) {
        return promise.catch((error) => {
            this.handleError(error, context);
            return fallbackValue;
        });
    }
    wrapFunction(fn, context) {
        return (...args) => {
            try {
                return fn(...args);
            }
            catch (error) {
                this.handleError(error instanceof Error ? error : new Error(String(error)), context);
                return undefined;
            }
        };
    }
    wrapAsyncFunction(fn, context, fallbackValue) {
        return async (...args) => {
            try {
                return await fn(...args);
            }
            catch (error) {
                this.handleError(error instanceof Error ? error : new Error(String(error)), context);
                return fallbackValue;
            }
        };
    }
    createErrorBoundary(context) {
        return (target, propertyKey, descriptor) => {
            const originalMethod = descriptor.value;
            descriptor.value = function (...args) {
                try {
                    const result = originalMethod.apply(this, args);
                    // Handle async methods
                    if (result && typeof result.then === 'function') {
                        return result.catch((error) => {
                            const errorHandler = new ErrorHandler(new Logger_1.Logger('ErrorBoundary'));
                            errorHandler.handleError(error, {
                                ...context,
                                operation: `${context.operation || propertyKey}`
                            });
                            throw error;
                        });
                    }
                    return result;
                }
                catch (error) {
                    const errorHandler = new ErrorHandler(new Logger_1.Logger('ErrorBoundary'));
                    errorHandler.handleError(error instanceof Error ? error : new Error(String(error)), {
                        ...context,
                        operation: `${context.operation || propertyKey}`
                    });
                    throw error;
                }
            };
        };
    }
    getErrorStats() {
        return Object.fromEntries(this.errorCounts);
    }
    clearErrorStats() {
        this.errorCounts.clear();
    }
    showUserError(error, context) {
        const message = this.getUserFriendlyMessage(error, context);
        vscode.window.showErrorMessage(message, 'Show Details', 'Report Issue').then(selection => {
            switch (selection) {
                case 'Show Details':
                    this.showErrorDetails(error, context);
                    break;
                case 'Report Issue':
                    this.openIssueReport(error, context);
                    break;
            }
        });
    }
    getUserFriendlyMessage(error, context) {
        // Map technical errors to user-friendly messages
        const errorMappings = {
            'ECONNREFUSED': 'Unable to connect to the MCP server. Please check if the server is running.',
            'ENOTFOUND': 'Cannot find the MCP server at the specified address.',
            'ETIMEDOUT': 'Connection to MCP server timed out. Please check your network connection.',
            'WebSocket connection failed': 'Failed to establish connection with the AI service.',
            'Invalid message format': 'Received invalid data from the AI service.',
            'Maximum concurrent popups': 'Too many popups are open. Please close some before creating new ones.'
        };
        // Check for specific error patterns
        for (const [pattern, message] of Object.entries(errorMappings)) {
            if (error.message.includes(pattern) || error.name.includes(pattern)) {
                return `Red Pill MCP: ${message}`;
            }
        }
        // Generic error message
        return `Red Pill MCP Error in ${context.component}: ${error.message}`;
    }
    showErrorDetails(error, context) {
        const details = {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context,
            timestamp: new Date().toISOString(),
            extensionVersion: vscode.extensions.getExtension('red-pill-mcp.red-pill-mcp')?.packageJSON?.version
        };
        const detailsJson = JSON.stringify(details, null, 2);
        vscode.workspace.openTextDocument({
            content: detailsJson,
            language: 'json'
        }).then(doc => {
            vscode.window.showTextDocument(doc);
        });
    }
    openIssueReport(error, context) {
        const issueBody = encodeURIComponent(`
**Error Description:**
${error.message}

**Component:** ${context.component}
**Operation:** ${context.operation}

**Error Details:**
\`\`\`
${error.stack || 'No stack trace available'}
\`\`\`

**Context:**
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`

**Environment:**
- VS Code Version: ${vscode.version}
- Extension Version: ${vscode.extensions.getExtension('red-pill-mcp.red-pill-mcp')?.packageJSON?.version}
- Platform: ${process.platform}
        `.trim());
        const issueUrl = `https://github.com/your-repo/red-pill-mcp/issues/new?title=${encodeURIComponent(`Error in ${context.component}`)}&body=${issueBody}`;
        vscode.env.openExternal(vscode.Uri.parse(issueUrl));
    }
    handleCriticalError(errorKey, context) {
        this.logger.error(`Critical error threshold reached for: ${errorKey}`);
        vscode.window.showErrorMessage(`Red Pill MCP: Multiple errors detected in ${context.component}. Consider reloading the window.`, 'Reload Window', 'Disable Extension').then(selection => {
            switch (selection) {
                case 'Reload Window':
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                    break;
                case 'Disable Extension':
                    vscode.commands.executeCommand('workbench.extensions.action.disableWorkspace', 'red-pill-mcp.red-pill-mcp');
                    break;
            }
        });
    }
}
exports.ErrorHandler = ErrorHandler;
//# sourceMappingURL=ErrorHandler.js.map