import * as vscode from 'vscode';
import { ExtensionConfig } from '../types';

export class ConfigManager {
    private static readonly CONFIG_SECTION = 'redPillMcp';

    getConfig(): ExtensionConfig {
        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        
        return {
            mcpServerUrl: config.get('mcpServerUrl', 'ws://localhost:8080'),
            autoConnect: config.get('autoConnect', true),
            popupTimeout: config.get('popupTimeout', 30000),
            maxConcurrentPopups: config.get('maxConcurrentPopups', 3),
            logLevel: config.get('logLevel', 'info') as 'debug' | 'info' | 'warn' | 'error'
        };
    }

    async updateConfig(key: keyof ExtensionConfig, value: any): Promise<void> {
        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        await config.update(key, value, vscode.ConfigurationTarget.Global);
    }

    refresh(): void {
        // Configuration is automatically refreshed when accessed via getConfig()
        // This method can be used to trigger any additional refresh logic
    }

    onConfigurationChanged(callback: (event: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(ConfigManager.CONFIG_SECTION)) {
                callback(event);
            }
        });
    }

    validateConfig(): { valid: boolean; errors: string[] } {
        const config = this.getConfig();
        const errors: string[] = [];

        // Validate MCP server URL
        try {
            new URL(config.mcpServerUrl);
        } catch {
            errors.push('Invalid MCP server URL format');
        }

        // Validate popup timeout
        if (config.popupTimeout < 0) {
            errors.push('Popup timeout must be non-negative');
        }

        // Validate max concurrent popups
        if (config.maxConcurrentPopups < 1 || config.maxConcurrentPopups > 10) {
            errors.push('Max concurrent popups must be between 1 and 10');
        }

        // Validate log level
        const validLogLevels = ['debug', 'info', 'warn', 'error'];
        if (!validLogLevels.includes(config.logLevel)) {
            errors.push('Invalid log level');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}