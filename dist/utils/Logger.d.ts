export declare class Logger {
    private outputChannel;
    private logLevel;
    constructor(channelName: string);
    private shouldLog;
    private formatMessage;
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    show(): void;
    dispose(): void;
    updateLogLevel(newLevel: string): void;
}
//# sourceMappingURL=Logger.d.ts.map