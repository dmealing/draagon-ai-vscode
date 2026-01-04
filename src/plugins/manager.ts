import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PluginManifest {
    name: string;
    version: string;
    description: string;
    author: string;
    repository?: string;
    commands?: PluginCommand[];
    agents?: PluginAgent[];
    mcpServers?: PluginMcpServer[];
    hooks?: PluginHook[];
    dependencies?: string[];
}

export interface PluginCommand {
    name: string;
    description: string;
    handler: string; // Path to handler file
}

export interface PluginAgent {
    name: string;
    description: string;
    systemPrompt: string;
    tools?: string[];
}

export interface PluginMcpServer {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

export interface PluginHook {
    event: 'preMessage' | 'postMessage' | 'preToolCall' | 'postToolCall' | 'onError';
    handler: string;
}

export interface InstalledPlugin {
    id: string;
    manifest: PluginManifest;
    enabled: boolean;
    installedAt: string;
    updatedAt: string;
    source: string; // npm package, git url, or local path
    path: string;
}

export interface Marketplace {
    id: string;
    name: string;
    url: string;
    plugins: MarketplacePlugin[];
    addedAt: string;
}

export interface MarketplacePlugin {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    downloads: number;
    rating: number;
    tags: string[];
    source: string;
}

export class PluginManager {
    private _plugins: Map<string, InstalledPlugin> = new Map();
    private _marketplaces: Marketplace[] = [];
    private _pluginsPath: string;
    private _onPluginsChanged: vscode.EventEmitter<InstalledPlugin[]> = new vscode.EventEmitter();

    public readonly onPluginsChanged = this._onPluginsChanged.event;

    constructor(context: vscode.ExtensionContext) {
        this._pluginsPath = path.join(context.globalStorageUri.fsPath, 'plugins');
        this._ensureDir(this._pluginsPath);
        this._loadPlugins();
        this._loadMarketplaces();
    }

