import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface BrowserPage {
    id: string;
    url: string;
    title: string;
    screenshot?: string; // Base64
}

export interface BrowserAction {
    type: 'navigate' | 'click' | 'type' | 'scroll' | 'screenshot' | 'evaluate' | 'wait' | 'select';
    selector?: string;
    value?: string;
    url?: string;
    script?: string;
    timeout?: number;
}

export interface BrowserResult {
    success: boolean;
    action: BrowserAction;
    result?: unknown;
    screenshot?: string;
    error?: string;
    duration: number;
}

export interface AccessibilityNode {
    role: string;
    name: string;
    description?: string;
    value?: string;
    children?: AccessibilityNode[];
    bounds?: { x: number; y: number; width: number; height: number };
    focusable?: boolean;
    focused?: boolean;
}

export class BrowserController extends EventEmitter {
    private _puppeteerProcess: ChildProcess | null = null;
    private _wsEndpoint: string | null = null;
    private _currentPage: BrowserPage | null = null;
    private _history: BrowserResult[] = [];
    private _onPageUpdate: vscode.EventEmitter<BrowserPage | null> = new vscode.EventEmitter();
    private _onActionComplete: vscode.EventEmitter<BrowserResult> = new vscode.EventEmitter();

    public readonly onPageUpdate = this._onPageUpdate.event;
    public readonly onActionComplete = this._onActionComplete.event;

    constructor() {
        super();
    }

    public async launch(options?: {
        headless?: boolean;
        viewport?: { width: number; height: number };
    }): Promise<boolean> {
        const headless = options?.headless ?? true;
        const viewport = options?.viewport ?? { width: 1280, height: 720 };

        try {
            // Check if Puppeteer MCP server is available
            // For now, we'll create a simple browser control interface
            // that can work with Chrome DevTools Protocol

            // Try to launch Chrome with remote debugging
            const chromePath = await this._findChrome();
            if (!chromePath) {
                vscode.window.showErrorMessage(
                    'Chrome/Chromium not found. Install Chrome or use the Puppeteer MCP server.'
                );
                return false;
            }

            const debugPort = 9222 + Math.floor(Math.random() * 1000);

            this._puppeteerProcess = spawn(chromePath, [
                `--remote-debugging-port=${debugPort}`,
                headless ? '--headless=new' : '',
                '--no-first-run',
                '--no-default-browser-check',
                `--window-size=${viewport.width},${viewport.height}`,
                '--disable-gpu',
                '--disable-extensions',
                'about:blank'
            ].filter(Boolean));

            // Wait for Chrome to start
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Get WebSocket endpoint
            try {
                const response = await fetch(`http://localhost:${debugPort}/json/version`);
                const data = await response.json() as { webSocketDebuggerUrl: string };
                this._wsEndpoint = data.webSocketDebuggerUrl;
            } catch {
                // Chrome might need more time
                await new Promise(resolve => setTimeout(resolve, 1000));
                const response = await fetch(`http://localhost:${debugPort}/json/version`);
                const data = await response.json() as { webSocketDebuggerUrl: string };
                this._wsEndpoint = data.webSocketDebuggerUrl;
            }

            this._currentPage = {
                id: 'main',
                url: 'about:blank',
                title: 'New Tab'
            };

            this._onPageUpdate.fire(this._currentPage);
            return true;

        } catch (error) {
            console.error('Failed to launch browser:', error);
            vscode.window.showErrorMessage(`Failed to launch browser: ${error}`);
            return false;
        }
    }

    private async _findChrome(): Promise<string | null> {
        const paths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ];

        for (const chromePath of paths) {
            try {
                const { execSync } = require('child_process');
                execSync(`test -f "${chromePath}"`, { stdio: 'ignore' });
                return chromePath;
            } catch {
                // Path doesn't exist, try next
            }
        }

