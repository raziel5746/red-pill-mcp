import { PopupWebviewProvider } from '../../../src/ui/PopupWebviewProvider';
import { TestUtils } from '../../setup';

describe('PopupWebviewProvider', () => {
  let provider: PopupWebviewProvider;
  let mockContext: any;
  let mockLogger: any;

  beforeEach(() => {
    mockContext = TestUtils.createMockExtensionContext();
    mockLogger = TestUtils.createMockLogger();
  });

  describe('webview creation', () => {
    it('should create webview panel with correct configuration', async () => {
      const config = TestUtils.createMockPopupConfig({
        title: 'Test Title',
        content: 'Test content'
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();

      expect(global.vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'redPillMcpPopup',
        'Test Title',
        global.vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            expect.objectContaining({ path: '/mock/extension/path/media' })
          ]
        }
      );

      expect(panel).toBeDefined();
      expect(panel.webview.html).toBeDefined();
    });

    it('should use default title when not provided', async () => {
      const config = TestUtils.createMockPopupConfig({
        title: '',
        content: 'Test content'
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      await provider.createWebview();

      expect(global.vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'redPillMcpPopup',
        'AI Message',
        expect.any(Number),
        expect.any(Object)
      );
    });
  });

  describe('HTML content generation', () => {
    it('should generate HTML with all popup elements', async () => {
      const config = TestUtils.createMockPopupConfig({
        title: 'Test Title',
        content: 'Test content with **bold** and *italic* text',
        buttons: [
          { id: 'yes', label: 'Yes', style: 'primary' },
          { id: 'no', label: 'No', style: 'secondary' }
        ],
        timeout: 30000
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();

      const html = panel.webview.html;

      // Check title
      expect(html).toContain('<h2 class="popup-title">Test Title</h2>');
      
      // Check content formatting
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<em>italic</em>');
      
      // Check buttons
      expect(html).toContain('data-button-id="yes"');
      expect(html).toContain('data-button-id="no"');
      expect(html).toContain('popup-button--primary');
      expect(html).toContain('popup-button--secondary');
      
      // Check timeout display
      expect(html).toContain('Timeout: 30s');
      
      // Check popup ID
      expect(html).toContain(`ID: ${config.id}`);
    });

    it('should handle popup without buttons', async () => {
      const config = TestUtils.createMockPopupConfig({
        buttons: undefined
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();

      const html = panel.webview.html;
      expect(html).not.toContain('popup-actions');
    });

    it('should handle popup without timeout', async () => {
      const config = TestUtils.createMockPopupConfig({
        timeout: undefined
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();

      const html = panel.webview.html;
      expect(html).not.toContain('timeoutDisplay');
    });

    it('should include metadata when provided', async () => {
      const config = TestUtils.createMockPopupConfig({
        metadata: {
          source: 'test',
          priority: 'high',
          data: { key: 'value' }
        }
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();

      const html = panel.webview.html;
      expect(html).toContain('popup-metadata');
      expect(html).toContain('Additional Information');
      expect(html).toContain('"source": "test"');
      expect(html).toContain('"priority": "high"');
    });
  });

  describe('content formatting', () => {
    it('should format markdown-like content', async () => {
      const config = TestUtils.createMockPopupConfig({
        content: '**Bold text** and *italic text* and `code` and [link](http://example.com)'
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();
      const html = panel.webview.html;

      expect(html).toContain('<strong>Bold text</strong>');
      expect(html).toContain('<em>italic text</em>');
      expect(html).toContain('<code>code</code>');
      expect(html).toContain('<a href="http://example.com" target="_blank">link</a>');
    });

    it('should handle line breaks', async () => {
      const config = TestUtils.createMockPopupConfig({
        content: 'Line 1\nLine 2\nLine 3'
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();
      const html = panel.webview.html;

      expect(html).toContain('Line 1<br>Line 2<br>Line 3');
    });

    it('should escape HTML characters', async () => {
      const config = TestUtils.createMockPopupConfig({
        content: '<script>alert("xss")</script> & other < > " \' characters'
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();
      const html = panel.webview.html;

      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&amp;');
      expect(html).toContain('&lt;');
      expect(html).toContain('&gt;');
      expect(html).toContain('&quot;');
      expect(html).toContain('&#39;');
    });
  });

  describe('button styling', () => {
    it('should apply correct button styles', async () => {
      const config = TestUtils.createMockPopupConfig({
        buttons: [
          { id: 'primary', label: 'Primary', style: 'primary' },
          { id: 'secondary', label: 'Secondary', style: 'secondary' },
          { id: 'danger', label: 'Danger', style: 'danger' },
          { id: 'default', label: 'Default' } // No style specified
        ]
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();
      const html = panel.webview.html;

      expect(html).toContain('popup-button--primary');
      expect(html).toContain('popup-button--secondary');
      expect(html).toContain('popup-button--danger');
      
      // Default style should be secondary
      const defaultButtonMatch = html.match(/data-button-id="default"[^>]*class="[^"]*popup-button--secondary/);
      expect(defaultButtonMatch).toBeTruthy();
    });

    it('should include button actions when specified', async () => {
      const config = TestUtils.createMockPopupConfig({
        buttons: [
          { id: 'action', label: 'Action Button', style: 'primary', action: 'submit_form' }
        ]
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();
      const html = panel.webview.html;

      expect(html).toContain('data-action="submit_form"');
    });

    it('should handle empty action attribute', async () => {
      const config = TestUtils.createMockPopupConfig({
        buttons: [
          { id: 'no-action', label: 'No Action', style: 'primary' }
        ]
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();
      const html = panel.webview.html;

      expect(html).toContain('data-action=""');
    });
  });

  describe('security', () => {
    it('should include proper Content Security Policy', async () => {
      const config = TestUtils.createMockPopupConfig();

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();
      const html = panel.webview.html;

      expect(html).toContain('Content-Security-Policy');
      expect(html).toContain("default-src 'none'");
      expect(html).toContain('style-src vscode-webview:');
      expect(html).toContain('script-src vscode-webview:');
    });

    it('should use webview URI for resources', async () => {
      const config = TestUtils.createMockPopupConfig();

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();
      const html = panel.webview.html;

      // Check that asWebviewUri was called for CSS and JS
      expect(global.vscode.Uri.joinPath).toHaveBeenCalledWith(
        mockContext.extensionUri,
        'media',
        'popup.css'
      );
      expect(global.vscode.Uri.joinPath).toHaveBeenCalledWith(
        mockContext.extensionUri,
        'media',
        'popup.js'
      );
    });
  });

  describe('JavaScript integration', () => {
    it('should embed popup configuration in script', async () => {
      const config = TestUtils.createMockPopupConfig({
        id: 'test-popup-123',
        title: 'Test Config',
        timeout: 15000
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();
      const html = panel.webview.html;

      expect(html).toContain('const popupConfig = {');
      expect(html).toContain('"id":"test-popup-123"');
      expect(html).toContain('"title":"Test Config"');
      expect(html).toContain('"timeout":15000');
    });

    it('should include VS Code API acquisition', async () => {
      const config = TestUtils.createMockPopupConfig();

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();
      const html = panel.webview.html;

      expect(html).toContain('const vscode = acquireVsCodeApi();');
    });
  });

  describe('edge cases', () => {
    it('should handle empty title and content', async () => {
      const config = TestUtils.createMockPopupConfig({
        title: '',
        content: ''
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();

      expect(panel.webview.html).toBeDefined();
    });

    it('should handle special characters in popup ID', async () => {
      const config = TestUtils.createMockPopupConfig({
        id: 'popup-with-special-chars-<>&"\''
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();
      const html = panel.webview.html;

      // ID should be properly escaped in HTML
      expect(html).toContain('popup-with-special-chars-&lt;&gt;&amp;&quot;&#39;');
    });

    it('should handle very long content', async () => {
      const longContent = 'A'.repeat(10000);
      const config = TestUtils.createMockPopupConfig({
        content: longContent
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      
      expect(async () => {
        await provider.createWebview();
      }).not.toThrow();
    });

    it('should handle many buttons', async () => {
      const manyButtons = Array.from({ length: 10 }, (_, i) => ({
        id: `btn-${i}`,
        label: `Button ${i}`,
        style: 'secondary' as const
      }));

      const config = TestUtils.createMockPopupConfig({
        buttons: manyButtons
      });

      provider = new PopupWebviewProvider(mockContext, config, mockLogger);
      const panel = await provider.createWebview();
      const html = panel.webview.html;

      // All buttons should be present
      for (let i = 0; i < 10; i++) {
        expect(html).toContain(`data-button-id="btn-${i}"`);
        expect(html).toContain(`Button ${i}`);
      }
    });
  });
});