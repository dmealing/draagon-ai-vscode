import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ClaudeOAuthAccount {
    accountUuid: string;
    emailAddress: string;
    organizationUuid: string;
    hasExtraUsageEnabled: boolean;
    displayName: string;
    organizationRole: string;
    workspaceRole: string | null;
    organizationName: string;
}

export interface ClaudeConfig {
    oauthAccount?: ClaudeOAuthAccount;
    hasAvailableSubscription?: boolean;
    userID?: string;
    numStartups?: number;
    installMethod?: string;
    hasCompletedOnboarding?: boolean;
    promptQueueUseCount?: number;
    firstStartTime?: string;
}

export interface ClaudeAccountInfo {
    authenticated: boolean;
    authType: 'oauth' | 'api_key' | 'none';
    email?: string;
    displayName?: string;
    organizationName?: string;
    organizationRole?: string;
    hasSubscription?: boolean;
    hasExtraUsage?: boolean;
    apiKeyPrefix?: string;
    numStartups?: number;
    promptCount?: number;
    memberSince?: string;
    installMethod?: string;
    error?: string;
}

export class AccountViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'draagon.accountView';

    private _view?: vscode.WebviewView;
    private _accountInfo: ClaudeAccountInfo = {
        authenticated: false,
        authType: 'none'
    };
    private _isLoading: boolean = false;

    constructor(private readonly _context: vscode.ExtensionContext) {
        // Refresh account info on initialization
        this._fetchAccountInfo().then(info => {
            this._accountInfo = info;
            this._updateView();
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };

        webviewView.webview.html = this._getHtmlContent();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'refresh':
                    this.refresh();
                    break;
                case 'login':
                    vscode.commands.executeCommand('draagon.authenticateClaude');
                    break;
                case 'switchAccount':
                    vscode.commands.executeCommand('draagon.switchAccount');
                    break;
                case 'openClaude':
                    vscode.env.openExternal(vscode.Uri.parse('https://claude.ai'));
                    break;
            }
        });
    }

    public async refresh(): Promise<void> {
        this._isLoading = true;
        this._updateView();

        try {
            this._accountInfo = await this._fetchAccountInfo();
        } catch (error) {
            this._accountInfo = {
                authenticated: false,
                authType: 'none',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }

        this._isLoading = false;
        this._updateView();
    }

    private _updateView(): void {
        if (this._view) {
            this._view.webview.html = this._getHtmlContent();
        }
    }

    private async _fetchAccountInfo(): Promise<ClaudeAccountInfo> {
        // Try to read from Claude's config file directly
        const claudeConfigPath = path.join(os.homedir(), '.claude.json');

        try {
            if (fs.existsSync(claudeConfigPath)) {
                const configContent = fs.readFileSync(claudeConfigPath, 'utf-8');
                const config: ClaudeConfig = JSON.parse(configContent);

                if (config.oauthAccount) {
                    const account = config.oauthAccount;
                    // Parse member since date
                    let memberSince: string | undefined;
                    if (config.firstStartTime) {
                        try {
                            const date = new Date(config.firstStartTime);
                            memberSince = date.toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                            });
                        } catch {
                            // Ignore parse errors
                        }
                    }
                    return {
                        authenticated: true,
                        authType: 'oauth',
                        email: account.emailAddress,
                        displayName: account.displayName,
                        organizationName: account.organizationName,
                        organizationRole: account.organizationRole,
                        hasSubscription: config.hasAvailableSubscription,
                        hasExtraUsage: account.hasExtraUsageEnabled,
                        numStartups: config.numStartups,
                        promptCount: config.promptQueueUseCount,
                        memberSince,
                        installMethod: config.installMethod
                    };
                }
            }
        } catch (error) {
            console.error('Failed to read Claude config:', error);
        }

        // Check for API key in environment or VS Code config
        const vsConfig = vscode.workspace.getConfiguration('draagon');
        const apiKey = process.env.ANTHROPIC_API_KEY || vsConfig.get<string>('anthropic.apiKey');

        if (apiKey) {
            return {
                authenticated: true,
                authType: 'api_key',
                apiKeyPrefix: `${apiKey.substring(0, 12)}...`,
                displayName: 'API Key User'
            };
        }

        return {
            authenticated: false,
            authType: 'none',
            error: 'Not authenticated. Run "claude login" in terminal.'
        };
    }

    public getAccountInfo(): ClaudeAccountInfo {
        return this._accountInfo;
    }

    private _getHtmlContent(): string {
        const info = this._accountInfo;

        // Theme colors - using VS Code theme variables for consistency
        // --vscode-textLink-foreground gives us the theme's link/accent color
        // --vscode-button-background gives us the theme's button color

        let content = '';

        if (this._isLoading) {
            content = `
                <div class="loading">
                    <span class="codicon codicon-sync spin"></span>
                    <span>Loading...</span>
                </div>
            `;
        } else if (info.authenticated) {
            // Shorten org name if it's the default email-based one
            let orgDisplay = info.organizationName || '';
            if (orgDisplay.endsWith("'s Organization")) {
                orgDisplay = 'Personal';
            }

            content = `
                <div class="section">
                    <div class="row">
                        <span class="codicon codicon-account"></span>
                        <span class="label">User</span>
                        <span class="value">${this._escapeHtml(info.displayName || 'Unknown')}</span>
                    </div>
                    ${info.email ? `
                    <div class="row">
                        <span class="codicon codicon-mail"></span>
                        <span class="label">Email</span>
                        <span class="value">${this._escapeHtml(info.email)}</span>
                    </div>
                    ` : ''}
                    <div class="row">
                        <span class="codicon codicon-${info.authType === 'api_key' ? 'key' : 'verified'}"></span>
                        <span class="label">Auth</span>
                        <span class="value">${info.authType === 'api_key' ? 'API Key' : 'OAuth'}</span>
                    </div>
                    ${info.apiKeyPrefix ? `
                    <div class="row">
                        <span class="codicon codicon-key"></span>
                        <span class="label">Key</span>
                        <span class="value">${this._escapeHtml(info.apiKeyPrefix)}</span>
                    </div>
                    ` : ''}
                    ${orgDisplay ? `
                    <div class="row">
                        <span class="codicon codicon-organization"></span>
                        <span class="label">Organization</span>
                        <span class="value">${this._escapeHtml(orgDisplay)}</span>
                    </div>
                    ` : ''}
                    ${info.organizationRole ? `
                    <div class="row">
                        <span class="codicon codicon-person"></span>
                        <span class="label">Role</span>
                        <span class="value">${this._escapeHtml(info.organizationRole)}</span>
                    </div>
                    ` : ''}
                </div>

                <div class="section-divider">Status</div>
                <div class="section">
                    <div class="row">
                        <span class="codicon codicon-${info.hasSubscription ? 'star-full' : 'star-empty'}"></span>
                        <span class="label">Subscription</span>
                        <span class="value ${info.hasSubscription ? 'success' : ''}">${info.hasSubscription ? 'Active' : 'None'}</span>
                    </div>
                    <div class="row">
                        <span class="codicon codicon-${info.hasExtraUsage ? 'rocket' : 'circle-slash'}"></span>
                        <span class="label">Extra Usage</span>
                        <span class="value">${info.hasExtraUsage ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    ${info.numStartups !== undefined ? `
                    <div class="row">
                        <span class="codicon codicon-terminal"></span>
                        <span class="label">Sessions</span>
                        <span class="value">${info.numStartups.toLocaleString()}</span>
                    </div>
                    ` : ''}
                    ${info.promptCount !== undefined ? `
                    <div class="row">
                        <span class="codicon codicon-comment-discussion"></span>
                        <span class="label">Prompts</span>
                        <span class="value">${info.promptCount.toLocaleString()}</span>
                    </div>
                    ` : ''}
                    ${info.memberSince ? `
                    <div class="row">
                        <span class="codicon codicon-calendar"></span>
                        <span class="label">Member Since</span>
                        <span class="value">${this._escapeHtml(info.memberSince)}</span>
                    </div>
                    ` : ''}
                    ${info.installMethod ? `
                    <div class="row">
                        <span class="codicon codicon-package"></span>
                        <span class="label">Install</span>
                        <span class="value">${this._escapeHtml(info.installMethod)}</span>
                    </div>
                    ` : ''}
                </div>

                <div class="section-divider">Actions</div>
                <div class="actions">
                    <button class="btn btn-primary" onclick="action('refresh')">
                        <span class="codicon codicon-refresh"></span>
                        Refresh
                    </button>
                    <button class="btn btn-primary" onclick="action('switchAccount')">
                        <span class="codicon codicon-arrow-swap"></span>
                        Switch Account
                    </button>
                    <button class="btn btn-primary" onclick="action('openClaude')">
                        <span class="codicon codicon-link-external"></span>
                        Open Claude
                    </button>
                </div>
            `;
        } else {
            content = `
                <div class="section">
                    <div class="row error-row">
                        <span class="codicon codicon-error"></span>
                        <span class="error-text">Not Authenticated</span>
                    </div>
                    ${info.error ? `
                    <div class="row">
                        <span class="codicon codicon-info"></span>
                        <span class="error-detail">${this._escapeHtml(info.error)}</span>
                    </div>
                    ` : ''}
                </div>

                <div class="actions">
                    <button class="btn btn-primary" onclick="action('login')">
                        <span class="codicon codicon-sign-in"></span>
                        Login to Claude
                    </button>
                    <button class="btn btn-secondary" onclick="action('refresh')">
                        <span class="codicon codicon-refresh"></span>
                        Refresh
                    </button>
                </div>
            `;
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://unpkg.com/@vscode/codicons/dist/codicon.css" rel="stylesheet">
    <style>
        :root {
            /* Use VS Code theme colors for consistency */
            --value-color: var(--vscode-textLink-foreground);
            --accent-blue: var(--vscode-button-background);
            --bg: var(--vscode-sideBar-background);
            --fg: var(--vscode-sideBar-foreground);
            --border: var(--vscode-panel-border);
            --label-color: var(--vscode-descriptionForeground);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: 12px;
            color: var(--fg);
            background: var(--bg);
            padding: 8px;
        }

        .loading {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 20px;
            justify-content: center;
            color: var(--label-color);
        }

        .spin {
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .section {
            margin-bottom: 12px;
        }

        .section-divider {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--label-color);
            padding: 8px 0 4px 0;
            border-top: 1px solid var(--border);
            margin-top: 8px;
        }

        .row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
        }

        .row .codicon {
            width: 16px;
            text-align: center;
            color: var(--label-color);
            flex-shrink: 0;
        }

        .label {
            color: var(--label-color);
            min-width: 80px;
        }

        .value {
            color: var(--value-color);
            font-weight: 500;
            flex: 1;
            word-break: break-word;
        }

        .value.success {
            color: #4CAF50;
        }

        .error-row {
            color: #f44336;
        }

        .error-text {
            color: #f44336;
            font-weight: 500;
        }

        .error-detail {
            color: var(--label-color);
            font-size: 11px;
        }

        .actions {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding-top: 8px;
        }

        .btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px 12px;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            font-family: inherit;
            cursor: pointer;
            transition: opacity 0.15s, transform 0.1s;
        }

        .btn:hover {
            opacity: 0.9;
        }

        .btn:active {
            transform: scale(0.98);
        }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn .codicon {
            font-size: 14px;
        }
    </style>
</head>
<body>
    ${content}

    <script>
        const vscode = acquireVsCodeApi();

        function action(type) {
            vscode.postMessage({ type });
        }
    </script>
</body>
</html>`;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
