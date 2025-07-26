"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PopupManager = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const server_logger_js_1 = require("../utils/server-logger.js");
class PopupManager extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.popups = new Map();
        this.popupWaiters = new Map(); // Multiple waiters per popup
        this.globalWaiters = []; // Waiters for any popup
        this.config = config;
        this.logger = new server_logger_js_1.Logger(config.logLevel);
    }
    async createPopup(aiClientId, vscodeInstanceId, options) {
        const popupId = (0, uuid_1.v4)();
        const now = new Date();
        const popup = {
            id: popupId,
            vscodeInstanceId,
            aiClientId,
            options,
            status: 'pending',
            createdAt: now
        };
        this.popups.set(popupId, popup);
        // Set up automatic timeout if specified
        if (options.timeout) {
            setTimeout(() => {
                this.timeoutPopup(popupId);
            }, options.timeout);
        }
        this.logger.info('Popup created', { popupId, aiClientId, vscodeInstanceId, options });
        this.emit('popup_created', {
            type: 'popup_created',
            popupId,
            aiClientId,
            vscodeInstanceId
        });
        return popupId;
    }
    async resolvePopup(popupId, result) {
        const popup = this.popups.get(popupId);
        if (!popup) {
            throw new Error(`Popup ${popupId} not found`);
        }
        if (popup.status !== 'pending') {
            throw new Error(`Popup ${popupId} is not pending (current status: ${popup.status})`);
        }
        // Update popup
        popup.status = 'resolved';
        popup.resolvedAt = new Date();
        popup.result = result;
        this.logger.info('Popup resolved', { popupId, result });
        // Notify specific waiters
        const waiters = this.popupWaiters.get(popupId) || [];
        for (const waiter of waiters) {
            if (waiter.timeout) {
                clearTimeout(waiter.timeout);
            }
            waiter.resolve(result);
        }
        this.popupWaiters.delete(popupId);
        // Notify global waiters (first one gets it)
        if (this.globalWaiters.length > 0) {
            const globalWaiter = this.globalWaiters.shift();
            if (globalWaiter.timeout) {
                clearTimeout(globalWaiter.timeout);
            }
            globalWaiter.resolve(result);
        }
        this.emit('popup_resolved', {
            type: 'popup_resolved',
            popupId,
            result
        });
        // Clean up old popups after some time
        setTimeout(() => {
            this.popups.delete(popupId);
            this.logger.debug('Popup cleaned up', { popupId });
        }, 60000); // Keep resolved popups for 1 minute
    }
    async closePopup(popupId) {
        const popup = this.popups.get(popupId);
        if (!popup) {
            throw new Error(`Popup ${popupId} not found`);
        }
        if (popup.status !== 'pending') {
            this.logger.warn('Attempting to close non-pending popup', { popupId, status: popup.status });
            return;
        }
        const result = { cancelled: true };
        // Update popup
        popup.status = 'cancelled';
        popup.resolvedAt = new Date();
        popup.result = result;
        this.logger.info('Popup closed', { popupId });
        // Notify waiters
        const waiters = this.popupWaiters.get(popupId) || [];
        for (const waiter of waiters) {
            if (waiter.timeout) {
                clearTimeout(waiter.timeout);
            }
            waiter.resolve(result);
        }
        this.popupWaiters.delete(popupId);
        // Don't notify global waiters for cancelled popups
        // They should wait for actual user interactions
        this.emit('popup_resolved', {
            type: 'popup_resolved',
            popupId,
            result
        });
    }
    async closeAllPopups(vscodeInstanceId) {
        const popupsToClose = Array.from(this.popups.values()).filter(popup => {
            if (popup.status !== 'pending')
                return false;
            if (vscodeInstanceId && popup.vscodeInstanceId !== vscodeInstanceId)
                return false;
            return true;
        });
        const closedIds = [];
        for (const popup of popupsToClose) {
            try {
                await this.closePopup(popup.id);
                closedIds.push(popup.id);
            }
            catch (error) {
                this.logger.warn('Failed to close popup', { popupId: popup.id, error });
            }
        }
        this.logger.info('Closed multiple popups', { count: closedIds.length, vscodeInstanceId });
        return closedIds;
    }
    async waitForPopupResponse(popupId, timeout) {
        const popup = this.popups.get(popupId);
        if (!popup) {
            throw new Error(`Popup ${popupId} not found`);
        }
        // If already resolved, return immediately
        if (popup.status !== 'pending' && popup.result) {
            return popup.result;
        }
        // Wait for resolution
        return new Promise((resolve, reject) => {
            const effectiveTimeout = timeout || this.config.popupTimeout;
            const timeoutId = setTimeout(() => {
                // Remove this waiter from the list
                const waiters = this.popupWaiters.get(popupId);
                if (waiters) {
                    const index = waiters.findIndex(w => w.resolve === resolve);
                    if (index >= 0) {
                        waiters.splice(index, 1);
                    }
                }
                reject(new Error(`Timeout waiting for popup ${popupId} after ${effectiveTimeout}ms`));
            }, effectiveTimeout);
            const waiter = {
                resolve,
                reject,
                timeout: timeoutId
            };
            // Add to waiters
            if (!this.popupWaiters.has(popupId)) {
                this.popupWaiters.set(popupId, []);
            }
            this.popupWaiters.get(popupId).push(waiter);
            this.logger.debug('Added popup waiter', { popupId, timeout: effectiveTimeout });
        });
    }
    async waitForAnyPopupResponse(timeout) {
        return new Promise((resolve, reject) => {
            const effectiveTimeout = timeout || this.config.popupTimeout;
            const timeoutId = setTimeout(() => {
                // Remove this waiter from global waiters
                const index = this.globalWaiters.findIndex(w => w.resolve === resolve);
                if (index >= 0) {
                    this.globalWaiters.splice(index, 1);
                }
                reject(new Error(`Timeout waiting for any popup response after ${effectiveTimeout}ms`));
            }, effectiveTimeout);
            const waiter = {
                resolve,
                reject,
                timeout: timeoutId
            };
            this.globalWaiters.push(waiter);
            this.logger.debug('Added global popup waiter', { timeout: effectiveTimeout });
        });
    }
    getActivePopups(vscodeInstanceId) {
        const allPopups = Array.from(this.popups.values());
        return allPopups.filter(popup => {
            if (popup.status !== 'pending')
                return false;
            if (vscodeInstanceId && popup.vscodeInstanceId !== vscodeInstanceId)
                return false;
            return true;
        });
    }
    getPopup(popupId) {
        return this.popups.get(popupId);
    }
    getAllPopups() {
        return Array.from(this.popups.values());
    }
    getActivePopupCount() {
        return Array.from(this.popups.values()).filter(popup => popup.status === 'pending').length;
    }
    timeoutPopup(popupId) {
        const popup = this.popups.get(popupId);
        if (!popup || popup.status !== 'pending') {
            return;
        }
        const result = { timedOut: true };
        // Update popup
        popup.status = 'timeout';
        popup.resolvedAt = new Date();
        popup.result = result;
        this.logger.info('Popup timed out', { popupId });
        // Notify waiters
        const waiters = this.popupWaiters.get(popupId) || [];
        for (const waiter of waiters) {
            if (waiter.timeout) {
                clearTimeout(waiter.timeout);
            }
            waiter.resolve(result);
        }
        this.popupWaiters.delete(popupId);
        // Notify one global waiter
        if (this.globalWaiters.length > 0) {
            const globalWaiter = this.globalWaiters.shift();
            if (globalWaiter.timeout) {
                clearTimeout(globalWaiter.timeout);
            }
            globalWaiter.resolve(result);
        }
        this.emit('popup_resolved', {
            type: 'popup_resolved',
            popupId,
            result
        });
    }
    getStats() {
        const popups = Array.from(this.popups.values());
        let waitingClients = 0;
        for (const waiters of this.popupWaiters.values()) {
            waitingClients += waiters.length;
        }
        waitingClients += this.globalWaiters.length;
        return {
            totalPopups: popups.length,
            activePopups: popups.filter(p => p.status === 'pending').length,
            resolvedPopups: popups.filter(p => p.status === 'resolved').length,
            timeoutPopups: popups.filter(p => p.status === 'timeout').length,
            cancelledPopups: popups.filter(p => p.status === 'cancelled').length,
            waitingClients
        };
    }
    // Clean up expired popups and waiters
    cleanup() {
        const now = new Date();
        const expiredThreshold = now.getTime() - (24 * 60 * 60 * 1000); // 24 hours
        let cleanedCount = 0;
        for (const [popupId, popup] of this.popups.entries()) {
            if (popup.status !== 'pending' && popup.createdAt.getTime() < expiredThreshold) {
                this.popups.delete(popupId);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            this.logger.info('Cleaned up expired popups', { count: cleanedCount });
        }
    }
}
exports.PopupManager = PopupManager;
//# sourceMappingURL=popup-manager.js.map