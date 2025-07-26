"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthMonitor = void 0;
const events_1 = require("events");
const server_logger_js_1 = require("../utils/server-logger.js");
class HealthMonitor extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.errors = [];
        this.maxErrors = 100; // Keep last 100 errors
        this.config = config;
        this.logger = new server_logger_js_1.Logger(config.logLevel);
        this.startTime = new Date();
    }
    async start() {
        this.logger.info('Starting Health Monitor');
        if (this.config.enableDiagnostics) {
            this.startHealthChecks();
        }
        this.logger.info('Health Monitor started');
    }
    async stop() {
        this.logger.info('Stopping Health Monitor');
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = undefined;
        }
        this.logger.info('Health Monitor stopped');
    }
    startHealthChecks() {
        const interval = Math.max(5000, this.config.heartbeatInterval); // At least 5 seconds
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, interval);
        this.logger.debug('Health checks started', { interval });
    }
    performHealthCheck() {
        try {
            const memoryUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            // Check memory usage (alert if over 512MB heap used)
            const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
            if (heapUsedMB > 512) {
                this.recordError({
                    timestamp: new Date(),
                    type: 'system',
                    message: `High memory usage: ${heapUsedMB.toFixed(2)}MB heap used`
                });
            }
            // Check for external heap usage (alert if over 256MB)
            const externalMB = memoryUsage.external / 1024 / 1024;
            if (externalMB > 256) {
                this.recordError({
                    timestamp: new Date(),
                    type: 'system',
                    message: `High external memory usage: ${externalMB.toFixed(2)}MB`
                });
            }
            this.logger.debug('Health check completed', {
                memoryUsage: {
                    heapUsed: `${heapUsedMB.toFixed(2)}MB`,
                    heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
                    external: `${externalMB.toFixed(2)}MB`,
                    rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`
                },
                cpuUsage
            });
        }
        catch (error) {
            this.recordError({
                timestamp: new Date(),
                type: 'system',
                message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                stack: error instanceof Error ? error.stack : undefined
            });
        }
    }
    recordError(error) {
        this.errors.push(error);
        // Maintain error history limit
        while (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }
        this.logger.warn('Health error recorded', error);
        // Emit for external listeners
        this.emit('health_error', error);
    }
    getStatus() {
        const recentErrors = this.getRecentErrors(5 * 60 * 1000); // Last 5 minutes
        if (recentErrors.length === 0) {
            return 'healthy';
        }
        // Check for critical system errors
        const criticalErrors = recentErrors.filter(error => error.type === 'system' ||
            (error.type === 'connection' && recentErrors.length > 5));
        if (criticalErrors.length > 3) {
            return 'unhealthy';
        }
        if (recentErrors.length > 10) {
            return 'degraded';
        }
        return 'healthy';
    }
    getRecentErrors(timeWindowMs = 60000) {
        const cutoff = new Date(Date.now() - timeWindowMs);
        return this.errors.filter(error => error.timestamp >= cutoff);
    }
    getAllErrors() {
        return [...this.errors];
    }
    clearErrors() {
        this.errors.length = 0;
        this.logger.info('Health errors cleared');
    }
    getHealthSummary() {
        const now = new Date();
        const uptime = now.getTime() - this.startTime.getTime();
        const recentErrors = this.getRecentErrors();
        // Count errors by type
        const errorsByType = {};
        for (const error of this.errors) {
            errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
        }
        return {
            status: this.getStatus(),
            uptime,
            totalErrors: this.errors.length,
            recentErrors: recentErrors.length,
            errorsByType,
            memoryUsage: process.memoryUsage()
        };
    }
    getMetrics() {
        const now = new Date();
        const uptime = now.getTime() - this.startTime.getTime();
        return {
            timestamp: now.toISOString(),
            uptime,
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            errorCounts: {
                total: this.errors.length,
                lastHour: this.getRecentErrors(60 * 60 * 1000).length,
                lastMinute: this.getRecentErrors(60 * 1000).length
            },
            status: this.getStatus()
        };
    }
    // Utility method for creating standardized errors
    static createError(type, message, clientId, originalError) {
        return {
            timestamp: new Date(),
            type,
            message,
            clientId,
            stack: originalError?.stack
        };
    }
}
exports.HealthMonitor = HealthMonitor;
//# sourceMappingURL=health-monitor.js.map