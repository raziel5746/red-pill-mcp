import type { HealthError } from '../types/index.js';
export interface ErrorRecoveryStrategy {
    name: string;
    canHandle: (error: Error) => boolean;
    recover: (error: Error, context?: any) => Promise<boolean>;
    maxRetries?: number;
    backoffMs?: number;
}
export interface RetryOptions {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    exponentialBackoff: boolean;
    jitter: boolean;
}
export declare class ErrorHandler {
    private readonly logger;
    private readonly recoveryStrategies;
    private readonly retryAttempts;
    constructor(logLevel?: 'debug' | 'info' | 'warn' | 'error');
    private setupDefaultStrategies;
    addStrategy(strategy: ErrorRecoveryStrategy): void;
    handleError(error: Error, context?: any, operationId?: string): Promise<{
        recovered: boolean;
        strategy?: string;
        shouldRetry: boolean;
        delay?: number;
    }>;
    withRetry<T>(operation: () => Promise<T>, options?: Partial<RetryOptions>, operationId?: string): Promise<T>;
    withCircuitBreaker<T>(operation: () => Promise<T>, options?: {
        failureThreshold: number;
        resetTimeout: number;
        monitoringPeriod: number;
    }): Promise<T>;
    createHealthError(type: HealthError['type'], message: string, originalError?: Error, clientId?: string): HealthError;
    isRecoverableError(error: Error): boolean;
    clearRetryHistory(operationId?: string): void;
    private calculateBackoffDelay;
    private calculateRetryDelay;
    private delay;
    private readonly failureCounts;
    private getFailureCount;
    private recordFailure;
    private recordSuccess;
    getStats(): {
        activeRetries: number;
        strategies: number;
        circuitBreakerStates: number;
    };
}
//# sourceMappingURL=error-handler.d.ts.map