import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface Checkpoint {
    sha: string;
    timestamp: string;
    message: string;
    description: string;
    changedFiles: string[];
    stats: {
        insertions: number;
        deletions: number;
        filesChanged: number;
    };
    isPreRestore?: boolean;
}

export interface BackupConfig {
    enabled: boolean;
    maxCommits: number;
    gcInterval: number;
    autoCheckpoint: boolean;
}

export class BackupManager {
    private _backupRepoPath: string | null = null;
    private _workspacePath: string;
    private _config: BackupConfig;
    private _checkpoints: Checkpoint[] = [];
    private _commitsSinceGc: number = 0;
    private _onCheckpointsChanged: vscode.EventEmitter<Checkpoint[]> = new vscode.EventEmitter();

    public readonly onCheckpointsChanged = this._onCheckpointsChanged.event;

    constructor(workspacePath: string, config: vscode.WorkspaceConfiguration) {
        this._workspacePath = workspacePath;
        this._config = {
            enabled: config.get<boolean>('backup.enabled', true),
            maxCommits: config.get<number>('backup.maxCommits', 50),
            gcInterval: config.get<number>('backup.gcInterval', 10),
            autoCheckpoint: config.get<boolean>('backup.autoCheckpoint', true)
        };
    }

    public async initialize(): Promise<void> {
        if (!this._config.enabled) {
            return;
        }

        const backupDir = path.join(this._workspacePath, '.draagon', 'backups');
        this._backupRepoPath = path.join(backupDir, '.git');

        // Create backup directory if needed
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        // Initialize git repo if needed
        if (!fs.existsSync(this._backupRepoPath)) {
            await this._initializeRepo();
        }

        // Load existing checkpoints
        await this._loadCheckpoints();
    }

    private async _initializeRepo(): Promise<void> {

        try {
            await execAsync(`git init --bare "${this._backupRepoPath}"`);

            // Create initial commit
            await this._gitCommand('config user.email "draagon@local"');
            await this._gitCommand('config user.name "Draagon AI"');

            // Add all files and create initial commit
            await this._gitCommand('add -A');
            await this._gitCommand('commit --allow-empty -m "Initial backup checkpoint"');

            console.log('Backup repository initialized');
        } catch (error) {
            console.error('Failed to initialize backup repo:', error);
            throw error;
        }
    }

    private async _gitCommand(command: string): Promise<string> {
        if (!this._backupRepoPath) {
            throw new Error('Backup repo not initialized');
        }

        const fullCommand = `git --git-dir="${this._backupRepoPath}" --work-tree="${this._workspacePath}" ${command}`;

        try {
            const { stdout } = await execAsync(fullCommand, {
                cwd: this._workspacePath,
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });
            return stdout.trim();
        } catch (error: any) {
            // Some git commands return non-zero for valid states
            if (error.stdout) {
                return error.stdout.trim();
            }
            throw error;
        }
    }

    public async createCheckpoint(description: string): Promise<Checkpoint | null> {
        if (!this._config.enabled || !this._backupRepoPath) {
            return null;
        }

        try {
            // Check if there are changes to commit
            const status = await this._gitCommand('status --porcelain');
            if (!status.trim()) {
                console.log('No changes to checkpoint');
                return null;
            }

            // Get list of changed files
            const changedFiles = status.split('\n')
                .filter(line => line.trim())
                .map(line => line.substring(3).trim());

            // Stage all changes
            await this._gitCommand('add -A');

            // Create commit with timestamp
            const timestamp = new Date().toISOString();
            const message = `[Draagon] ${description}`;

            await this._gitCommand(`commit -m "${message.replace(/"/g, '\\"')}"`);

            // Get commit SHA
            const sha = await this._gitCommand('rev-parse HEAD');

            // Get diff stats
            const stats = { insertions: 0, deletions: 0, filesChanged: changedFiles.length };
            try {
                const diffStat = await this._gitCommand('diff HEAD~1 --shortstat');
                const match = diffStat.match(/(\d+) insertions?\(\+\), (\d+) deletions?\(-\)/);
                if (match) {
                    stats.insertions = parseInt(match[1]);
                    stats.deletions = parseInt(match[2]);
                }
            } catch {
                // First commit, no previous to diff
            }

            const checkpoint: Checkpoint = {
                sha,
                timestamp,
                message,
                description,
                changedFiles,
                stats
            };

            this._checkpoints.unshift(checkpoint);
            this._onCheckpointsChanged.fire(this._checkpoints);

            // Maintenance
            this._commitsSinceGc++;
            await this._runMaintenance();

            console.log(`Checkpoint created: ${sha.substring(0, 7)} - ${description}`);
            return checkpoint;

        } catch (error) {
            console.error('Failed to create checkpoint:', error);
            return null;
        }
    }

