import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export interface WslConfig {
    enabled: boolean;
    distro: string;
    claudePath: string;
    nodePath: string;
}

export interface WslDistro {
    name: string;
    default: boolean;
    state: string;
    version: string;
}

export class WslSupport {
    private isWindows: boolean;
    private wslAvailable: boolean | null = null;
    private distros: WslDistro[] = [];

    constructor() {
        this.isWindows = process.platform === 'win32';
    }

    /**
     * Check if we're running on Windows
     */
    public isWindowsPlatform(): boolean {
        return this.isWindows;
    }

    /**
     * Check if WSL is available
     */
    public async isWslAvailable(): Promise<boolean> {
        if (!this.isWindows) {
            return false;
        }

        if (this.wslAvailable !== null) {
            return this.wslAvailable;
        }

        try {
            await this.execCommand('wsl --status');
            this.wslAvailable = true;
            return true;
        } catch {
            this.wslAvailable = false;
            return false;
        }
    }

    /**
     * Get list of available WSL distributions
     */
    public async getDistributions(): Promise<WslDistro[]> {
        if (!this.isWindows) {
            return [];
        }

        if (this.distros.length > 0) {
            return this.distros;
        }

        try {
            const { stdout } = await this.execCommand('wsl --list --verbose');
            const lines = stdout.split('\n').slice(1); // Skip header

            this.distros = [];
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                // Parse line format: "* Ubuntu    Running    2"
                const isDefault = trimmed.startsWith('*');
                const parts = trimmed.replace('*', '').trim().split(/\s+/);
                if (parts.length >= 3) {
                    this.distros.push({
                        name: parts[0],
                        default: isDefault,
                        state: parts[1],
                        version: parts[2]
                    });
                }
            }

            return this.distros;
        } catch {
            return [];
        }
    }

    /**
     * Get WSL configuration from settings
     */
    public getConfig(): WslConfig {
        const config = vscode.workspace.getConfiguration('draagon');
        return {
            enabled: config.get<boolean>('wsl.enabled', false),
            distro: config.get<string>('wsl.distro', 'Ubuntu'),
            claudePath: config.get<string>('wsl.claudePath', 'claude'),
            nodePath: config.get<string>('wsl.nodePath', 'node')
        };
    }

    /**
     * Convert Windows path to WSL path
     */
    public toWslPath(windowsPath: string): string {
        if (!this.isWindows) {
            return windowsPath;
        }

        // Handle UNC paths
        if (windowsPath.startsWith('\\\\')) {
            return windowsPath; // Can't convert UNC paths
        }

        // Convert C:\Users\name\project → /mnt/c/Users/name/project
        const match = windowsPath.match(/^([A-Za-z]):\\(.*)$/);
        if (match) {
            const drive = match[1].toLowerCase();
            const rest = match[2].replace(/\\/g, '/');
            return `/mnt/${drive}/${rest}`;
        }

        // Already a Unix path or relative
        return windowsPath.replace(/\\/g, '/');
    }

    /**
     * Convert WSL path to Windows path
     */
    public toWindowsPath(wslPath: string): string {
        if (!this.isWindows) {
            return wslPath;
        }

        // Convert /mnt/c/Users/name/project → C:\Users\name\project
        const match = wslPath.match(/^\/mnt\/([a-z])\/(.*)$/);
        if (match) {
            const drive = match[1].toUpperCase();
            const rest = match[2].replace(/\//g, '\\');
            return `${drive}:\\${rest}`;
        }

        // Not a /mnt/ path, return as-is
        return wslPath;
    }

    /**
     * Execute a command in WSL
     */
    public async executeInWsl(
        command: string,
        options: {
            distro?: string;
            cwd?: string;
            env?: Record<string, string>;
        } = {}
    ): Promise<{ stdout: string; stderr: string }> {
        const config = this.getConfig();
        const distro = options.distro || config.distro;

        // Convert Windows cwd to WSL path
        const wslCwd = options.cwd ? this.toWslPath(options.cwd) : undefined;

        // Build WSL command
        let wslCommand = `wsl -d ${distro}`;
        if (wslCwd) {
            wslCommand += ` --cd "${wslCwd}"`;
        }
        wslCommand += ` -- ${command}`;

        return this.execCommand(wslCommand, {
            env: { ...process.env, ...options.env }
        });
    }

    /**
     * Spawn a process in WSL with streaming support
     */
    public spawnInWsl(
        command: string,
        args: string[],
        options: {
            distro?: string;
            cwd?: string;
            env?: Record<string, string>;
        } = {}
    ): cp.ChildProcess {
        const config = this.getConfig();
        const distro = options.distro || config.distro;

        // Convert Windows cwd to WSL path
        const wslCwd = options.cwd ? this.toWslPath(options.cwd) : undefined;

        // Build WSL args
        const wslArgs = ['-d', distro];
        if (wslCwd) {
            wslArgs.push('--cd', wslCwd);
        }
        wslArgs.push('--', command, ...args);

        return cp.spawn('wsl', wslArgs, {
            env: {
                ...process.env,
                ...options.env,
                WSLENV: 'PATH/l'
            },
            stdio: ['inherit', 'pipe', 'pipe']
        });
    }

    /**
     * Spawn Claude CLI in WSL
     */
    public spawnClaudeInWsl(
        args: string[],
        options: {
            cwd?: string;
        } = {}
    ): cp.ChildProcess {
        const config = this.getConfig();
        return this.spawnInWsl(config.claudePath, args, {
            distro: config.distro,
            cwd: options.cwd
        });
    }

    /**
     * Check if Claude is available in WSL
     */
    public async isClaudeAvailableInWsl(): Promise<boolean> {
        try {
            const config = this.getConfig();
            await this.executeInWsl(`which ${config.claudePath}`);
            return true;
        } catch {
            return false;
        }
    }

    private execCommand(
        command: string,
        options: cp.ExecOptions = {}
    ): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            cp.exec(command, { encoding: 'utf-8', ...options }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
                }
            });
        });
    }

    /**
     * Show WSL setup instructions
     */
    public async showSetupInstructions(): Promise<void> {
        const message = `WSL Setup Instructions:

1. Install WSL:
   wsl --install

2. Install a Linux distribution (Ubuntu recommended):
   wsl --install -d Ubuntu

3. Install Node.js in WSL:
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

4. Install Claude CLI in WSL:
   npm install -g @anthropic-ai/claude-code

5. Configure VS Code settings:
   "draagon.wsl.enabled": true
   "draagon.wsl.distro": "Ubuntu"
   "draagon.wsl.claudePath": "claude"`;

        const doc = await vscode.workspace.openTextDocument({
            content: message,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
    }
}

export interface CreateClaudeProcessOptions {
    claudePath: string;
    args: string[];
    cwd: string;
    env?: Record<string, string>;
    wslSupport?: WslSupport;
}

/**
 * Create appropriate child process based on platform and settings
 *
 * IMPORTANT: Uses stdio: ['inherit', 'pipe', 'pipe'] for print mode.
 * Using ['pipe', 'pipe', 'pipe'] causes the process to hang indefinitely
 * when no stdin data is provided. See docs/CLAUDE-CLI-PROTOCOL.md for details.
 */
export function createClaudeProcess(options: CreateClaudeProcessOptions): cp.ChildProcess {
    const { claudePath, args, cwd, env, wslSupport } = options;
    const config = wslSupport?.getConfig();

    // Use WSL on Windows if enabled
    if (config?.enabled && wslSupport?.isWindowsPlatform()) {
        return wslSupport.spawnClaudeInWsl(args, { cwd });
    }

    // Native execution
    // CRITICAL: Use 'inherit' for stdin to prevent hanging when using --print mode
    // See: https://github.com/anthropics/claude-code/issues/771
    return cp.spawn(claudePath, args, {
        cwd,
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: false,
        env: env ? { ...process.env, ...env } : process.env
    });
}
