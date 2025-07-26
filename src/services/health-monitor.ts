import { EventEmitter } from 'events';

import { Logger } from '../utils/server-logger.js';
import type { ServerConfig, HealthError } from '../types/index.js';

export class HealthMonitor extends EventEmitter {
    private readonly config: ServerConfig;
    private readonly logger: Logger;
    private readonly errors: HealthError[] = [];
    private readonly maxErrors = 100; // Keep last 100 errors
    private status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    private checkInterval?: NodeJS.Timeout;

    constructor(config: ServerConfig, externalLogger?: any) {
        super();
        this.config = config;
        this.logger = externalLogger || new Logger(config.logLevel);
    }

    async start(): Promise<void> {
        this.logger.info('Starting Health Monitor');
        
        // Perform health checks every 30 seconds
        this.checkInterval = setInterval(() => {
            this.performHealthCheck();
        }, 30000);

        this.status = 'healthy';
        this.logger.info('Health Monitor started');
    }

    async stop(): Promise<void> {
        this.logger.info('Stopping Health Monitor');
        
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = undefined;
        }

        this.logger.info('Health Monitor stopped');
    }

    recordError(error: HealthError): void {
        this.errors.push(error);

        // Keep only the most recent errors
        if (this.errors.length > this.maxErrors) {
            this.errors.splice(0, this.errors.length - this.maxErrors);
        }

        this.logger.warn('Error recorded', error);
        this.updateHealthStatus();
    }

    getStatus(): 'healthy' | 'degraded' | 'unhealthy' {
        return this.status;
    }

    getRecentErrors(count = 10): HealthError[] {
        return this.errors.slice(-count);
    }

    getErrorCount(timeWindowMs = 300000): number { // Default: 5 minutes
        const cutoff = new Date(Date.now() - timeWindowMs);
        return this.errors.filter(error => error.timestamp > cutoff).length;
    }

    private performHealthCheck(): void {
        const recentErrorCount = this.getErrorCount();
        const memoryUsage = process.memoryUsage();
        
        // Simple health logic
        if (recentErrorCount > 10) {
            this.status = 'unhealthy';
        } else if (recentErrorCount > 5 || memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
            this.status = 'degraded';
        } else {
            this.status = 'healthy';
        }

        this.logger.debug('Health check completed', {
            status: this.status,
            recentErrors: recentErrorCount,
            memoryUsage: memoryUsage.heapUsed
        });

        this.emit('health_check', {
            status: this.status,
            errors: recentErrorCount,
            memory: memoryUsage
        });
    }

    private updateHealthStatus(): void {
        const previousStatus = this.status;
        this.performHealthCheck();

        if (previousStatus !== this.status) {
            this.logger.info('Health status changed', { 
                from: previousStatus, 
                to: this.status 
            });
            
            this.emit('status_changed', {
                from: previousStatus,
                to: this.status,
                timestamp: new Date()
            });
        }
    }

    // Get comprehensive health metrics
    getHealthMetrics() {
        const now = new Date();
        const oneHour = 60 * 60 * 1000;
        const oneDay = 24 * oneHour;

        return {
            status: this.status,
            uptime: process.uptime() * 1000,
            memoryUsage: process.memoryUsage(),
            errors: {
                total: this.errors.length,
                lastHour: this.getErrorCount(oneHour),
                lastDay: this.getErrorCount(oneDay),
                recent: this.getRecentErrors(5)
            },
            timestamp: now
        };
    }
}