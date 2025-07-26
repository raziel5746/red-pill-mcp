"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VSCodeProtocolHandler = exports.VSCodeMessageAdapter = void 0;
/**
 * Converts MCP protocol messages to VS Code extension format
 */
class VSCodeMessageAdapter {
    static mcpRequestToVSCode(request) {
        switch (request.method) {
            case 'show_popup':
                return {
                    type: 'show_popup',
                    payload: request.params
                };
            case 'close_popup':
                return {
                    type: 'close_popup',
                    payload: request.params
                };
            case 'ping':
                return {
                    type: 'heartbeat',
                    payload: request.params
                };
            default:
                return null;
        }
    }
    static mcpNotificationToVSCode(notification) {
        switch (notification.method) {
            case 'server_status':
                return {
                    type: 'server_status',
                    payload: notification.params
                };
            default:
                return null;
        }
    }
    static vscodeToMCPResponse(message, originalRequestId) {
        switch (message.type) {
            case 'popup_response':
                return {
                    id: originalRequestId,
                    result: {
                        popupId: message.payload.popupId,
                        result: message.payload.result
                    }
                };
            case 'heartbeat_response':
                return {
                    id: originalRequestId,
                    result: { timestamp: message.payload.timestamp }
                };
            case 'error':
                return {
                    id: originalRequestId,
                    error: {
                        code: -1,
                        message: message.payload.message,
                        data: { code: message.payload.code }
                    }
                };
            default:
                return null;
        }
    }
    static vscodeToMCPNotification(message) {
        switch (message.type) {
            case 'ready':
                return {
                    method: 'vscode_ready',
                    params: {}
                };
            default:
                return null;
        }
    }
}
exports.VSCodeMessageAdapter = VSCodeMessageAdapter;
/**
 * Protocol handler for VS Code extension WebSocket connections
 */
class VSCodeProtocolHandler {
    constructor() {
        this.pendingRequests = new Map();
    }
    handleIncomingMessage(rawMessage, sessionId) {
        try {
            const message = JSON.parse(rawMessage);
            switch (message.type) {
                case 'identify':
                    return {
                        type: 'identification',
                        identification: message.payload
                    };
                case 'popup_response':
                case 'heartbeat_response':
                case 'error': {
                    const pendingInfo = this.findPendingRequest(message);
                    if (pendingInfo) {
                        this.clearPendingRequest(pendingInfo.key);
                        const mcpResponse = VSCodeMessageAdapter.vscodeToMCPResponse(message, pendingInfo.requestId);
                        return {
                            type: 'response',
                            mcpMessage: mcpResponse || undefined
                        };
                    }
                    return {
                        type: 'unknown',
                        error: 'No matching pending request found'
                    };
                }
                case 'ready':
                    const notification = VSCodeMessageAdapter.vscodeToMCPNotification(message);
                    return {
                        type: 'notification',
                        mcpMessage: notification || undefined
                    };
                default:
                    return {
                        type: 'unknown',
                        error: `Unknown message type: ${message.type}`
                    };
            }
        }
        catch (error) {
            return {
                type: 'unknown',
                error: `Failed to parse message: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    convertOutgoingMessage(mcpMessage, sessionId) {
        let vscodeMessage = null;
        if ('method' in mcpMessage && 'id' in mcpMessage) {
            // MCP Request
            vscodeMessage = VSCodeMessageAdapter.mcpRequestToVSCode(mcpMessage);
            if (vscodeMessage) {
                // Track pending request
                this.addPendingRequest(mcpMessage.id, sessionId);
            }
        }
        else if ('method' in mcpMessage) {
            // MCP Notification
            vscodeMessage = VSCodeMessageAdapter.mcpNotificationToVSCode(mcpMessage);
        }
        return vscodeMessage ? JSON.stringify(vscodeMessage) : null;
    }
    addPendingRequest(requestId, sessionId) {
        const key = `${sessionId}:${requestId}`;
        // Set timeout for pending request
        const timeout = setTimeout(() => {
            this.pendingRequests.delete(key);
        }, 60000); // 60 second timeout
        this.pendingRequests.set(key, {
            requestId,
            timestamp: new Date(),
            timeout
        });
    }
    findPendingRequest(message) {
        // For popup responses, try to match by popup ID
        if (message.type === 'popup_response') {
            for (const [key, pending] of this.pendingRequests.entries()) {
                // This is a simplified matching - in real implementation,
                // you'd need to track popup ID to request ID mapping
                return { key, requestId: pending.requestId };
            }
        }
        // For other responses, match by session (simplified)
        const entries = Array.from(this.pendingRequests.entries());
        if (entries.length > 0) {
            const [key, pending] = entries[0]; // Take the oldest pending request
            return { key, requestId: pending.requestId };
        }
        return null;
    }
    clearPendingRequest(key) {
        const pending = this.pendingRequests.get(key);
        if (pending?.timeout) {
            clearTimeout(pending.timeout);
        }
        this.pendingRequests.delete(key);
    }
    cleanup(sessionId) {
        if (sessionId) {
            // Clear requests for specific session
            const prefix = `${sessionId}:`;
            for (const key of this.pendingRequests.keys()) {
                if (key.startsWith(prefix)) {
                    this.clearPendingRequest(key);
                }
            }
        }
        else {
            // Clear all pending requests
            for (const key of this.pendingRequests.keys()) {
                this.clearPendingRequest(key);
            }
        }
    }
    getPendingRequestCount(sessionId) {
        if (sessionId) {
            const prefix = `${sessionId}:`;
            return Array.from(this.pendingRequests.keys())
                .filter(key => key.startsWith(prefix))
                .length;
        }
        return this.pendingRequests.size;
    }
}
exports.VSCodeProtocolHandler = VSCodeProtocolHandler;
//# sourceMappingURL=vscode-interface.js.map