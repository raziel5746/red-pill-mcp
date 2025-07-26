export interface PortRange {
    start: number;
    end: number;
}
export interface PortAllocation {
    port: number;
    type: 'main' | 'websocket' | 'diagnostics';
    allocated: Date;
}
export declare class PortManager {
    private readonly logger;
    private readonly allocatedPorts;
    private readonly reservedPorts;
    constructor(logLevel?: 'debug' | 'info' | 'warn' | 'error');
    /**
     * Find and allocate the next available port in the range
     */
    allocatePort(preferredPort: number, type?: PortAllocation['type'], range?: PortRange): Promise<number>;
    /**
     * Allocate a specific port if available
     */
    allocateSpecificPort(port: number, type?: PortAllocation['type']): Promise<number>;
    /**
     * Release an allocated port
     */
    releasePort(port: number): void;
    /**
     * Release all ports of a specific type
     */
    releasePortsByType(type: PortAllocation['type']): number[];
    /**
     * Get all allocated ports
     */
    getAllocatedPorts(): PortAllocation[];
    /**
     * Check if a port is available
     */
    isPortAvailable(port: number): Promise<boolean>;
    /**
     * Validate port range
     */
    validatePortRange(range: PortRange): void;
    /**
     * Get suggested port configuration for a server
     */
    suggestPortConfiguration(basePort?: number): Promise<{
        mainPort: number;
        websocketPort: number;
        diagnosticsPort: number;
    }>;
    /**
     * Handle port conflicts by finding alternatives
     */
    resolvePortConflict(conflictedPort: number, type: PortAllocation['type']): Promise<number>;
    /**
     * Cleanup old port allocations
     */
    cleanup(maxAge?: number): void;
    /**
     * Reserve additional ports to prevent conflicts
     */
    addReservedPort(port: number): void;
    /**
     * Remove port from reserved list
     */
    removeReservedPort(port: number): void;
    /**
     * Get statistics about port usage
     */
    getStats(): {
        allocated: number;
        reserved: number;
        byType: Record<string, number>;
    };
    private markPortAllocated;
}
//# sourceMappingURL=port-manager.d.ts.map