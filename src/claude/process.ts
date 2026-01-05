import * as vscode from 'vscode';
import { ChildProcess } from 'child_process';
import { ClaudeMessage } from './types';
import { EventEmitter } from 'events';
import { WslSupport, createClaudeProcess } from '../wsl/support';

export interface ClaudeProcessOptions {
    config: vscode.WorkspaceConfiguration;
    wslSupport?: WslSupport;
}

export class ClaudeProcess extends EventEmitter {
    private _process: ChildProcess | null = null;
    private _buffer: string = '';
    private _config: vscode.WorkspaceConfiguration;
    private _workingDirectory: string;
    private _wslSupport?: WslSupport;

    constructor(options: ClaudeProcessOptions | vscode.WorkspaceConfiguration) {
        super();
        // Support both old and new constructor signatures for backwards compatibility
        if ('config' in options) {
            this._config = options.config;
            this._wslSupport = options.wslSupport;
        } else {
            this._config = options;
        }
        this._workingDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    }

    public async start(): Promise<void> {
        // Ready to receive messages
    }

    public send(prompt: string, resumeSessionId?: string): void {
        // Kill any existing process first
        if (this._process && !this._process.killed) {
            this._process.kill('SIGTERM');
            this._process = null;
        }

        // Use --print mode for one-shot queries
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

        console.log('[Claude] Spawning process with args:', args);
        console.log('[Claude] Working directory:', this._workingDirectory);

        // Use WSL support if available and configured, otherwise native spawn
        this._process = createClaudeProcess({
            claudePath: 'claude',
            args,
            cwd: this._workingDirectory,
            env: { FORCE_COLOR: '0' },
            wslSupport: this._wslSupport
        });

        console.log('[Claude] Process spawned, pid:', this._process.pid);

        if (!this._process.stdout) {
            console.error('[Claude] No stdout available!');
            this.emit('error', new Error('No stdout available from Claude process'));
            return;
        }

        this._process.stdout.on('data', (data: Buffer) => {
            const str = data.toString();
            console.log('[Claude stdout]:', str.substring(0, 300));
            this._handleData(str);
        });

        this._process.stderr?.on('data', (data: Buffer) => {
            console.error('[Claude stderr]:', data.toString());
        });

        this._process.on('error', (error: Error) => {
            console.error('[Claude] Process error:', error);
            this.emit('error', error);
        });

        this._process.on('exit', (code: number | null) => {
            console.log('[Claude] Process exited with code:', code);
            this._flushBuffer();
            this.emit('complete', code);
            this._process = null;
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

    /**
     * Inject a user message into the ongoing conversation.
     * This is used to provide additional context or instructions
     * while Claude is processing, similar to how the CLI allows
     * typing while Claude is working.
     *
     * The message is sent via stdin as a user input event.
     */
    public injectMessage(text: string): void {
        if (this._process?.stdin?.writable) {
            // Claude Code CLI expects user input as JSON with type 'user_input'
            // This allows interrupting the agentic loop with additional context
            const inputJson = JSON.stringify({
                type: 'user_input',
                content: text
            });
            this._process.stdin.write(inputJson + '\n');
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
            // Log message type for debugging streaming
            console.log('[Claude message type]:', message.type, message.delta?.type || '');
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
