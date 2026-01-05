import * as vscode from 'vscode';
import { getWebviewContent } from '../../ui/webview/content';
import type { MessagePoster } from './messageHandler';

export interface WebviewMessageHandler {
    handleWebviewMessage(message: any): Promise<void>;
}

/**
 * Manages webview lifecycle (view and panel).
 * Extracted from ChatViewProvider to handle webview-related concerns.
 */
export class ChatWebviewManager implements MessagePoster {
    private _view?: vscode.WebviewView;
    private _panel?: vscode.WebviewPanel;
    private _viewMessageDisposable?: vscode.Disposable;
    private _panelMessageDisposable?: vscode.Disposable;
    private _messageHandler?: WebviewMessageHandler;

    constructor(
        private readonly _extensionUri: vscode.Uri
    ) {}

    /**
     * Set the message handler for webview messages
     */
    public setMessageHandler(handler: WebviewMessageHandler): void {
        this._messageHandler = handler;
    }

    /**
     * Get the current webview (view or panel)
     */
    public get webview(): vscode.Webview | undefined {
        return this._panel?.webview ?? this._view?.webview;
    }

    /**
     * Check if webview exists
     */
    public get hasWebview(): boolean {
        return !!(this._panel || this._view);
    }

    /**
     * Post a message to the webview
     */
    public postMessage(message: any): void {
        if (this._panel) {
            this._panel.webview.postMessage(message);
        } else if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    /**
     * Open chat as a full editor panel
     */
    public openAsPanel(): void {
        // If panel already exists, reveal it
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        // Create new panel
        this._panel = vscode.window.createWebviewPanel(
            'draagonChatPanel',
            'Draagon AI',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this._extensionUri]
            }
        );

        this._panel.webview.html = getWebviewContent(this._panel.webview, this._extensionUri);

        // Dispose of any existing panel message handler
        if (this._panelMessageDisposable) {
            this._panelMessageDisposable.dispose();
        }

        // Handle messages from panel webview
        this._panelMessageDisposable = this._panel.webview.onDidReceiveMessage(async (message) => {
            if (this._messageHandler) {
                await this._messageHandler.handleWebviewMessage(message);
            }
        });

        // Handle panel disposal
        this._panel.onDidDispose(() => {
            if (this._panelMessageDisposable) {
                this._panelMessageDisposable.dispose();
                this._panelMessageDisposable = undefined;
            }
            this._panel = undefined;
        });

        // Send initial ready state
        this.postMessage({ type: 'ready' });
    }

    /**
     * Resolve webview view (for sidebar)
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = getWebviewContent(webviewView.webview, this._extensionUri);

        // Dispose of any existing view message handler
        if (this._viewMessageDisposable) {
            this._viewMessageDisposable.dispose();
        }

        // Handle messages from sidebar webview
        this._viewMessageDisposable = webviewView.webview.onDidReceiveMessage(async (message) => {
            if (this._messageHandler) {
                await this._messageHandler.handleWebviewMessage(message);
            }
        });

        // Send initial ready state
        this.postMessage({ type: 'ready' });
    }

    /**
     * Show view in sidebar
     */
    public show(preserveFocus?: boolean): void {
        if (this._view) {
            this._view.show(preserveFocus);
        }
    }

    /**
     * Reveal panel
     */
    public revealPanel(viewColumn?: vscode.ViewColumn): void {
        if (this._panel) {
            this._panel.reveal(viewColumn);
        }
    }

    /**
     * Focus the input
     */
    public focusInput(): void {
        this.postMessage({ type: 'focusInput' });
    }

    /**
     * Dispose of webview resources
     */
    public dispose(): void {
        if (this._viewMessageDisposable) {
            this._viewMessageDisposable.dispose();
            this._viewMessageDisposable = undefined;
        }
        if (this._panelMessageDisposable) {
            this._panelMessageDisposable.dispose();
            this._panelMessageDisposable = undefined;
        }
        if (this._panel) {
            this._panel.dispose();
            this._panel = undefined;
        }
        this._view = undefined;
    }
}
