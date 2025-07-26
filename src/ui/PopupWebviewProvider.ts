import * as vscode from 'vscode';
import { PopupConfig } from '../types';
import { Logger } from '../utils/Logger';

export class PopupWebviewProvider {
    private context: vscode.ExtensionContext;
    private config: PopupConfig;
    private logger: Logger;

    constructor(context: vscode.ExtensionContext, config: PopupConfig, logger: Logger) {
        this.context = context;
        this.config = config;
        this.logger = logger;
    }

    async createWebview(): Promise<vscode.WebviewPanel> {
        const panel = vscode.window.createWebviewPanel(
            'redPillMcpPopup',
            this.config.title || 'AI Message',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media')
                ]
            }
        );

        // Set the HTML content
        panel.webview.html = this.getWebviewContent(panel.webview);

        return panel;
    }

    private getWebviewContent(webview: vscode.Webview): string {
        // Get URIs for resources
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'popup.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'popup.js')
        );

        // Generate buttons HTML
        const buttonsHtml = this.config.buttons?.map(button => `
            <button 
                class="popup-button popup-button--${button.style || 'secondary'}" 
                data-button-id="${button.id}"
                data-action="${button.action || ''}"
            >
                ${this.escapeHtml(button.label)}
            </button>
        `).join('') || '';

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};">
            <link href="${styleUri}" rel="stylesheet">
            <title>${this.escapeHtml(this.config.title || 'AI Message')}</title>
        </head>
        <body>
            <div class="popup-container">
                <div class="popup-header">
                    <h2 class="popup-title">${this.escapeHtml(this.config.title || 'AI Message')}</h2>
                    <button class="popup-close" id="closeButton" title="Close">×</button>
                </div>
                
                <div class="popup-content">
                    <div class="popup-message">
                        ${this.formatContent(this.config.content)}
                    </div>
                    
                    ${this.config.metadata ? `
                        <div class="popup-metadata">
                            <details>
                                <summary>Additional Information</summary>
                                <pre>${this.escapeHtml(JSON.stringify(this.config.metadata, null, 2))}</pre>
                            </details>
                        </div>
                    ` : ''}
                </div>
                
                ${buttonsHtml ? `
                    <div class="popup-actions">
                        ${buttonsHtml}
                    </div>
                ` : ''}
                
                <div class="popup-footer">
                    <span class="popup-id">ID: ${this.escapeHtml(this.config.id)}</span>
                    ${this.config.timeout ? `
                        <span class="popup-timeout">
                            <span id="timeoutDisplay">Timeout: ${Math.ceil(this.config.timeout / 1000)}s</span>
                        </span>
                    ` : ''}
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                const popupConfig = ${JSON.stringify(this.config)};
            </script>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    private formatContent(content: string): string {
        // Basic markdown-like formatting
        let formatted = this.escapeHtml(content);
        
        // Convert line breaks
        formatted = formatted.replace(/\n/g, '<br>');
        
        // Convert **bold** to <strong>
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Convert *italic* to <em>
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Convert `code` to <code>
        formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
        
        // Convert [link](url) to <a>
        formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        return formatted;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}