import { EventEmitter } from 'events';
import type { ServerConfig, HealthError } from '../types/index.js';
export declare class HealthMonitor extends EventEmitter {
    private readonly config;
    private readonly logger;
    private readonly errors;
    private readonly maxErrors;
    private healthCheckInterval?;
    private startTime;
    constructor(config: ServerConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    private startHealthChecks;
    private performHealthCheck;
    recordError(error: HealthError): void;
    getStatus(): 'healthy' | 'degraded' | 'unhealthy';
    getRecentErrors(timeWindowMs?: number): HealthError[];
    getAllErrors(): HealthError[];
    clearErrors(): void;
    getHealthSummary(): {
        status: 'healthy' | 'degraded' | 'unhealthy';
        uptime: number;
        totalErrors: number;
        recentErrors: number;
        errorsByType: Record<string, number>;
        memoryUsage: NodeJS.MemoryUsage;
    };
    getMetrics(): {
        timestamp: string;
        uptime: number;
        memoryUsage: NodeJS.MemoryUsage;
        cpuUsage: NodeJS.CpuUsage;
        errorCounts: {
            total: number;
            lastHour: number;
            lastMinute: number;
        };
        status: 'healthy' | 'degraded' | 'unhealthy';
    };
    static createError(type: HealthError['type'], message: string, clientId?: string, originalError?: Error): HealthError;
}
//# sourceMappingURL=health-monitor.d.ts.map