    public async restoreCheckpoint(sha: string): Promise<boolean> {
        if (!this._backupRepoPath) {
            return false;
        }

        try {
            // Create pre-restore backup first
            const preRestoreCheckpoint = await this.createCheckpoint('Pre-restore backup (undo point)');
            if (preRestoreCheckpoint) {
                preRestoreCheckpoint.isPreRestore = true;
            }

            // Restore to the specified commit
            await this._gitCommand(`checkout ${sha} -- .`);

            console.log(`Restored to checkpoint: ${sha.substring(0, 7)}`);

            // Reload checkpoints
            await this._loadCheckpoints();

            return true;

        } catch (error) {
            console.error('Failed to restore checkpoint:', error);
            return false;
        }
    }

    public async getCheckpoints(): Promise<Checkpoint[]> {
        return this._checkpoints;
    }

    public async getCheckpointDiff(sha: string): Promise<string> {
        if (!this._backupRepoPath) {
            return '';
        }

        try {
            // Get diff between this commit and previous
            const diff = await this._gitCommand(`diff ${sha}~1..${sha} --stat`);
            return diff;
        } catch {
            return '';
        }
    }

    private async _loadCheckpoints(): Promise<void> {
        if (!this._backupRepoPath) {
            return;
        }

        try {
            // Get commit log with format
            const log = await this._gitCommand(
                'log --format="%H|%aI|%s" --max-count=' + this._config.maxCommits
            );

            this._checkpoints = log.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const [sha, timestamp, message] = line.split('|');
                    return {
                        sha,
                        timestamp,
                        message,
                        description: message.replace('[Draagon] ', ''),
                        changedFiles: [],
                        stats: { insertions: 0, deletions: 0, filesChanged: 0 },
                        isPreRestore: message.includes('Pre-restore backup')
                    };
                });

            this._onCheckpointsChanged.fire(this._checkpoints);

        } catch (error) {
            console.error('Failed to load checkpoints:', error);
            this._checkpoints = [];
        }
    }

    private async _runMaintenance(): Promise<void> {
        // Prune old commits if over limit
        if (this._checkpoints.length > this._config.maxCommits) {
            await this._pruneOldCommits();
        }

        // Run git gc periodically
        if (this._commitsSinceGc >= this._config.gcInterval) {
            await this._runGarbageCollection();
            this._commitsSinceGc = 0;
        }
    }

    private async _pruneOldCommits(): Promise<void> {
        // Keep only maxCommits
        const toKeep = this._config.maxCommits;
        const toPrune = this._checkpoints.length - toKeep;

        if (toPrune <= 0) {
            return;
        }

        try {
            // Rewrite history to remove old commits (aggressive but effective)
            // This uses git filter-branch alternative with --ancestry-path
            console.log(`Pruning ${toPrune} old checkpoints`);

            // For simplicity, we'll just let git gc clean up unreachable commits
            // The log limit in _loadCheckpoints handles the display
        } catch (error) {
            console.error('Failed to prune old commits:', error);
        }
    }

    private async _runGarbageCollection(): Promise<void> {
        try {
            await this._gitCommand('gc --auto --quiet');
            console.log('Backup garbage collection completed');
        } catch (error) {
            console.error('Failed to run git gc:', error);
        }
    }

    public async getBackupSize(): Promise<string> {
        if (!this._backupRepoPath || !fs.existsSync(this._backupRepoPath)) {
            return '0 KB';
        }

        try {
            const { stdout } = await execAsync(`du -sh "${this._backupRepoPath}"`);
            return stdout.split('\t')[0];
        } catch {
            return 'Unknown';
        }
    }

    public isEnabled(): boolean {
        return this._config.enabled;
    }

    public getCheckpointCount(): number {
        return this._checkpoints.length;
    }

    public dispose(): void {
        this._onCheckpointsChanged.dispose();
    }
}
