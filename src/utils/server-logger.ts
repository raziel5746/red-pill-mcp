// Server logger that doesn't depend on VS Code
export class Logger {
    private logLevel: string;

    constructor(private channelNameOrLevel: string) {
        // Handle both Logger(channelName) and Logger(logLevel) constructors
        this.logLevel = this.isLogLevel(channelNameOrLevel) ? channelNameOrLevel : (process.env.LOG_LEVEL || 'info');
    }

    private isLogLevel(value: string): boolean {
        return ['debug', 'info', 'warn', 'error'].includes(value);
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
            console.debug(formattedMessage);
        }
    }

    info(message: string, ...args: any[]): void {
        if (this.shouldLog('info')) {
            const formattedMessage = this.formatMessage('info', message, ...args);
            console.info(formattedMessage);
        }
    }

    warn(message: string, ...args: any[]): void {
        if (this.shouldLog('warn')) {
            const formattedMessage = this.formatMessage('warn', message, ...args);
            console.warn(formattedMessage);
        }
    }

    error(message: string, ...args: any[]): void {
        if (this.shouldLog('error')) {
            const formattedMessage = this.formatMessage('error', message, ...args);
            console.error(formattedMessage);
        }
    }

    updateLogLevel(newLevel: string): void {
        this.logLevel = newLevel;
        this.info(`Log level updated to: ${newLevel}`);
    }
}