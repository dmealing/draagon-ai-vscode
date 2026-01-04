import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { ClaudeMessage } from './types';
import { EventEmitter } from 'events';

export class ClaudeProcess extends EventEmitter {
    private _process: ChildProcess | null = null;
    private _buffer: string = '';
    private _config: vscode.WorkspaceConfiguration;
    private _workingDirectory: string;

    constructor(config: vscode.WorkspaceConfiguration) {
        super();
        this._config = config;
        this._workingDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    }

    public async start(): Promise<void> {
        // Ready to receive messages
    }

    public send(prompt: string, resumeSessionId?: string): void {
        const args = [
            '--output-format', 'stream-json',
            '--verbose',
            '--print', prompt
        ];

        if (resumeSessionId) {
            args.push('--resume', resumeSessionId);
        }

        // Check for plan mode
        if (this._config.get<boolean>('planMode.enabled', false)) {
            args.push('--permission-mode', 'plan');
        }

        this._process = spawn('claude', args, {
            cwd: this._workingDirectory,
            env: {
                ...process.env,
                FORCE_COLOR: '0'
            }
        });

        this._process.stdout?.on('data', (data: Buffer) => {
            this._handleData(data.toString());
        });

        this._process.stderr?.on('data', (data: Buffer) => {
            console.error('[Claude stderr]:', data.toString());
        });

        this._process.on('error', (error: Error) => {
            this.emit('error', error);
        });

        this._process.on('exit', (code: number | null) => {
            this._flushBuffer();
            this.emit('complete', code);
        });
    }

    public sendToolResult(toolUseId: string, result: Record<string, unknown>): void {
        if (this._process?.stdin?.writable) {
            const resultJson = JSON.stringify({
                type: 'tool_result',
                tool_use_id: toolUseId,
                content: JSON.stringify(result)
            });
            this._process.stdin.write(resultJson + '\n');
        }
    }

    public stop(): void {
        if (this._process) {
            this._process.kill('SIGTERM');
            this._process = null;
        }
    }

    public isRunning(): boolean {
        return this._process !== null && !this._process.killed;
    }

    private _handleData(data: string): void {
        this._buffer += data;

        // Process complete JSON lines
        const lines = this._buffer.split('\n');
        this._buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim()) {
                this._parseLine(line);
            }
        }
    }

    private _flushBuffer(): void {
        if (this._buffer.trim()) {
            this._parseLine(this._buffer);
            this._buffer = '';
        }
    }

    private _parseLine(line: string): void {
        try {
            const message = JSON.parse(line) as ClaudeMessage;
            this.emit('message', message);
        } catch {
            // Not JSON, might be plain text output
            console.log('[Claude output]:', line);
        }
    }

    public onMessage(handler: (message: ClaudeMessage) => void): void {
        this.on('message', handler);
    }

    public onError(handler: (error: Error) => void): void {
        this.on('error', handler);
    }

    public onComplete(handler: (code: number | null) => void): void {
        this.on('complete', handler);
    }
}
