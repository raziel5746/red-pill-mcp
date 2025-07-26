"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = void 0;
const server_logger_js_1 = require("./server-logger.js");
class ErrorHandler {
    constructor(logLevel = 'info') {
        this.recoveryStrategies = [];
        this.retryAttempts = new Map();
        // Simple failure tracking for circuit breaker
        this.failureCounts = new Map();
        this.logger = new server_logger_js_1.Logger(logLevel);
        this.setupDefaultStrategies();
    }
    setupDefaultStrategies() {
        // Connection recovery strategy
        this.addStrategy({
            name: 'connection_recovery',
            canHandle: (error) => {
                return error.message.includes('ECONNRESET') ||
                    error.message.includes('ECONNREFUSED') ||
                    error.message.includes('socket hang up');
            },
            recover: async (error, context) => {
                this.logger.info('Attempting connection recovery', { error: error.message, context });
                // Wait before allowing reconnection
                await this.delay(5000);
                return true; // Let the connection manager handle reconnection
            },
            maxRetries: 3,
            backoffMs: 5000
        });
        // Port conflict recovery strategy
        this.addStrategy({
            name: 'port_conflict_recovery',
            canHandle: (error) => {
                return error.message.includes('EADDRINUSE') ||
                    error.message.includes('address already in use');
            },
            recover: async (error, context) => {
                this.logger.info('Attempting port conflict recovery', { error: error.message });
                // This would integrate with PortManager to find alternative port
                return false; // Needs external port manager to resolve
            },
            maxRetries: 1
        });
        // Memory pressure recovery strategy
        this.addStrategy({
            name: 'memory_recovery',
            canHandle: (error) => {
                return error.message.includes('out of memory') ||
                    error.message.includes('Maximum call stack');
            },
            recover: async (error) => {
                this.logger.warn('Memory pressure detected, triggering garbage collection');
                if (global.gc) {
                    global.gc();
                }
                // Clean up old data
                await this.delay(1000);
                return true;
            },
            maxRetries: 2,
            backoffMs: 2000
        });
        // WebSocket recovery strategy
        this.addStrategy({
            name: 'websocket_recovery',
            canHandle: (error) => {
                return error.message.includes('WebSocket') ||
                    error.message.includes('connection lost');
            },
            recover: async (error, context) => {
                this.logger.info('WebSocket recovery initiated', { context });
                // Allow reconnection after delay
                await this.delay(3000);
                return true;
            },
            maxRetries: 5,
            backoffMs: 3000
        });
    }
    addStrategy(strategy) {
        this.recoveryStrategies.push(strategy);
        this.logger.debug('Error recovery strategy added', { name: strategy.name });
    }
    async handleError(error, context, operationId) {
        this.logger.error('Handling error', {
            message: error.message,
            stack: error.stack,
            context,
            operationId
        });
        // Find applicable recovery strategy
        const strategy = this.recoveryStrategies.find(s => s.canHandle(error));
        if (!strategy) {
            this.logger.warn('No recovery strategy found for error', { error: error.message });
            return { recovered: false, shouldRetry: false };
        }
        const retryKey = operationId || `${strategy.name}:${error.message}`;
        const currentAttempts = this.retryAttempts.get(retryKey) || 0;
        const maxRetries = strategy.maxRetries || 3;
        if (currentAttempts >= maxRetries) {
            this.logger.error('Max retry attempts exceeded', {
                strategy: strategy.name,
                attempts: currentAttempts,
                maxRetries
            });
            this.retryAttempts.delete(retryKey);
            return { recovered: false, shouldRetry: false };
        }
        try {
            this.retryAttempts.set(retryKey, currentAttempts + 1);
            const recovered = await strategy.recover(error, context);
            if (recovered) {
                this.logger.info('Error recovery successful', {
                    strategy: strategy.name,
                    attempt: currentAttempts + 1
                });
                this.retryAttempts.delete(retryKey);
                return {
                    recovered: true,
                    strategy: strategy.name,
                    shouldRetry: false
                };
            }
            else {
                const delay = this.calculateBackoffDelay(currentAttempts, strategy.backoffMs || 1000);
                this.logger.warn('Error recovery failed, will retry', {
                    strategy: strategy.name,
                    attempt: currentAttempts + 1,
                    nextDelay: delay
                });
                return {
                    recovered: false,
                    strategy: strategy.name,
                    shouldRetry: true,
                    delay
                };
            }
        }
        catch (recoveryError) {
            this.logger.error('Error during recovery attempt', {
                strategy: strategy.name,
                originalError: error.message,
                recoveryError: recoveryError instanceof Error ? recoveryError.message : 'Unknown'
            });
            const delay = this.calculateBackoffDelay(currentAttempts, strategy.backoffMs || 1000);
            return {
                recovered: false,
                strategy: strategy.name,
                shouldRetry: currentAttempts < maxRetries - 1,
                delay
            };
        }
    }
    async withRetry(operation, options = {}, operationId) {
        const opts = {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            exponentialBackoff: true,
            jitter: true,
            ...options
        };
        let lastError;
        for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt === opts.maxRetries - 1) {
                    // Last attempt, don't retry
                    break;
                }
                const recovery = await this.handleError(lastError, { attempt }, operationId);
                if (recovery.recovered) {
                    // Recovery successful, continue with next attempt immediately
                    continue;
                }
                if (!recovery.shouldRetry) {
                    // Recovery says don't retry
                    break;
                }
                // Calculate delay
                let delay = recovery.delay;
                if (!delay) {
                    delay = this.calculateRetryDelay(attempt, opts);
                }
                this.logger.debug('Retrying operation after delay', {
                    attempt: attempt + 1,
                    delay,
                    operationId
                });
                await this.delay(delay);
            }
        }
        throw lastError;
    }
    async withCircuitBreaker(operation, options = {
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringPeriod: 10000
    }) {
        // This is a simplified circuit breaker implementation
        // In production, you'd want a more sophisticated solution
        const circuitKey = operation.toString();
        const failures = this.getFailureCount(circuitKey);
        if (failures >= options.failureThreshold) {
            throw new Error('Circuit breaker open - too many failures');
        }
        try {
            const result = await operation();
            this.recordSuccess(circuitKey);
            return result;
        }
        catch (error) {
            this.recordFailure(circuitKey);
            throw error;
        }
    }
    createHealthError(type, message, originalError, clientId) {
        return {
            timestamp: new Date(),
            type,
            message,
            clientId,
            stack: originalError?.stack
        };
    }
    isRecoverableError(error) {
        return this.recoveryStrategies.some(strategy => strategy.canHandle(error));
    }
    clearRetryHistory(operationId) {
        if (operationId) {
            for (const key of this.retryAttempts.keys()) {
                if (key.includes(operationId)) {
                    this.retryAttempts.delete(key);
                }
            }
        }
        else {
            this.retryAttempts.clear();
        }
        this.logger.debug('Cleared retry history', { operationId });
    }
    calculateBackoffDelay(attempt, baseDelay) {
        // Exponential backoff with jitter
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
        return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
    }
    calculateRetryDelay(attempt, options) {
        let delay = options.baseDelay;
        if (options.exponentialBackoff) {
            delay = options.baseDelay * Math.pow(2, attempt);
        }
        if (options.jitter) {
            const jitterAmount = delay * 0.1; // 10% jitter
            delay += (Math.random() - 0.5) * 2 * jitterAmount;
        }
        return Math.min(Math.max(delay, 0), options.maxDelay);
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    getFailureCount(key) {
        const record = this.failureCounts.get(key);
        if (!record)
            return 0;
        // Reset if too old
        const age = Date.now() - record.timestamp.getTime();
        if (age > 60000) { // 1 minute
            this.failureCounts.delete(key);
            return 0;
        }
        return record.count;
    }
    recordFailure(key) {
        const existing = this.failureCounts.get(key);
        this.failureCounts.set(key, {
            count: (existing?.count || 0) + 1,
            timestamp: new Date()
        });
    }
    recordSuccess(key) {
        this.failureCounts.delete(key);
    }
    getStats() {
        return {
            activeRetries: this.retryAttempts.size,
            strategies: this.recoveryStrategies.length,
            circuitBreakerStates: this.failureCounts.size
        };
    }
}
exports.ErrorHandler = ErrorHandler;
//# sourceMappingURL=error-handler.js.map