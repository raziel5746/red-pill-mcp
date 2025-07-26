import * as vscode from 'vscode';

export class Logger {
    private outputChannel: vscode.OutputChannel;
    private logLevel: string;

    constructor(channelName: string) {
        this.outputChannel = vscode.window.createOutputChannel(channelName);
        this.logLevel = vscode.workspace.getConfiguration('redPillMcp').get('logLevel', 'info');
    }

    private shouldLog(level: string): boolean {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const messageLevelIndex = levels.indexOf(level);
        return messageLevelIndex >= currentLevelIndex;
    }

    private formatMessage(level: string, message: string, ...args: any[]): string {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ') : '';
        
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
    }

    debug(message: string, ...args: any[]): void {
        if (this.shouldLog('debug')) {
            const formattedMessage = this.formatMessage('debug', message, ...args);
            this.outputChannel.appendLine(formattedMessage);
            console.debug(formattedMessage);
        }
    }

    info(message: string, ...args: any[]): void {
        if (this.shouldLog('info')) {
            const formattedMessage = this.formatMessage('info', message, ...args);
            this.outputChannel.appendLine(formattedMessage);
            console.info(formattedMessage);
        }
    }

    warn(message: string, ...args: any[]): void {
        if (this.shouldLog('warn')) {
            const formattedMessage = this.formatMessage('warn', message, ...args);
            this.outputChannel.appendLine(formattedMessage);
            console.warn(formattedMessage);
        }
    }

    error(message: string, ...args: any[]): void {
        if (this.shouldLog('error')) {
            const formattedMessage = this.formatMessage('error', message, ...args);
            this.outputChannel.appendLine(formattedMessage);
            console.error(formattedMessage);
        }
    }

    show(): void {
        this.outputChannel.show();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }

    updateLogLevel(newLevel: string): void {
        this.logLevel = newLevel;
        this.info(`Log level updated to: ${newLevel}`);
    }
}