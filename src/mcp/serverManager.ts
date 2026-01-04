import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

export interface McpServerConfig {
    id: string;
    name: string;
    description: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    enabled: boolean;
    autoStart: boolean;
    category: 'core' | 'database' | 'web' | 'integration' | 'utility' | 'custom';
    requiredEnvVars?: string[];
    installCommand?: string;
    documentationUrl?: string;
}

export interface McpServerStatus {
    id: string;
    running: boolean;
    pid?: number;
    startedAt?: string;
    lastError?: string;
    connectionCount: number;
}

export interface McpServerTemplate {
    id: string;
    name: string;
    description: string;
    command: string;
    args: string[];
    category: McpServerConfig['category'];
    requiredEnvVars?: string[];
    installCommand?: string;
    documentationUrl?: string;
    popular: boolean;
}

// Popular MCP server templates
const SERVER_TEMPLATES: McpServerTemplate[] = [
    {
        id: 'github',
        name: 'GitHub',
        description: 'Official GitHub integration for repos, PRs, issues, and CI/CD',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        category: 'integration',
        requiredEnvVars: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
        documentationUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
        popular: true
    },
    {
        id: 'filesystem',
        name: 'File System',
        description: 'Secure local file operations with permission controls',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/dir'],
        category: 'core',
        documentationUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
        popular: true
    },
    {
        id: 'postgresql',
        name: 'PostgreSQL',
        description: 'Natural language database queries and operations',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        category: 'database',
        requiredEnvVars: ['POSTGRES_CONNECTION_STRING'],
        documentationUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
        popular: true
    },
    {
        id: 'sqlite',
        name: 'SQLite',
        description: 'SQLite database management and queries',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', './database.db'],
        category: 'database',
        documentationUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
        popular: true
    },
    {
        id: 'puppeteer',
        name: 'Puppeteer',
        description: 'Browser automation and web scraping',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-puppeteer'],
        category: 'web',
        documentationUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
        popular: true
    },
    {
        id: 'brave-search',
        name: 'Brave Search',
        description: 'Web search using Brave Search API',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        category: 'web',
        requiredEnvVars: ['BRAVE_API_KEY'],
        documentationUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
        popular: true
    },
    {
        id: 'memory',
        name: 'Memory Bank',
        description: 'Persistent context retention across sessions',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        category: 'core',
        popular: true
    },
    {
        id: 'sequential-thinking',
        name: 'Sequential Thinking',
        description: 'Structured problem-solving with chain of thought',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
        category: 'core',
        popular: true
    },
    {
        id: 'slack',
        name: 'Slack',
        description: 'Team communication and channel management',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-slack'],
        category: 'integration',
        requiredEnvVars: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
        documentationUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
        popular: false
    },
    {
        id: 'notion',
        name: 'Notion',
        description: 'Notion workspace integration',
        command: 'npx',
        args: ['-y', '@notionhq/notion-mcp-server'],
        category: 'integration',
        requiredEnvVars: ['NOTION_API_KEY'],
        popular: false
    },
    {
        id: 'google-drive',
        name: 'Google Drive',
        description: 'File access and search for Google Drive',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-gdrive'],
        category: 'integration',
        requiredEnvVars: ['GOOGLE_CREDENTIALS_PATH'],
        popular: false
    },
    {
        id: 'sentry',
        name: 'Sentry',
        description: 'Error tracking and issue analysis',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sentry'],
        category: 'integration',
        requiredEnvVars: ['SENTRY_AUTH_TOKEN'],
        popular: false
    },
    {
        id: 'git',
        name: 'Git',
        description: 'Advanced Git operations beyond basic commands',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-git'],
        category: 'core',
        popular: false
    },
    {
        id: 'fetch',
        name: 'Fetch',
        description: 'Web content fetching and conversion',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-fetch'],
        category: 'web',
        popular: false
    },
    {
        id: 'context7',
        name: 'Context7',
        description: 'Up-to-date library documentation injection',
        command: 'npx',
        args: ['-y', 'context7-mcp'],
        category: 'core',
        popular: true
    }
];

export class McpServerManager {
    private _servers: Map<string, McpServerConfig> = new Map();
    private _processes: Map<string, ChildProcess> = new Map();
    private _statuses: Map<string, McpServerStatus> = new Map();
    private _storagePath: string;
    private _onServersChanged: vscode.EventEmitter<McpServerConfig[]> = new vscode.EventEmitter();
    private _onStatusChanged: vscode.EventEmitter<McpServerStatus> = new vscode.EventEmitter();

    public readonly onServersChanged = this._onServersChanged.event;
    public readonly onStatusChanged = this._onStatusChanged.event;

    constructor(context: vscode.ExtensionContext) {
        this._storagePath = path.join(context.globalStorageUri.fsPath, 'mcp-servers.json');
        this._ensureDir(path.dirname(this._storagePath));
        this._loadServers();
    }

