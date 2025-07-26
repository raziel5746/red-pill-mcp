import * as vscode from 'vscode';
import { ExtensionConfig } from '../types';
export declare class ConfigManager {
    private static readonly CONFIG_SECTION;
    getConfig(): ExtensionConfig;
    updateConfig(key: keyof ExtensionConfig, value: any): Promise<void>;
    refresh(): void;
    onConfigurationChanged(callback: (event: vscode.ConfigurationChangeEvent) => void): vscode.Disposable;
    validateConfig(): {
        valid: boolean;
        errors: string[];
    };
}
//# sourceMappingURL=ConfigManager.d.ts.map