        // Try which command
        try {
            const { execSync } = require('child_process');
            const result = execSync('which google-chrome || which chromium || which chromium-browser', {
                encoding: 'utf-8'
            });
            return result.trim();
        } catch {
            return null;
        }
    }

    public async navigate(url: string): Promise<BrowserResult> {
        const startTime = Date.now();
        const action: BrowserAction = { type: 'navigate', url };

        try {
            // Send navigation command via CDP
            // This is a simplified version - full implementation would use WebSocket
            if (this._currentPage) {
                this._currentPage.url = url;
                this._currentPage.title = 'Loading...';
                this._onPageUpdate.fire(this._currentPage);
            }

            // Simulate navigation (real implementation uses CDP)
            await new Promise(resolve => setTimeout(resolve, 500));

            if (this._currentPage) {
                this._currentPage.title = new URL(url).hostname;
                this._onPageUpdate.fire(this._currentPage);
            }

            const result: BrowserResult = {
                success: true,
                action,
                duration: Date.now() - startTime
            };

            this._history.push(result);
            this._onActionComplete.fire(result);
            return result;

        } catch (error) {
            const result: BrowserResult = {
                success: false,
                action,
                error: String(error),
                duration: Date.now() - startTime
            };

            this._history.push(result);
            this._onActionComplete.fire(result);
            return result;
        }
    }

    public async click(selector: string): Promise<BrowserResult> {
        const startTime = Date.now();
        const action: BrowserAction = { type: 'click', selector };

        try {
            // CDP click command would go here
            await new Promise(resolve => setTimeout(resolve, 100));

            const result: BrowserResult = {
                success: true,
                action,
                duration: Date.now() - startTime
            };

            this._history.push(result);
            this._onActionComplete.fire(result);
            return result;

        } catch (error) {
            const result: BrowserResult = {
                success: false,
                action,
                error: String(error),
                duration: Date.now() - startTime
            };

            this._history.push(result);
            this._onActionComplete.fire(result);
            return result;
        }
    }

    public async type(selector: string, text: string): Promise<BrowserResult> {
        const startTime = Date.now();
        const action: BrowserAction = { type: 'type', selector, value: text };

        try {
            // CDP type command would go here
            await new Promise(resolve => setTimeout(resolve, text.length * 10));

            const result: BrowserResult = {
                success: true,
                action,
                duration: Date.now() - startTime
            };

            this._history.push(result);
            this._onActionComplete.fire(result);
            return result;

        } catch (error) {
            const result: BrowserResult = {
                success: false,
                action,
                error: String(error),
                duration: Date.now() - startTime
            };

            this._history.push(result);
            this._onActionComplete.fire(result);
            return result;
        }
    }

    public async screenshot(): Promise<BrowserResult> {
        const startTime = Date.now();
        const action: BrowserAction = { type: 'screenshot' };

        try {
            // CDP screenshot command would go here
            // Returns base64 encoded PNG
            const screenshot = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; // Placeholder

            if (this._currentPage) {
                this._currentPage.screenshot = screenshot;
                this._onPageUpdate.fire(this._currentPage);
            }

            const result: BrowserResult = {
                success: true,
                action,
                screenshot,
                duration: Date.now() - startTime
            };

            this._history.push(result);
            this._onActionComplete.fire(result);
            return result;

        } catch (error) {
            const result: BrowserResult = {
                success: false,
                action,
                error: String(error),
                duration: Date.now() - startTime
            };

            this._history.push(result);
            this._onActionComplete.fire(result);
            return result;
        }
    }

    public async evaluate(script: string): Promise<BrowserResult> {
        const startTime = Date.now();
        const action: BrowserAction = { type: 'evaluate', script };

        try {
            // CDP evaluate command would go here
            const evalResult = { success: true };

            const result: BrowserResult = {
                success: true,
                action,
                result: evalResult,
                duration: Date.now() - startTime
            };

            this._history.push(result);
            this._onActionComplete.fire(result);
            return result;

        } catch (error) {
            const result: BrowserResult = {
                success: false,
                action,
                error: String(error),
                duration: Date.now() - startTime
            };

            this._history.push(result);
            this._onActionComplete.fire(result);
            return result;
        }
    }

    public async getAccessibilityTree(): Promise<AccessibilityNode | null> {
        // CDP Accessibility.getFullAXTree would go here
        // Returns structured accessibility information for AI navigation

        return {
            role: 'RootWebArea',
            name: this._currentPage?.title || 'Page',
            children: [
                {
                    role: 'navigation',
                    name: 'Main navigation',
                    children: []
                },
                {
                    role: 'main',
                    name: 'Main content',
                    children: []
                }
            ]
        };
    }

    public async waitForSelector(selector: string, timeout: number = 5000): Promise<BrowserResult> {
        const startTime = Date.now();
        const action: BrowserAction = { type: 'wait', selector, timeout };

        try {
            // Poll for selector existence
            const checkInterval = 100;
            let elapsed = 0;

            while (elapsed < timeout) {
                // CDP DOM.querySelector would go here
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                elapsed += checkInterval;

                // Simulate finding element
                if (Math.random() > 0.3) {
                    const result: BrowserResult = {
                        success: true,
                        action,
                        duration: Date.now() - startTime
                    };

                    this._history.push(result);
                    this._onActionComplete.fire(result);
                    return result;
                }
            }

            throw new Error(`Timeout waiting for selector: ${selector}`);

        } catch (error) {
            const result: BrowserResult = {
                success: false,
                action,
                error: String(error),
                duration: Date.now() - startTime
            };

            this._history.push(result);
            this._onActionComplete.fire(result);
            return result;
        }
    }

    public async executeActions(actions: BrowserAction[]): Promise<BrowserResult[]> {
        const results: BrowserResult[] = [];

        for (const action of actions) {
            let result: BrowserResult;

            switch (action.type) {
                case 'navigate':
                    result = await this.navigate(action.url!);
                    break;
                case 'click':
                    result = await this.click(action.selector!);
                    break;
                case 'type':
                    result = await this.type(action.selector!, action.value!);
                    break;
                case 'screenshot':
                    result = await this.screenshot();
                    break;
                case 'evaluate':
                    result = await this.evaluate(action.script!);
                    break;
                case 'wait':
                    result = await this.waitForSelector(action.selector!, action.timeout);
                    break;
                default:
                    result = {
                        success: false,
                        action,
                        error: `Unknown action type: ${action.type}`,
                        duration: 0
                    };
            }

            results.push(result);

            if (!result.success) {
                break; // Stop on first failure
            }
        }

        return results;
    }

    public getCurrentPage(): BrowserPage | null {
        return this._currentPage;
    }

    public getHistory(): BrowserResult[] {
        return [...this._history];
    }

    public clearHistory(): void {
        this._history = [];
    }

    public async close(): Promise<void> {
        if (this._puppeteerProcess) {
            this._puppeteerProcess.kill();
            this._puppeteerProcess = null;
        }

        this._wsEndpoint = null;
        this._currentPage = null;
        this._onPageUpdate.fire(null);
    }

    public isRunning(): boolean {
        return this._puppeteerProcess !== null;
    }

    // Generate prompt for AI to understand current page state
    public async generatePageContext(): Promise<string> {
        const page = this._currentPage;
        if (!page) {
            return 'No browser page is currently open.';
        }

        const accessibilityTree = await this.getAccessibilityTree();

        let context = `## Current Browser State\n\n`;
        context += `**URL:** ${page.url}\n`;
        context += `**Title:** ${page.title}\n\n`;

        if (accessibilityTree) {
            context += `### Page Structure (Accessibility Tree)\n\n`;
            context += this._formatAccessibilityTree(accessibilityTree, 0);
        }

        context += `\n### Available Actions\n`;
        context += `- navigate(url): Go to a URL\n`;
        context += `- click(selector): Click an element\n`;
        context += `- type(selector, text): Type text into an input\n`;
        context += `- screenshot(): Take a screenshot\n`;
        context += `- waitForSelector(selector): Wait for element to appear\n`;

        return context;
    }

    private _formatAccessibilityTree(node: AccessibilityNode, depth: number): string {
        const indent = '  '.repeat(depth);
        let output = `${indent}- [${node.role}] ${node.name || '(unnamed)'}`;

        if (node.value) {
            output += ` = "${node.value}"`;
        }
        if (node.focusable) {
            output += ' (focusable)';
        }

        output += '\n';

        if (node.children) {
            for (const child of node.children) {
                output += this._formatAccessibilityTree(child, depth + 1);
            }
        }

        return output;
    }

    public dispose(): void {
        this.close();
        this._onPageUpdate.dispose();
        this._onActionComplete.dispose();
    }
}