    private _ensureDir(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private _loadServers(): void {
        try {
            if (fs.existsSync(this._storagePath)) {
                const data = JSON.parse(fs.readFileSync(this._storagePath, 'utf-8'));
                this._servers = new Map(data.servers.map((s: McpServerConfig) => [s.id, s]));
            }
        } catch (error) {
            console.error('Failed to load MCP servers:', error);
        }
    }

    private _saveServers(): void {
        try {
            fs.writeFileSync(this._storagePath, JSON.stringify({
                servers: Array.from(this._servers.values())
            }, null, 2));
        } catch (error) {
            console.error('Failed to save MCP servers:', error);
        }
    }

    public getTemplates(): McpServerTemplate[] {
        return SERVER_TEMPLATES;
    }

    public getPopularTemplates(): McpServerTemplate[] {
        return SERVER_TEMPLATES.filter(t => t.popular);
    }

    public addServerFromTemplate(templateId: string, customEnv?: Record<string, string>): McpServerConfig | null {
        const template = SERVER_TEMPLATES.find(t => t.id === templateId);
        if (!template) {
            return null;
        }

        const config: McpServerConfig = {
            id: template.id,
            name: template.name,
            description: template.description,
            command: template.command,
            args: [...template.args],
            env: customEnv || {},
            enabled: true,
            autoStart: false,
            category: template.category,
            requiredEnvVars: template.requiredEnvVars,
            installCommand: template.installCommand,
            documentationUrl: template.documentationUrl
        };

        this._servers.set(config.id, config);
        this._saveServers();
        this._onServersChanged.fire(this.getServers());

        return config;
    }

    public addCustomServer(config: Omit<McpServerConfig, 'id'>): McpServerConfig {
        const id = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const fullConfig: McpServerConfig = { ...config, id };

        this._servers.set(id, fullConfig);
        this._saveServers();
        this._onServersChanged.fire(this.getServers());

        return fullConfig;
    }

    public updateServer(id: string, updates: Partial<McpServerConfig>): boolean {
        const server = this._servers.get(id);
        if (!server) {
            return false;
        }

        Object.assign(server, updates);
        this._saveServers();
        this._onServersChanged.fire(this.getServers());
        return true;
    }

    public removeServer(id: string): boolean {
        this.stopServer(id);
        const result = this._servers.delete(id);
        if (result) {
            this._saveServers();
            this._onServersChanged.fire(this.getServers());
        }
        return result;
    }

    public async startServer(id: string): Promise<boolean> {
        const config = this._servers.get(id);
        if (!config || !config.enabled) {
            return false;
        }

        // Check if already running
        if (this._processes.has(id)) {
            return true;
        }

        // Check required env vars
        if (config.requiredEnvVars) {
            for (const envVar of config.requiredEnvVars) {
                if (!config.env[envVar] && !process.env[envVar]) {
                    vscode.window.showErrorMessage(
                        `MCP server "${config.name}" requires ${envVar} environment variable.`
                    );
                    return false;
                }
            }
        }

        try {
            const env = { ...process.env, ...config.env };
            const proc = spawn(config.command, config.args, {
                env,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this._processes.set(id, proc);

            const status: McpServerStatus = {
                id,
                running: true,
                pid: proc.pid,
                startedAt: new Date().toISOString(),
                connectionCount: 0
            };
            this._statuses.set(id, status);
            this._onStatusChanged.fire(status);

            proc.on('error', (error) => {
                const status = this._statuses.get(id);
                if (status) {
                    status.running = false;
                    status.lastError = error.message;
                    this._onStatusChanged.fire(status);
                }
            });

            proc.on('exit', (code) => {
                this._processes.delete(id);
                const status = this._statuses.get(id);
                if (status) {
                    status.running = false;
                    if (code !== 0) {
                        status.lastError = `Exited with code ${code}`;
                    }
                    this._onStatusChanged.fire(status);
                }
            });

            proc.stderr?.on('data', (data) => {
                console.error(`[MCP ${config.name}] ${data.toString()}`);
            });

            return true;

        } catch (error) {
            console.error(`Failed to start MCP server ${config.name}:`, error);
            return false;
        }
    }

    public stopServer(id: string): boolean {
        const proc = this._processes.get(id);
        if (!proc) {
            return false;
        }

        proc.kill();
        this._processes.delete(id);

        const status = this._statuses.get(id);
        if (status) {
            status.running = false;
            this._onStatusChanged.fire(status);
        }

        return true;
    }

    public async restartServer(id: string): Promise<boolean> {
        this.stopServer(id);
        await new Promise(resolve => setTimeout(resolve, 500));
        return this.startServer(id);
    }

    public async startAutoStartServers(): Promise<void> {
        for (const server of this._servers.values()) {
            if (server.enabled && server.autoStart) {
                await this.startServer(server.id);
            }
        }
    }

    public stopAllServers(): void {
        for (const id of this._processes.keys()) {
            this.stopServer(id);
        }
    }

    public getServers(): McpServerConfig[] {
        return Array.from(this._servers.values());
    }

    public getEnabledServers(): McpServerConfig[] {
        return this.getServers().filter(s => s.enabled);
    }

    public getRunningServers(): McpServerConfig[] {
        return this.getServers().filter(s => this._processes.has(s.id));
    }

    public getServerStatus(id: string): McpServerStatus | null {
        return this._statuses.get(id) || null;
    }

    public getAllStatuses(): McpServerStatus[] {
        return Array.from(this._statuses.values());
    }

    public getServersByCategory(category: McpServerConfig['category']): McpServerConfig[] {
        return this.getServers().filter(s => s.category === category);
    }

    public validateServerConfig(config: Partial<McpServerConfig>): string[] {
        const errors: string[] = [];

        if (!config.name?.trim()) {
            errors.push('Server name is required');
        }
        if (!config.command?.trim()) {
            errors.push('Command is required');
        }

        return errors;
    }

    public exportConfig(): string {
        return JSON.stringify({
            servers: Array.from(this._servers.values()),
            exportedAt: new Date().toISOString()
        }, null, 2);
    }

    public importConfig(json: string): boolean {
        try {
            const data = JSON.parse(json);
            for (const server of data.servers) {
                this._servers.set(server.id, server);
            }
            this._saveServers();
            this._onServersChanged.fire(this.getServers());
            return true;
        } catch {
            return false;
        }
    }

    public dispose(): void {
        this.stopAllServers();
        this._onServersChanged.dispose();
        this._onStatusChanged.dispose();
    }
}
