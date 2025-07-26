import { Logger } from './Logger';
export interface ErrorContext {
    component: string;
    operation: string;
    userId?: string;
    popupId?: string;
    additionalData?: Record<string, any>;
}
export declare class ErrorHandler {
    private logger;
    private errorCounts;
    private readonly maxErrorsPerType;
    constructor(logger: Logger);
    handleError(error: Error, context: ErrorContext, showToUser?: boolean): void;
    handleAsyncError<T>(promise: Promise<T>, context: ErrorContext, fallbackValue?: T): Promise<T | undefined>;
    wrapFunction<TArgs extends any[], TReturn>(fn: (...args: TArgs) => TReturn, context: ErrorContext): (...args: TArgs) => TReturn | undefined;
    wrapAsyncFunction<TArgs extends any[], TReturn>(fn: (...args: TArgs) => Promise<TReturn>, context: ErrorContext, fallbackValue?: TReturn): (...args: TArgs) => Promise<TReturn | undefined>;
    createErrorBoundary(context: ErrorContext): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
    getErrorStats(): Record<string, number>;
    clearErrorStats(): void;
    private showUserError;
    private getUserFriendlyMessage;
    private showErrorDetails;
    private openIssueReport;
    private handleCriticalError;
}
//# sourceMappingURL=ErrorHandler.d.ts.map