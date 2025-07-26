"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
class Logger {
    constructor(level = 'info') {
        this.levelPriority = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
        this.level = level;
    }
    shouldLog(level) {
        return this.levelPriority[level] >= this.levelPriority[this.level];
    }
    formatMessage(level, message, data, error) {
        const timestamp = new Date().toISOString();
        const levelStr = level.toUpperCase().padEnd(5);
        let formatted = `[${timestamp}] ${levelStr} ${message}`;
        if (data) {
            formatted += ` ${JSON.stringify(data)}`;
        }
        if (error) {
            formatted += `\nError: ${error.message}`;
            if (error.stack) {
                formatted += `\nStack: ${error.stack}`;
            }
        }
        return formatted;
    }
    log(level, message, data, error) {
        if (!this.shouldLog(level)) {
            return;
        }
        const formatted = this.formatMessage(level, message, data, error);
        // Output to appropriate stream
        if (level === 'error') {
            console.error(formatted);
        }
        else if (level === 'warn') {
            console.warn(formatted);
        }
        else {
            console.log(formatted);
        }
    }
    debug(message, data) {
        this.log('debug', message, data);
    }
    info(message, data) {
        this.log('info', message, data);
    }
    warn(message, data, error) {
        this.log('warn', message, data, error);
    }
    error(message, data, error) {
        this.log('error', message, data, error);
    }
    createEntry(level, message, data, error) {
        return {
            timestamp: new Date().toISOString(),
            level,
            message,
            data,
            error
        };
    }
    setLevel(level) {
        this.level = level;
    }
    getLevel() {
        return this.level;
    }
}
exports.Logger = Logger;
//# sourceMappingURL=server-logger.js.map