    private _ensureDir(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private _loadPlugins(): void {
        try {
            const indexPath = path.join(this._pluginsPath, 'index.json');
            if (fs.existsSync(indexPath)) {
                const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
                this._plugins = new Map(data.plugins.map((p: InstalledPlugin) => [p.id, p]));
            }
        } catch (error) {
            console.error('Failed to load plugins:', error);
        }
    }

    private _savePlugins(): void {
        try {
            const indexPath = path.join(this._pluginsPath, 'index.json');
            fs.writeFileSync(indexPath, JSON.stringify({
                plugins: Array.from(this._plugins.values())
            }, null, 2));
        } catch (error) {
            console.error('Failed to save plugins:', error);
        }
    }

    private _loadMarketplaces(): void {
        try {
            const mpPath = path.join(this._pluginsPath, 'marketplaces.json');
            if (fs.existsSync(mpPath)) {
                this._marketplaces = JSON.parse(fs.readFileSync(mpPath, 'utf-8'));
            } else {
                // Add default Anthropic marketplace
                this._marketplaces = [{
                    id: 'anthropic-official',
                    name: 'Anthropic Official',
                    url: 'https://github.com/anthropics/claude-code-plugins',
                    plugins: [],
                    addedAt: new Date().toISOString()
                }];
                this._saveMarketplaces();
            }
        } catch (error) {
            console.error('Failed to load marketplaces:', error);
        }
    }

    private _saveMarketplaces(): void {
        try {
            const mpPath = path.join(this._pluginsPath, 'marketplaces.json');
            fs.writeFileSync(mpPath, JSON.stringify(this._marketplaces, null, 2));
        } catch (error) {
            console.error('Failed to save marketplaces:', error);
        }
    }

    public async installPlugin(source: string): Promise<InstalledPlugin | null> {
        try {
            const pluginPath = path.join(this._pluginsPath, this._generateId());
            this._ensureDir(pluginPath);

            // Determine source type and install
            if (source.startsWith('http') || source.includes('github.com')) {
                await this._installFromGit(source, pluginPath);
            } else if (source.startsWith('@') || !source.includes('/')) {
                await this._installFromNpm(source, pluginPath);
            } else if (fs.existsSync(source)) {
                await this._installFromLocal(source, pluginPath);
            } else {
                throw new Error(`Unknown plugin source: ${source}`);
            }

            // Load manifest
            const manifestPath = path.join(pluginPath, 'plugin.json');
            if (!fs.existsSync(manifestPath)) {
                // Try package.json for npm packages
                const pkgPath = path.join(pluginPath, 'package.json');
                if (fs.existsSync(pkgPath)) {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                    const manifest: PluginManifest = {
                        name: pkg.name,
                        version: pkg.version,
                        description: pkg.description || '',
                        author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name || 'Unknown',
                        repository: pkg.repository?.url || pkg.repository,
                        ...pkg.claudePlugin
                    };
                    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
                } else {
                    throw new Error('No plugin.json or package.json found');
                }
            }

            const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

            const plugin: InstalledPlugin = {
                id: manifest.name.replace(/[^a-zA-Z0-9-_]/g, '-'),
                manifest,
                enabled: true,
                installedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                source,
                path: pluginPath
            };

            this._plugins.set(plugin.id, plugin);
            this._savePlugins();
            this._onPluginsChanged.fire(this.getPlugins());

            vscode.window.showInformationMessage(`Plugin "${manifest.name}" installed successfully!`);
            return plugin;

        } catch (error) {
            console.error('Failed to install plugin:', error);
            vscode.window.showErrorMessage(`Failed to install plugin: ${error}`);
            return null;
        }
    }

    private async _installFromGit(url: string, destPath: string): Promise<void> {
        await execAsync(`git clone --depth 1 "${url}" "${destPath}"`);
    }

    private async _installFromNpm(packageName: string, destPath: string): Promise<void> {
        await execAsync(`npm pack "${packageName}"`, { cwd: destPath });
        const files = fs.readdirSync(destPath).filter(f => f.endsWith('.tgz'));
        if (files.length > 0) {
            await execAsync(`tar -xzf "${files[0]}" --strip-components=1`, { cwd: destPath });
            fs.unlinkSync(path.join(destPath, files[0]));
        }
    }

    private async _installFromLocal(sourcePath: string, destPath: string): Promise<void> {
        await execAsync(`cp -r "${sourcePath}"/* "${destPath}"/`);
    }

    public uninstallPlugin(id: string): boolean {
        const plugin = this._plugins.get(id);
        if (!plugin) {
            return false;
        }

        // Remove plugin directory
        if (fs.existsSync(plugin.path)) {
            fs.rmSync(plugin.path, { recursive: true });
        }

        this._plugins.delete(id);
        this._savePlugins();
        this._onPluginsChanged.fire(this.getPlugins());

        vscode.window.showInformationMessage(`Plugin "${plugin.manifest.name}" uninstalled.`);
        return true;
    }

    public enablePlugin(id: string): boolean {
        const plugin = this._plugins.get(id);
        if (!plugin) {
            return false;
        }

        plugin.enabled = true;
        plugin.updatedAt = new Date().toISOString();
        this._savePlugins();
        this._onPluginsChanged.fire(this.getPlugins());
        return true;
    }

    public disablePlugin(id: string): boolean {
        const plugin = this._plugins.get(id);
        if (!plugin) {
            return false;
        }

        plugin.enabled = false;
        plugin.updatedAt = new Date().toISOString();
        this._savePlugins();
        this._onPluginsChanged.fire(this.getPlugins());
        return true;
    }

    public async updatePlugin(id: string): Promise<boolean> {
        const plugin = this._plugins.get(id);
        if (!plugin) {
            return false;
        }

        // Reinstall from source
        const tempPath = plugin.path + '_temp';
        try {
            if (plugin.source.startsWith('http') || plugin.source.includes('github.com')) {
                this._ensureDir(tempPath);
                await this._installFromGit(plugin.source, tempPath);

                // Swap directories
                fs.rmSync(plugin.path, { recursive: true });
                fs.renameSync(tempPath, plugin.path);

                // Reload manifest
                const manifestPath = path.join(plugin.path, 'plugin.json');
                if (fs.existsSync(manifestPath)) {
                    plugin.manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                }

                plugin.updatedAt = new Date().toISOString();
                this._savePlugins();
                this._onPluginsChanged.fire(this.getPlugins());

                vscode.window.showInformationMessage(`Plugin "${plugin.manifest.name}" updated!`);
                return true;
            }
        } catch (error) {
            console.error('Failed to update plugin:', error);
            if (fs.existsSync(tempPath)) {
                fs.rmSync(tempPath, { recursive: true });
            }
        }

        return false;
    }

    public getPlugins(): InstalledPlugin[] {
        return Array.from(this._plugins.values());
    }

    public getEnabledPlugins(): InstalledPlugin[] {
        return this.getPlugins().filter(p => p.enabled);
    }

    public getPlugin(id: string): InstalledPlugin | null {
        return this._plugins.get(id) || null;
    }

    public getPluginCommands(): { plugin: string; command: PluginCommand }[] {
        const commands: { plugin: string; command: PluginCommand }[] = [];
        for (const plugin of this.getEnabledPlugins()) {
            for (const cmd of plugin.manifest.commands || []) {
                commands.push({ plugin: plugin.id, command: cmd });
            }
        }
        return commands;
    }

    public getPluginAgents(): { plugin: string; agent: PluginAgent }[] {
        const agents: { plugin: string; agent: PluginAgent }[] = [];
        for (const plugin of this.getEnabledPlugins()) {
            for (const agent of plugin.manifest.agents || []) {
                agents.push({ plugin: plugin.id, agent });
            }
        }
        return agents;
    }

    public getPluginMcpServers(): { plugin: string; server: PluginMcpServer }[] {
        const servers: { plugin: string; server: PluginMcpServer }[] = [];
        for (const plugin of this.getEnabledPlugins()) {
            for (const server of plugin.manifest.mcpServers || []) {
                servers.push({ plugin: plugin.id, server });
            }
        }
        return servers;
    }

    // Marketplace methods
    public async addMarketplace(url: string, name?: string): Promise<Marketplace | null> {
        try {
            const id = url.replace(/[^a-zA-Z0-9-_]/g, '-');
            if (this._marketplaces.some(m => m.id === id)) {
                vscode.window.showWarningMessage('Marketplace already added.');
                return null;
            }

            const marketplace: Marketplace = {
                id,
                name: name || url.split('/').pop() || 'Unknown',
                url,
                plugins: [],
                addedAt: new Date().toISOString()
            };

            // Fetch marketplace plugins
            await this._refreshMarketplace(marketplace);

            this._marketplaces.push(marketplace);
            this._saveMarketplaces();

            vscode.window.showInformationMessage(`Marketplace "${marketplace.name}" added!`);
            return marketplace;

        } catch (error) {
            console.error('Failed to add marketplace:', error);
            vscode.window.showErrorMessage(`Failed to add marketplace: ${error}`);
            return null;
        }
    }

    public removeMarketplace(id: string): boolean {
        const index = this._marketplaces.findIndex(m => m.id === id);
        if (index === -1) {
            return false;
        }

        this._marketplaces.splice(index, 1);
        this._saveMarketplaces();
        return true;
    }

    public async refreshMarketplaces(): Promise<void> {
        for (const marketplace of this._marketplaces) {
            await this._refreshMarketplace(marketplace);
        }
        this._saveMarketplaces();
    }

    private async _refreshMarketplace(marketplace: Marketplace): Promise<void> {
        try {
            // Fetch marketplace.json from GitHub
            let manifestUrl = marketplace.url;
            if (manifestUrl.includes('github.com')) {
                manifestUrl = manifestUrl
                    .replace('github.com', 'raw.githubusercontent.com')
                    .replace(/\/$/, '') + '/main/.claude-plugin/marketplace.json';
            }

            const response = await fetch(manifestUrl);
            if (response.ok) {
                const data = await response.json() as { plugins?: MarketplacePlugin[] };
                marketplace.plugins = data.plugins || [];
            }
        } catch (error) {
            console.error(`Failed to refresh marketplace ${marketplace.id}:`, error);
        }
    }

    public getMarketplaces(): Marketplace[] {
        return [...this._marketplaces];
    }

    public searchMarketplacePlugins(query: string): MarketplacePlugin[] {
        const lowerQuery = query.toLowerCase();
        const results: MarketplacePlugin[] = [];

        for (const marketplace of this._marketplaces) {
            for (const plugin of marketplace.plugins) {
                if (
                    plugin.name.toLowerCase().includes(lowerQuery) ||
                    plugin.description.toLowerCase().includes(lowerQuery) ||
                    plugin.tags.some(t => t.toLowerCase().includes(lowerQuery))
                ) {
                    results.push(plugin);
                }
            }
        }

        return results.sort((a, b) => b.downloads - a.downloads);
    }

    private _generateId(): string {
        return `plugin_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    public dispose(): void {
        this._onPluginsChanged.dispose();
    }
}
