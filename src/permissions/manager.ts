import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface PermissionRequest {
    requestId: string;
    toolName: string;
    toolUseId: string;
    input: Record<string, unknown>;
    suggestions?: string[];
}

export interface PermissionResponse {
    requestId: string;
    allowed: boolean;
    alwaysAllow?: boolean;
    pattern?: string;
}

export interface PermissionConfig {
    alwaysAllow: {
        [toolName: string]: boolean | string[];
    };
    yoloMode: boolean;
}

// Tools that are safe by default and don't require permission
const SAFE_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'Task', 'TodoRead'];

// Common command patterns for quick approval
export const COMMON_PATTERNS = {
    npm: ['npm *', 'npm install *', 'npm run *', 'npm test', 'npm build'],
    yarn: ['yarn *', 'yarn add *', 'yarn run *', 'yarn test', 'yarn build'],
    pnpm: ['pnpm *', 'pnpm add *', 'pnpm run *', 'pnpm test', 'pnpm build'],
    git: ['git *', 'git status', 'git diff *', 'git log *', 'git branch *', 'git checkout *', 'git add *', 'git commit *'],
    docker: ['docker *', 'docker build *', 'docker run *', 'docker compose *'],
    python: ['python *', 'python3 *', 'pip *', 'pip3 *'],
    node: ['node *', 'npx *', 'tsx *', 'ts-node *'],
    testing: ['jest *', 'vitest *', 'pytest *', 'cargo test *', 'go test *'],
    build: ['make *', 'cargo build *', 'go build *', 'tsc *', 'webpack *', 'vite *']
};

export class PermissionManager {
    private config: PermissionConfig;
    private permissionsPath: string;
    private pendingRequests: Map<string, PermissionRequest> = new Map();
    private _onPermissionRequest = new vscode.EventEmitter<PermissionRequest>();
    public readonly onPermissionRequest = this._onPermissionRequest.event;
    private _initialized: Promise<void>;
    private _saveInProgress: Promise<void> | null = null;

    constructor(private context: vscode.ExtensionContext) {
        const storagePath = context.storageUri?.fsPath || context.globalStorageUri.fsPath;
        this.permissionsPath = path.join(storagePath, 'permissions', 'permissions.json');
        this.config = this.getDefaultConfig();
        // Start async initialization
        this._initialized = this.initializeAsync();
    }

    /**
     * Wait for the manager to be fully initialized.
     * Call this before using the manager if you need config loaded from disk.
     */
    public async waitForInitialization(): Promise<void> {
        return this._initialized;
    }

    private getDefaultConfig(): PermissionConfig {
        return {
            alwaysAllow: {
                Read: true,
                Glob: true,
                Grep: true,
                LS: true,
                Task: true,
                TodoRead: true
            },
            yoloMode: false
        };
    }

    private async initializeAsync(): Promise<void> {
        try {
            const dir = path.dirname(this.permissionsPath);
            await fs.promises.mkdir(dir, { recursive: true });

            try {
                const content = await fs.promises.readFile(this.permissionsPath, 'utf-8');
                this.config = JSON.parse(content);
            } catch {
                // File doesn't exist or is invalid, use defaults
                this.config = this.getDefaultConfig();
            }
        } catch (error) {
            console.error('Failed to initialize permissions:', error);
        }
    }

    private async saveConfigAsync(): Promise<void> {
        // Wait for any in-progress save to complete
        if (this._saveInProgress) {
            await this._saveInProgress;
        }

        this._saveInProgress = (async () => {
            try {
                const dir = path.dirname(this.permissionsPath);
                await fs.promises.mkdir(dir, { recursive: true });
                await fs.promises.writeFile(this.permissionsPath, JSON.stringify(this.config, null, 2));
            } catch (error) {
                console.error('Failed to save permissions config:', error);
            } finally {
                this._saveInProgress = null;
            }
        })();

        return this._saveInProgress;
    }

    public isYoloMode(): boolean {
        return this.config.yoloMode;
    }

    public async setYoloMode(enabled: boolean): Promise<void> {
        this.config.yoloMode = enabled;
        await this.saveConfigAsync();
    }

    public isSafeTool(toolName: string): boolean {
        return SAFE_TOOLS.includes(toolName);
    }

    public isToolAllowed(toolName: string, input: Record<string, unknown>): boolean {
        // YOLO mode approves everything
        if (this.config.yoloMode) {
            return true;
        }

        // Safe tools are always allowed
        if (this.isSafeTool(toolName)) {
            return true;
        }

        const toolPermission = this.config.alwaysAllow[toolName];

        // Tool is fully approved
        if (toolPermission === true) {
            return true;
        }

        // Check pattern matching for Bash
        if (Array.isArray(toolPermission) && toolName === 'Bash' && input.command) {
            const command = String(input.command).trim();
            for (const pattern of toolPermission) {
                if (this.matchesPattern(command, pattern)) {
                    return true;
                }
            }
        }

        return false;
    }

