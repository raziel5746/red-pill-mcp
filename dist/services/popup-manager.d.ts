import { EventEmitter } from 'events';
import type { ServerConfig, PopupInstance, PopupOptions, PopupResult } from '../types/index.js';
export declare class PopupManager extends EventEmitter {
    private readonly config;
    private readonly logger;
    private readonly popups;
    private readonly popupWaiters;
    private readonly globalWaiters;
    constructor(config: ServerConfig);
    createPopup(aiClientId: string, vscodeInstanceId: string, options: PopupOptions): Promise<string>;
    resolvePopup(popupId: string, result: PopupResult): Promise<void>;
    closePopup(popupId: string): Promise<void>;
    closeAllPopups(vscodeInstanceId?: string): Promise<string[]>;
    waitForPopupResponse(popupId: string, timeout?: number): Promise<PopupResult>;
    waitForAnyPopupResponse(timeout?: number): Promise<PopupResult>;
    getActivePopups(vscodeInstanceId?: string): PopupInstance[];
    getPopup(popupId: string): PopupInstance | undefined;
    getAllPopups(): PopupInstance[];
    getActivePopupCount(): number;
    private timeoutPopup;
    getStats(): {
        totalPopups: number;
        activePopups: number;
        resolvedPopups: number;
        timeoutPopups: number;
        cancelledPopups: number;
        waitingClients: number;
    };
    cleanup(): void;
}
//# sourceMappingURL=popup-manager.d.ts.map