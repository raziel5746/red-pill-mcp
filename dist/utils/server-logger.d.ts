export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    data?: any;
    error?: Error;
}
export declare class Logger {
    private readonly level;
    private readonly levelPriority;
    constructor(level?: LogLevel);
    private shouldLog;
    private formatMessage;
    private log;
    debug(message: string, data?: any): void;
    info(message: string, data?: any): void;
    warn(message: string, data?: any, error?: Error): void;
    error(message: string, data?: any, error?: Error): void;
    createEntry(level: LogLevel, message: string, data?: any, error?: Error): LogEntry;
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
}
//# sourceMappingURL=server-logger.d.ts.map