    private matchesPattern(command: string, pattern: string): boolean {
        // Exact match
        if (pattern === command) {
            return true;
        }

        // Wildcard pattern like "npm *"
        if (pattern.endsWith(' *')) {
            const prefix = pattern.slice(0, -1); // Remove the *
            return command.startsWith(prefix);
        }

        // Full wildcard
        if (pattern === '*') {
            return true;
        }

        // Regex-style pattern (starts with ^)
        if (pattern.startsWith('^')) {
            try {
                const regex = new RegExp(pattern);
                return regex.test(command);
            } catch {
                return false;
            }
        }

        return false;
    }

    public async requestPermission(request: PermissionRequest): Promise<PermissionResponse> {
        // Ensure initialized
        await this._initialized;

        // Check if already allowed
        if (this.isToolAllowed(request.toolName, request.input)) {
            return {
                requestId: request.requestId,
                allowed: true
            };
        }

        // Store pending request
        this.pendingRequests.set(request.requestId, request);

        // Emit event for UI to handle
        this._onPermissionRequest.fire(request);

        // Wait for response using Promise-based approach
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (!this.pendingRequests.has(request.requestId)) {
                    clearInterval(checkInterval);
                    // Request was handled, get stored response
                    const response = this.context.workspaceState.get<PermissionResponse>(`permission_response_${request.requestId}`);
                    this.context.workspaceState.update(`permission_response_${request.requestId}`, undefined);
                    resolve(response || { requestId: request.requestId, allowed: false });
                }
            }, 100);

            // Timeout after 5 minutes
            setTimeout(() => {
                clearInterval(checkInterval);
                this.pendingRequests.delete(request.requestId);
                resolve({ requestId: request.requestId, allowed: false });
            }, 300000);
        });
    }

    public async handlePermissionResponse(response: PermissionResponse): Promise<void> {
        const request = this.pendingRequests.get(response.requestId);
        if (!request) {
            return;
        }

        // Handle "Always Allow"
        if (response.allowed && response.alwaysAllow) {
            if (response.pattern && request.toolName === 'Bash') {
                // Add pattern for Bash commands
                const patterns = this.config.alwaysAllow[request.toolName];
                if (Array.isArray(patterns)) {
                    if (!patterns.includes(response.pattern)) {
                        patterns.push(response.pattern);
                    }
                } else {
                    this.config.alwaysAllow[request.toolName] = [response.pattern];
                }
            } else {
                // Full tool approval
                this.config.alwaysAllow[request.toolName] = true;
            }
            await this.saveConfigAsync();
        }

        // Store response and remove from pending
        await this.context.workspaceState.update(`permission_response_${response.requestId}`, response);
        this.pendingRequests.delete(response.requestId);
    }

    public getPermissions(): PermissionConfig {
        return { ...this.config };
    }

    public async removePermission(toolName: string, pattern?: string): Promise<void> {
        if (pattern && Array.isArray(this.config.alwaysAllow[toolName])) {
            const patterns = this.config.alwaysAllow[toolName] as string[];
            const index = patterns.indexOf(pattern);
            if (index > -1) {
                patterns.splice(index, 1);
            }
            if (patterns.length === 0) {
                delete this.config.alwaysAllow[toolName];
            }
        } else {
            delete this.config.alwaysAllow[toolName];
        }
        await this.saveConfigAsync();
    }

    public async clearAllPermissions(): Promise<void> {
        this.config = this.getDefaultConfig();
        await this.saveConfigAsync();
    }

    public getSuggestedPatterns(command: string): string[] {
        const suggestions: string[] = [];
        const parts = command.trim().split(/\s+/);
        const baseCommand = parts[0];

        // Add base command wildcard
        suggestions.push(`${baseCommand} *`);

        // Add exact command
        if (parts.length > 1) {
            suggestions.push(command);
        }

        // Add relevant common patterns
        for (const [, patterns] of Object.entries(COMMON_PATTERNS)) {
            for (const pattern of patterns) {
                if (pattern.startsWith(baseCommand) && this.matchesPattern(command, pattern)) {
                    if (!suggestions.includes(pattern)) {
                        suggestions.push(pattern);
                    }
                }
            }
        }

        return suggestions.slice(0, 5); // Limit to 5 suggestions
    }

    public dispose(): void {
        this._onPermissionRequest.dispose();
    }
}
