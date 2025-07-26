import * as vscode from 'vscode';
import { Logger } from './Logger';

export interface ErrorContext {
    component: string;
    operation: string;
    userId?: string;
    popupId?: string;
    additionalData?: Record<string, any>;
}

export class ErrorHandler {
    private logger: Logger;
    private errorCounts: Map<string, number> = new Map();
    private readonly maxErrorsPerType = 10;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    handleError(error: Error, context: ErrorContext, showToUser = true): void {
        const errorKey = `${context.component}:${context.operation}`;
        const errorCount = this.errorCounts.get(errorKey) || 0;

        // Increment error count
        this.errorCounts.set(errorKey, errorCount + 1);

        // Log the error with context
        this.logger.error(
            `Error in ${context.component}.${context.operation}:`,
            {
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                },
                context,
                occurrence: errorCount + 1
            }
        );

        // Show user notification if needed and not too many errors
        if (showToUser && errorCount < 3) {
            this.showUserError(error, context);
        }

        // If too many errors of the same type, suggest restart
        if (errorCount >= this.maxErrorsPerType) {
            this.handleCriticalError(errorKey, context);
        }
    }

    handleAsyncError<T>(
        promise: Promise<T>,
        context: ErrorContext,
        fallbackValue?: T
    ): Promise<T | undefined> {
        return promise.catch((error) => {
            this.handleError(error, context);
            return fallbackValue;
        });
    }

    wrapFunction<TArgs extends any[], TReturn>(
        fn: (...args: TArgs) => TReturn,
        context: ErrorContext
    ): (...args: TArgs) => TReturn | undefined {
        return (...args: TArgs): TReturn | undefined => {
            try {
                return fn(...args);
            } catch (error) {
                this.handleError(error instanceof Error ? error : new Error(String(error)), context);
                return undefined;
            }
        };
    }

    wrapAsyncFunction<TArgs extends any[], TReturn>(
        fn: (...args: TArgs) => Promise<TReturn>,
        context: ErrorContext,
        fallbackValue?: TReturn
    ): (...args: TArgs) => Promise<TReturn | undefined> {
        return async (...args: TArgs): Promise<TReturn | undefined> => {
            try {
                return await fn(...args);
            } catch (error) {
                this.handleError(error instanceof Error ? error : new Error(String(error)), context);
                return fallbackValue;
            }
        };
    }

    createErrorBoundary(
        context: ErrorContext
    ): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
        return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
            const originalMethod = descriptor.value;
            
            descriptor.value = function (...args: any[]) {
                try {
                    const result = originalMethod.apply(this, args);
                    
                    // Handle async methods
                    if (result && typeof result.then === 'function') {
                        return result.catch((error: Error) => {
                            const errorHandler = new ErrorHandler(new Logger('ErrorBoundary'));
                            errorHandler.handleError(error, {
                                ...context,
                                operation: `${context.operation || propertyKey}`
                            });
                            throw error;
                        });
                    }
                    
                    return result;
                } catch (error) {
                    const errorHandler = new ErrorHandler(new Logger('ErrorBoundary'));
                    errorHandler.handleError(
                        error instanceof Error ? error : new Error(String(error)),
                        {
                            ...context,
                            operation: `${context.operation || propertyKey}`
                        }
                    );
                    throw error;
                }
            };
        };
    }

    getErrorStats(): Record<string, number> {
        return Object.fromEntries(this.errorCounts);
    }

    clearErrorStats(): void {
        this.errorCounts.clear();
    }

    private showUserError(error: Error, context: ErrorContext): void {
        const message = this.getUserFriendlyMessage(error, context);
        
        vscode.window.showErrorMessage(
            message,
            'Show Details',
            'Report Issue'
        ).then(selection => {
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

    private getUserFriendlyMessage(error: Error, context: ErrorContext): string {
        // Map technical errors to user-friendly messages
        const errorMappings: Record<string, string> = {
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

    private showErrorDetails(error: Error, context: ErrorContext): void {
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

    private openIssueReport(error: Error, context: ErrorContext): void {
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

    private handleCriticalError(errorKey: string, context: ErrorContext): void {
        this.logger.error(`Critical error threshold reached for: ${errorKey}`);
        
        vscode.window.showErrorMessage(
            `Red Pill MCP: Multiple errors detected in ${context.component}. Consider reloading the window.`,
            'Reload Window',
            'Disable Extension'
        ).then(selection => {
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