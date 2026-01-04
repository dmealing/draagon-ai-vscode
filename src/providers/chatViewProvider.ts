import * as vscode from 'vscode';
import { ClaudeProcess } from '../claude/process';
import { RequestRouter } from '../routing/router';
import { MemoryClient } from '../memory/client';
import { BackupManager } from '../backup/manager';
import { getWebviewContent } from '../ui/webview/content';
import type { UsageTracker } from '../stats/tracker';
import type { SessionManager } from '../sessions/manager';
import type { ThinkingDisplay } from '../thinking/display';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'draagon.chatView';

    private _view?: vscode.WebviewView;
    private _claudeProcess?: ClaudeProcess;
    private _router?: RequestRouter;
    private _memoryClient?: MemoryClient;
    private _backupManager?: BackupManager;
    private _usageTracker?: UsageTracker;
    private _sessionManager?: SessionManager;
    private _thinkingDisplay?: ThinkingDisplay;
    private _isProcessing: boolean = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this._initializeServices();
    }

    private async _initializeServices(): Promise<void> {
        const config = vscode.workspace.getConfiguration('draagon');
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        // Initialize routing if enabled
        if (config.get<boolean>('routing.enabled', false)) {
            this._router = new RequestRouter(config);
        }

        // Initialize memory if enabled
        if (config.get<boolean>('memory.enabled', false)) {
            this._memoryClient = new MemoryClient(config);
            try {
                await this._memoryClient.connect();
            } catch (error) {
                console.error('Failed to connect to memory server:', error);
            }
        }

        // Initialize backup manager
        if (workspacePath) {
            this._backupManager = new BackupManager(workspacePath, config);
            await this._backupManager.initialize();

            // Listen for checkpoint changes
            this._backupManager.onCheckpointsChanged(_checkpoints => {
                this._sendCheckpointInfo();
            });
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = getWebviewContent(webviewView.webview, this._extensionUri);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'sendMessage':
                    await this._handleUserMessage(message.text);
                    break;
                case 'stopRequest':
                    this._stopProcessing();
                    break;
                case 'answerQuestion':
                    await this._handleQuestionAnswer(message.toolUseId, message.answers);
                    break;
                case 'newSession':
                    this.newSession();
                    break;
                case 'getCheckpoints':
                    await this._sendCheckpointInfo();
                    break;
                case 'restoreCheckpoint':
                    await this._restoreCheckpoint(message.sha);
                    break;
            }
        });

        // Send initial state
        this._postMessage({ type: 'ready' });
    }

    private async _handleUserMessage(text: string): Promise<void> {
        if (this._isProcessing) {
            return;
        }

        this._isProcessing = true;
        this._postMessage({ type: 'setProcessing', data: { isProcessing: true } });

        try {
            // Get relevant memories if enabled
            let memoryContext = '';
            if (this._memoryClient) {
                const memories = await this._memoryClient.search(text, 5);
                if (memories.length > 0) {
                    memoryContext = this._formatMemoryContext(memories);
                }
            }

            // Route the request
            if (this._router) {
                const result = await this._router.route(text, { memoryContext });

                // If routed to Groq or Draagon, handle directly
                if (result.provider !== 'claude') {
                    this._postMessage({
                        type: 'output',
                        data: result.content,
                        provider: result.provider
                    });
                    this._isProcessing = false;
                    this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
                    return;
                }
            }

            // Create checkpoint before Claude makes changes
            await this.createAutoCheckpoint(`Before: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

            // Use Claude Code CLI
            await this._sendToClaudeCode(text, memoryContext);

        } catch (error: any) {
            this._postMessage({
                type: 'error',
                data: `Error: ${error.message}`
            });
            this._isProcessing = false;
            this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
        }
    }

    private async _sendToClaudeCode(text: string, memoryContext: string): Promise<void> {
        if (!this._claudeProcess) {
            this._claudeProcess = new ClaudeProcess(
                vscode.workspace.getConfiguration('draagon')
            );

            // Set up message handlers
            this._claudeProcess.onMessage((msg) => this._handleClaudeMessage(msg));
            this._claudeProcess.onError((err) => this._handleClaudeError(err));
            this._claudeProcess.onComplete(() => this._handleClaudeComplete());

            await this._claudeProcess.start();
        }

        // Prepend memory context if available
        const fullMessage = memoryContext ? `${memoryContext}\n\n${text}` : text;
        this._claudeProcess.send(fullMessage);
    }

    private _handleClaudeMessage(message: any): void {
        if (message.type === 'assistant' && message.message?.content) {
            for (const content of message.message.content) {
                if (content.type === 'text') {
                    this._postMessage({
                        type: 'output',
                        data: content.text
                    });
                } else if (content.type === 'thinking') {
                    this._postMessage({
                        type: 'thinking',
                        data: content.thinking
                    });
                } else if (content.type === 'tool_use') {
                    this._handleToolUse(content);
                }
            }
        }
    }

    private _handleToolUse(toolUse: any): void {
        // Handle AskUserQuestion specially
        if (toolUse.name === 'AskUserQuestion') {
            this._postMessage({
                type: 'userQuestion',
                data: {
                    toolUseId: toolUse.id,
                    questions: toolUse.input.questions
                }
            });
            return;
        }

        // Handle EnterPlanMode
        if (toolUse.name === 'EnterPlanMode') {
            this._postMessage({
                type: 'planModeChanged',
                data: { active: true }
            });
        }

        // Handle ExitPlanMode
        if (toolUse.name === 'ExitPlanMode') {
            this._postMessage({
                type: 'planModeChanged',
                data: { active: false }
            });
        }

        // Send tool use to UI
        this._postMessage({
            type: 'toolUse',
            data: {
                toolName: toolUse.name,
                toolInput: toolUse.input,
                toolUseId: toolUse.id
            }
        });
    }

    private async _handleQuestionAnswer(toolUseId: string, answers: Record<string, string | string[]>): Promise<void> {
        if (!this._claudeProcess) {
            return;
        }

        // Send tool result back to Claude
        this._claudeProcess.sendToolResult(toolUseId, { answers });
    }

    private _handleClaudeError(error: Error): void {
        this._postMessage({
            type: 'error',
            data: error.message
        });
    }

    private _handleClaudeComplete(): void {
        this._isProcessing = false;
        this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });

        // Store successful interaction in memory
        this._storeInteractionMemory();
    }

    private async _storeInteractionMemory(): Promise<void> {
        // TODO: Analyze interaction and store relevant learnings
        if (this._memoryClient) {
            // Implementation for memory storage
        }
    }

    private _formatMemoryContext(memories: any[]): string {
        return `<relevant_memories>
${memories.map(m => `- ${m.content}`).join('\n')}
</relevant_memories>

Consider the above memories when responding.`;
    }

    private _stopProcessing(): void {
        if (this._claudeProcess) {
            this._claudeProcess.stop();
        }
        this._isProcessing = false;
        this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
    }

    public newSession(): void {
        this._stopProcessing();
        this._claudeProcess = undefined;
        this._postMessage({ type: 'clearMessages' });
    }

    public onConfigurationChanged(): void {
        this._initializeServices();
    }

    private async _sendCheckpointInfo(): Promise<void> {
        if (!this._backupManager) {
            return;
        }

        const checkpoints = await this._backupManager.getCheckpoints();
        const size = await this._backupManager.getBackupSize();

        this._postMessage({
            type: 'updateCheckpoints',
            checkpoints,
            size,
            count: checkpoints.length
        });
    }

    private async _createCheckpoint(description: string): Promise<void> {
        if (!this._backupManager) {
            return;
        }

        const checkpoint = await this._backupManager.createCheckpoint(description);
        if (checkpoint) {
            this._postMessage({
                type: 'checkpointCreated',
                description: checkpoint.description,
                count: this._backupManager.getCheckpointCount()
            });
        }
    }

    private async _restoreCheckpoint(sha: string): Promise<void> {
        if (!this._backupManager) {
            return;
        }

        const checkpoints = await this._backupManager.getCheckpoints();
        const checkpoint = checkpoints.find(c => c.sha === sha);

        const success = await this._backupManager.restoreCheckpoint(sha);
        if (success) {
            this._postMessage({
                type: 'checkpointRestored',
                description: checkpoint?.description || 'Unknown'
            });
            await this._sendCheckpointInfo();
        } else {
            this._postMessage({
                type: 'error',
                data: 'Failed to restore checkpoint'
            });
        }
    }

    public async createAutoCheckpoint(description: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('draagon');
        if (config.get<boolean>('backup.autoCheckpoint', true)) {
            await this._createCheckpoint(description);
        }
    }

    private _postMessage(message: any): void {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    // Setter methods for cross-module integration
    public setUsageTracker(tracker: UsageTracker): void {
        this._usageTracker = tracker;
    }

    public setSessionManager(manager: SessionManager): void {
        this._sessionManager = manager;
    }

    public setThinkingDisplay(display: ThinkingDisplay): void {
        this._thinkingDisplay = display;
    }

    // Public method to send messages programmatically
    public async sendMessage(text: string): Promise<void> {
        if (this._view) {
            // Display message in chat
            this._postMessage({
                type: 'userMessage',
                data: text
            });
        }
        await this._handleUserMessage(text);
    }
}
