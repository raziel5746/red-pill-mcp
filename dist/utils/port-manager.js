"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortManager = void 0;
const net_1 = require("net");
const server_logger_js_1 = require("./server-logger.js");
class PortManager {
    constructor(logLevel = 'info') {
        this.allocatedPorts = new Map();
        this.reservedPorts = new Set([
            22, 23, 25, 53, 80, 110, 143, 443, 993, 995, // Common system ports
            3000, 3001, 5432, 5173, 8000, 8080, 8443 // Common development ports
        ]);
        this.logger = new server_logger_js_1.Logger(logLevel);
    }
    /**
     * Find and allocate the next available port in the range
     */
    async allocatePort(preferredPort, type = 'main', range) {
        const searchRange = range || { start: preferredPort, end: preferredPort + 100 };
        // First try the preferred port
        if (await this.isPortAvailable(preferredPort)) {
            return this.markPortAllocated(preferredPort, type);
        }
        // Search for available port in range
        for (let port = searchRange.start; port <= searchRange.end; port++) {
            if (this.reservedPorts.has(port)) {
                continue; // Skip reserved ports
            }
            if (await this.isPortAvailable(port)) {
                return this.markPortAllocated(port, type);
            }
        }
        throw new Error(`No available port found in range ${searchRange.start}-${searchRange.end}`);
    }
    /**
     * Allocate a specific port if available
     */
    async allocateSpecificPort(port, type = 'main') {
        if (this.reservedPorts.has(port)) {
            throw new Error(`Port ${port} is reserved and cannot be allocated`);
        }
        if (this.allocatedPorts.has(port)) {
            throw new Error(`Port ${port} is already allocated`);
        }
        if (!(await this.isPortAvailable(port))) {
            throw new Error(`Port ${port} is not available`);
        }
        return this.markPortAllocated(port, type);
    }
    /**
     * Release an allocated port
     */
    releasePort(port) {
        const allocation = this.allocatedPorts.get(port);
        if (allocation) {
            this.allocatedPorts.delete(port);
            this.logger.debug('Port released', { port, type: allocation.type });
        }
    }
    /**
     * Release all ports of a specific type
     */
    releasePortsByType(type) {
        const releasedPorts = [];
        for (const [port, allocation] of this.allocatedPorts.entries()) {
            if (allocation.type === type) {
                this.allocatedPorts.delete(port);
                releasedPorts.push(port);
            }
        }
        if (releasedPorts.length > 0) {
            this.logger.info('Released ports by type', { type, ports: releasedPorts });
        }
        return releasedPorts;
    }
    /**
     * Get all allocated ports
     */
    getAllocatedPorts() {
        return Array.from(this.allocatedPorts.entries()).map(([port, allocation]) => ({
            port,
            ...allocation
        }));
    }
    /**
     * Check if a port is available
     */
    async isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = (0, net_1.createServer)();
            server.listen(port, () => {
                server.close(() => {
                    resolve(true);
                });
            });
            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
                    resolve(false);
                }
                else {
                    // Other errors might indicate the port is available but there's another issue
                    resolve(false);
                }
            });
        });
    }
    /**
     * Validate port range
     */
    validatePortRange(range) {
        if (range.start < 1 || range.start > 65535) {
            throw new Error(`Invalid start port: ${range.start}`);
        }
        if (range.end < 1 || range.end > 65535) {
            throw new Error(`Invalid end port: ${range.end}`);
        }
        if (range.start > range.end) {
            throw new Error(`Start port ${range.start} cannot be greater than end port ${range.end}`);
        }
    }
    /**
     * Get suggested port configuration for a server
     */
    async suggestPortConfiguration(basePort = 8080) {
        const mainPort = await this.allocatePort(basePort, 'main');
        const websocketPort = await this.allocatePort(basePort + 1, 'websocket');
        const diagnosticsPort = await this.allocatePort(basePort + 2, 'diagnostics');
        return {
            mainPort,
            websocketPort,
            diagnosticsPort
        };
    }
    /**
     * Handle port conflicts by finding alternatives
     */
    async resolvePortConflict(conflictedPort, type) {
        this.logger.warn('Resolving port conflict', { port: conflictedPort, type });
        // Release the conflicted port if we had it allocated
        this.releasePort(conflictedPort);
        // Find alternative port
        const alternativePort = await this.allocatePort(conflictedPort + 10, // Start searching 10 ports higher
        type, { start: conflictedPort + 10, end: conflictedPort + 110 });
        this.logger.info('Port conflict resolved', {
            original: conflictedPort,
            alternative: alternativePort,
            type
        });
        return alternativePort;
    }
    /**
     * Cleanup old port allocations
     */
    cleanup(maxAge = 24 * 60 * 60 * 1000) {
        const now = new Date();
        const expiredPorts = [];
        for (const [port, allocation] of this.allocatedPorts.entries()) {
            const age = now.getTime() - allocation.allocated.getTime();
            if (age > maxAge) {
                expiredPorts.push(port);
            }
        }
        for (const port of expiredPorts) {
            this.releasePort(port);
        }
        if (expiredPorts.length > 0) {
            this.logger.info('Cleaned up expired port allocations', { count: expiredPorts.length });
        }
    }
    /**
     * Reserve additional ports to prevent conflicts
     */
    addReservedPort(port) {
        this.reservedPorts.add(port);
        this.logger.debug('Port reserved', { port });
    }
    /**
     * Remove port from reserved list
     */
    removeReservedPort(port) {
        this.reservedPorts.delete(port);
        this.logger.debug('Port unreserved', { port });
    }
    /**
     * Get statistics about port usage
     */
    getStats() {
        const byType = {};
        for (const allocation of this.allocatedPorts.values()) {
            byType[allocation.type] = (byType[allocation.type] || 0) + 1;
        }
        return {
            allocated: this.allocatedPorts.size,
            reserved: this.reservedPorts.size,
            byType
        };
    }
    markPortAllocated(port, type) {
        const allocation = {
            port,
            type,
            allocated: new Date()
        };
        this.allocatedPorts.set(port, allocation);
        this.logger.debug('Port allocated', allocation);
        return port;
    }
}
exports.PortManager = PortManager;
//# sourceMappingURL=port-manager.js.map