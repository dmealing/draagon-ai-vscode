import * as vscode from 'vscode';
import { ClaudeProcess } from '../claude/process';
import { RequestRouter } from '../routing/router';
import { MemoryClient } from '../memory/client';
import { BackupManager } from '../backup/manager';
import { getWebviewContent } from '../ui/webview/content';
import type { UsageTracker } from '../stats/tracker';
import type { SessionManager } from '../sessions/manager';
import type { ThinkingDisplay } from '../thinking/display';
// REQ-001 through REQ-007 imports
import type { PermissionManager, PermissionRequest } from '../permissions/manager';
import type { ImageHandler, ImageInfo } from '../images/handler';
import type { TokenTracker } from '../stats/tokenTracker';
import type { ConversationHistoryManager } from '../history/manager';
import type { WslSupport } from '../wsl/support';
import type { ThinkingModeManager } from '../thinking/modes';
import { formatDiffForChat, openDiffEditor, getDiffStats } from '../diff/provider';
import * as fs from 'fs';
// Decomposed modules
import { ChatStateManager } from './chat/stateManager';
import { ClaudeMessageHandler, type MessagePoster } from './chat/messageHandler';
import { ChatWebviewManager, type WebviewMessageHandler } from './chat/webviewManager';

/**
 * ChatViewProvider - Main orchestrator for the chat interface.
 *
 * This provider has been refactored to use focused sub-modules:
 * - ChatStateManager: Manages session state, images, and module references
 * - ClaudeMessageHandler: Handles Claude message processing and tool use
 * - ChatWebviewManager: Manages webview lifecycle (view and panel)
 *
 * The provider itself serves as the coordinator, handling:
 * - Service initialization (routing, memory, backup)
 * - High-level message routing
 * - Cross-module coordination
 */
export class ChatViewProvider implements vscode.WebviewViewProvider, WebviewMessageHandler, MessagePoster {
    public static readonly viewType = 'draagon.chatView';

    // Core infrastructure (not decomposed - these are external services)
    private _claudeProcess?: ClaudeProcess;
    private _router?: RequestRouter;
    private _memoryClient?: MemoryClient;
    private _backupManager?: BackupManager;
    private _usageTracker?: UsageTracker;
    private _thinkingDisplay?: ThinkingDisplay;
    private _imageHandler?: ImageHandler;
    private _wslSupport?: WslSupport;

    // Decomposed modules
    private readonly _stateManager: ChatStateManager;
    private readonly _webviewManager: ChatWebviewManager;
    private _messageHandler?: ClaudeMessageHandler;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        // Get version from extension manifest
        const extension = vscode.extensions.getExtension('draagon.draagon-ai');
        const version = extension?.packageJSON?.version || 'dev';

        // Initialize decomposed modules
        this._stateManager = new ChatStateManager();
        this._webviewManager = new ChatWebviewManager(_extensionUri, version);
        this._webviewManager.setMessageHandler(this);

        this._initializeServices();
    }

    // ===== WebviewViewProvider Implementation =====

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._webviewManager.resolveWebviewView(webviewView);
    }

    // ===== MessagePoster Implementation =====

    public postMessage(message: any): void {
        this._webviewManager.postMessage(message);
    }

    // ===== Public API =====

    public openAsPanel(): void {
        this._webviewManager.openAsPanel();
    }

    public onConfigurationChanged(): void {
        this._initializeServices();
    }

    public async createAutoCheckpoint(description: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('draagon');
        if (config.get<boolean>('backup.autoCheckpoint', true)) {
            await this._createCheckpoint(description);
        }
    }

    // ===== Setter methods for cross-module integration =====

    public setUsageTracker(tracker: UsageTracker): void {
        this._usageTracker = tracker;
    }

    public setSessionManager(manager: SessionManager): void {
        this._stateManager.setSessionManager(manager);
    }

    public setThinkingDisplay(display: ThinkingDisplay): void {
        this._thinkingDisplay = display;
    }

    public setPermissionManager(manager: PermissionManager): void {
        this._stateManager.setPermissionManager(manager);
    }

    public setImageHandler(handler: ImageHandler): void {
        this._imageHandler = handler;
    }

    public setTokenTracker(tracker: TokenTracker): void {
        this._stateManager.setTokenTracker(tracker);
    }

    public setHistoryManager(manager: ConversationHistoryManager): void {
        this._stateManager.setHistoryManager(manager);
    }

    public setWslSupport(support: WslSupport): void {
        this._wslSupport = support;
    }

    public setThinkingModeManager(manager: ThinkingModeManager): void {
        this._stateManager.setThinkingModeManager(manager);
    }

    public attachImage(imageInfo: ImageInfo): void {
        this._stateManager.attachImage(imageInfo);
        this.postMessage({
            type: 'imageAttached',
            data: {
                id: imageInfo.id,
                filename: imageInfo.filename,
                size: imageInfo.size,
                dimensions: imageInfo.dimensions
            }
        });
    }

    public clearAttachedImages(): void {
        this._stateManager.clearAttachedImages();
        this.postMessage({ type: 'imagesCleared' });
    }

    public async sendMessage(text: string): Promise<void> {
        this.postMessage({
            type: 'userMessage',
            data: text
        });
        await this._handleUserMessage(text);
    }

    public newSession(): void {
        this._stopProcessing();
        this._claudeProcess = undefined;
        this._stateManager.reset();

        // End current conversation history
        const historyManager = this._stateManager.historyManager;
        if (historyManager && this._stateManager.currentSessionId) {
            historyManager.endConversation();
        }
        this._stateManager.setCurrentSessionId(undefined);

        // Reset token tracker for new session
        const tokenTracker = this._stateManager.tokenTracker;
        if (tokenTracker) {
            tokenTracker.resetSession();
        }

        this.postMessage({ type: 'clearMessages' });
        this.postMessage({ type: 'imagesCleared' });
    }

    // ===== WebviewMessageHandler Implementation =====

    public async handleWebviewMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'sendMessage':
                await this._handleUserMessage(message.text);
                break;
            case 'stopRequest':
                this._stopProcessing();
                break;
            case 'injectMessage':
                await this._injectMessage(message.text);
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
            case 'getCommands':
                await this._sendCommands();
                break;
            case 'getFiles':
                await this._sendFiles();
                break;
            // REQ-001: Permission responses from UI
            case 'permissionResponse':
                this._handlePermissionResponse(message.data);
                break;
            // REQ-002: Open diff in VS Code editor
            case 'openDiff':
                await this._openDiffEditor(message.data);
                break;
            // REQ-003: Image handling
            case 'imageDropped':
                await this._handleImageDrop(message.data);
                break;
            case 'imagePasted':
                await this._handleImagePaste(message.data);
                break;
            case 'removeImage':
                this._removeAttachedImage(message.data.id);
                break;
            // REQ-005: History operations
            case 'getHistory':
                this._sendHistory();
                break;
            case 'searchHistory':
                await this._searchHistory(message.query);
                break;
            case 'loadConversation':
                await this._loadConversation(message.id);
                break;
            case 'deleteConversation':
                await this._deleteConversation(message.id);
                break;
            // REQ-007: Thinking mode changes
            case 'setThinkingMode':
                this._setThinkingMode(message.mode);
                break;
            case 'getThinkingMode':
                this._sendThinkingMode();
                break;
            // Context compaction
            case 'compactContext':
                await this._compactContext();
                break;
            case 'showInfo':
                vscode.window.showInformationMessage(message.message);
                break;
            case 'getMentionItems':
                await this._sendMentionItems();
                break;
            case 'retryLastMessage':
                await this._retryLastMessage();
                break;
            case 'setPermissionMode':
                await this._setPermissionMode(message.mode);
                break;
            case 'attachImage':
                await this._triggerImagePicker();
                break;
        }
    }

    // ===== Private Methods =====

    private async _initializeServices(): Promise<void> {
        const config = vscode.workspace.getConfiguration('draagon');
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        // [DEFERRED] Multi-LLM routing - Coming Soon
        // This feature will be available via Draagon MCP in a future release.
        // The RequestRouter class exists but is not initialized until the feature is ready.
        // Setting routing.enabled has no effect - it's disabled in the UI with deprecation message.
        this._router = undefined;

        // [DEFERRED] Memory integration - Coming Soon
        // This feature will be available via Draagon MCP in a future release.
        // The MemoryClient class exists but is not initialized until the feature is ready.
        // Setting memory.enabled has no effect - it's disabled in the UI with deprecation message.
        this._memoryClient = undefined;

        // Initialize backup manager
        if (workspacePath) {
            this._backupManager = new BackupManager(workspacePath, config);
            await this._backupManager.initialize();

            // Listen for checkpoint changes
            this._backupManager.onCheckpointsChanged(_checkpoints => {
                this._sendCheckpointInfo();
            });
        }

        // Initialize message handler with dependencies
        this._messageHandler = new ClaudeMessageHandler({
            stateManager: this._stateManager,
            messagePoster: this,
            claudeProcess: this._claudeProcess,
            memoryClient: this._memoryClient
        });
    }

    private async _handleUserMessage(text: string): Promise<void> {
        console.log('[ChatView] _handleUserMessage called with:', text.substring(0, 50));

        if (this._stateManager.isProcessing) {
            console.log('[ChatView] Already processing, returning early');
            return;
        }

        // Store for retry functionality
        this._stateManager.setLastUserMessage(text);

        this._stateManager.setProcessing(true);
        this.postMessage({ type: 'setProcessing', data: { isProcessing: true } });
        console.log('[ChatView] Set processing to true');

        try {
            // REQ-007: Apply thinking mode instruction to message
            let processedText = text;
            const thinkingModeManager = this._stateManager.thinkingModeManager;
            if (thinkingModeManager) {
                processedText = thinkingModeManager.wrapMessage(text);
            }

            // REQ-005: Start or update conversation history
            const historyManager = this._stateManager.historyManager;
            if (historyManager) {
                if (!this._stateManager.currentSessionId) {
                    const conv = historyManager.startConversation(
                        `session_${Date.now()}`,
                        'claude-3.5-sonnet'
                    );
                    this._stateManager.setCurrentSessionId(conv.id);
                }
                historyManager.addMessage({
                    timestamp: new Date().toISOString(),
                    type: 'user',
                    content: text
                });
            }

            // Get relevant memories if enabled
            let memoryContext = '';
            if (this._memoryClient) {
                console.log('[ChatView] Fetching memories...');
                const memories = await this._memoryClient.search(text, 5);
                if (memories.length > 0) {
                    memoryContext = this._formatMemoryContext(memories);
                }
            }

            // Route the request
            if (this._router) {
                console.log('[ChatView] Routing request...');
                const result = await this._router.route(text, { memoryContext });

                // If routed to Groq or Draagon, handle directly
                if (result.provider !== 'claude') {
                    this.postMessage({
                        type: 'output',
                        data: result.content,
                        provider: result.provider
                    });
                    this._stateManager.setProcessing(false);
                    this.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
                    return;
                }
            }

            // Create checkpoint before Claude makes changes
            console.log('[ChatView] Creating checkpoint...');
            await this.createAutoCheckpoint(`Before: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

            // Use Claude Code CLI with processed text (includes thinking instruction)
            console.log('[ChatView] Calling _sendToClaudeCode...');
            await this._sendToClaudeCode(processedText, memoryContext);
            console.log('[ChatView] _sendToClaudeCode returned');

        } catch (error: any) {
            console.error('[ChatView] Error in _handleUserMessage:', error);
            this.postMessage({
                type: 'error',
                data: `Error: ${error.message}`
            });
            this._stateManager.setProcessing(false);
            this.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
        }
    }

    private async _sendToClaudeCode(text: string, memoryContext: string): Promise<void> {
        if (!this._claudeProcess) {
            this._claudeProcess = new ClaudeProcess({
                config: vscode.workspace.getConfiguration('draagon'),
                wslSupport: this._wslSupport
            });

            // Set up message handlers using decomposed handler
            this._claudeProcess.onMessage((msg) => this._handleClaudeMessage(msg));
            this._claudeProcess.onError((err) => {
                this._handleClaudeError(err);
                this.postMessage({
                    type: 'error',
                    data: `Claude CLI error: ${err.message}. Make sure 'claude' CLI is installed and authenticated.`
                });
            });
            this._claudeProcess.onComplete(() => this._handleClaudeComplete());

            await this._claudeProcess.start();

            // Update message handler with new claude process
            if (this._messageHandler) {
                this._messageHandler = new ClaudeMessageHandler({
                    stateManager: this._stateManager,
                    messagePoster: this,
                    claudeProcess: this._claudeProcess,
                    memoryClient: this._memoryClient
                });
            }
        }

        // Prepend memory context if available
        const fullMessage = memoryContext ? `${memoryContext}\n\n${text}` : text;

        try {
            // Pass Claude session ID for conversation continuity
            const claudeSessionId = this._stateManager.claudeSessionId;
            console.log('[ChatView] Sending to Claude with sessionId:', claudeSessionId);
            this._claudeProcess.send(fullMessage, claudeSessionId);
        } catch (error) {
            this.postMessage({
                type: 'error',
                data: `Failed to send message: ${error instanceof Error ? error.message : String(error)}`
            });
            this._stateManager.setProcessing(false);
            this.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
        }
    }

    private _handleClaudeMessage(message: any): void {
        if (this._messageHandler) {
            this._messageHandler.handleClaudeMessage(message);
        }
    }

    private _handleClaudeError(error: Error): void {
        if (this._messageHandler) {
            this._messageHandler.handleClaudeError(error);
        }
    }

    private _handleClaudeComplete(): void {
        if (this._messageHandler) {
            this._messageHandler.handleClaudeComplete();
        }
    }

    private async _handleQuestionAnswer(toolUseId: string, answers: Record<string, string | string[]>): Promise<void> {
        if (this._messageHandler) {
            await this._messageHandler.handleQuestionAnswer(toolUseId, answers);
        }
    }

    private _stopProcessing(): void {
        if (this._messageHandler) {
            this._messageHandler.stopProcessing();
        } else {
            if (this._claudeProcess) {
                this._claudeProcess.stop();
            }
            this._stateManager.setProcessing(false);
            this.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
        }
    }

    private async _injectMessage(text: string): Promise<void> {
        if (!this._claudeProcess || !this._stateManager.isProcessing) {
            await this._handleUserMessage(text);
            return;
        }

        this._claudeProcess.injectMessage(text);

        const historyManager = this._stateManager.historyManager;
        if (historyManager) {
            historyManager.addMessage({
                timestamp: new Date().toISOString(),
                type: 'user',
                content: `[Injected] ${text}`
            });
        }

        this.postMessage({
            type: 'injectionReceived',
            data: { text }
        });
    }

    private _formatMemoryContext(memories: any[]): string {
        if (this._messageHandler) {
            return this._messageHandler.formatMemoryContext(memories);
        }
        return `<relevant_memories>
${memories.map(m => `- ${m.content}`).join('\n')}
</relevant_memories>

Consider the above memories when responding.`;
    }

    // ===== Commands and Files =====

    private async _sendCommands(): Promise<void> {
        const commands: Array<{ command: string; description: string; source: string }> = [];

        const builtinCommands = [
            { command: '/review', description: 'Review selected code' },
            { command: '/explain', description: 'Explain selected code' },
            { command: '/fix', description: 'Fix issues in code' },
            { command: '/refactor', description: 'Refactor selected code' },
            { command: '/test', description: 'Generate tests' },
            { command: '/docs', description: 'Generate documentation' },
            { command: '/commit', description: 'Generate commit message' },
            { command: '/clear', description: 'Clear conversation' },
        ];

        for (const cmd of builtinCommands) {
            commands.push({ ...cmd, source: 'builtin' });
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const commandsDir = vscode.Uri.file(`${workspaceRoot}/.claude/commands`);

            try {
                const entries = await vscode.workspace.fs.readDirectory(commandsDir);
                for (const [name, type] of entries) {
                    if (type === vscode.FileType.File && name.endsWith('.md')) {
                        const cmdName = '/' + name.replace('.md', '');
                        let description = 'Custom command';
                        try {
                            const content = await vscode.workspace.fs.readFile(
                                vscode.Uri.file(`${workspaceRoot}/.claude/commands/${name}`)
                            );
                            const text = Buffer.from(content).toString('utf8');
                            const firstLine = text.split('\n')[0];
                            if (firstLine.startsWith('#')) {
                                description = firstLine.replace(/^#+\s*/, '');
                            } else if (firstLine.trim()) {
                                description = firstLine.substring(0, 60);
                            }
                        } catch {
                            // Ignore read errors
                        }
                        commands.push({ command: cmdName, description, source: 'custom' });
                    }
                }
            } catch {
                // .claude/commands doesn't exist
            }
        }

        this.postMessage({ type: 'updateCommands', commands });
    }

    private async _sendFiles(): Promise<void> {
        const files: string[] = [];

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const pattern = new vscode.RelativePattern(workspaceFolders[0], '**/*');
            const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 500);

            for (const uri of uris) {
                files.push(vscode.workspace.asRelativePath(uri));
            }
        }

        this.postMessage({ type: 'updateFiles', files });
    }

    private async _sendMentionItems(): Promise<void> {
        const files: { name: string; path: string }[] = [];
        const functions: { name: string; file: string; line: number }[] = [];

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            // Get files
            const pattern = new vscode.RelativePattern(workspaceFolders[0], '**/*.{ts,js,tsx,jsx,py,go,rs,java,c,cpp,h,hpp}');
            const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 200);

            for (const uri of uris) {
                const relativePath = vscode.workspace.asRelativePath(uri);
                const name = relativePath.split('/').pop() || relativePath;
                files.push({ name, path: relativePath });
            }

            // Get symbols (functions/classes) from open documents
            for (const doc of vscode.workspace.textDocuments) {
                if (doc.uri.scheme === 'file') {
                    try {
                        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                            'vscode.executeDocumentSymbolProvider',
                            doc.uri
                        );
                        if (symbols) {
                            const relativePath = vscode.workspace.asRelativePath(doc.uri);
                            this._extractSymbols(symbols, relativePath, functions);
                        }
                    } catch {
                        // Symbol provider not available for this document
                    }
                }
            }
        }

        this.postMessage({
            type: 'mentionItems',
            data: { files, functions }
        });
    }

    private _extractSymbols(
        symbols: vscode.DocumentSymbol[],
        file: string,
        result: { name: string; file: string; line: number }[]
    ): void {
        for (const symbol of symbols) {
            if (
                symbol.kind === vscode.SymbolKind.Function ||
                symbol.kind === vscode.SymbolKind.Method ||
                symbol.kind === vscode.SymbolKind.Class ||
                symbol.kind === vscode.SymbolKind.Interface
            ) {
                result.push({
                    name: symbol.name,
                    file,
                    line: symbol.range.start.line + 1
                });
            }
            if (symbol.children) {
                this._extractSymbols(symbol.children, file, result);
            }
        }
    }

    private async _retryLastMessage(): Promise<void> {
        const lastMessage = this._stateManager.getLastUserMessage();
        if (lastMessage) {
            await this._handleUserMessage(lastMessage);
        }
    }

    private async _setPermissionMode(mode: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('draagon');
        await config.update('permissionMode', mode, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Permission mode set to: ${mode}`);
    }

    private async _triggerImagePicker(): Promise<void> {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select Image',
            filters: {
                'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
            }
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            const filePath = fileUri[0].fsPath;

            // Read file and convert to base64
            const data = fs.readFileSync(filePath);
            const base64 = data.toString('base64');
            const mimeType = this._getMimeType(filePath);

            await this._handleImageDrop({
                base64,
                mimeType
            });
        }
    }

    private _getMimeType(filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'bmp': 'image/bmp'
        };
        return mimeTypes[ext || ''] || 'image/png';
    }

    // ===== Public API for context menu commands =====

    public async sendMessageToChat(text: string): Promise<void> {
        // Ensure the chat panel is visible
        this._webviewManager.openAsPanel();

        // Small delay to ensure panel is ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Send the message
        await this._handleUserMessage(text);
    }

    // ===== Checkpoints =====

    private async _sendCheckpointInfo(): Promise<void> {
        if (!this._backupManager) {
            return;
        }

        const checkpoints = await this._backupManager.getCheckpoints();
        const size = await this._backupManager.getBackupSize();

        this.postMessage({
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
            this.postMessage({
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
            this.postMessage({
                type: 'checkpointRestored',
                description: checkpoint?.description || 'Unknown'
            });
            await this._sendCheckpointInfo();
        } else {
            this.postMessage({
                type: 'error',
                data: 'Failed to restore checkpoint'
            });
        }
    }

    // ===== REQ-001: Permission System =====

    private async _handlePermissionResponse(data: {
        requestId: string;
        allowed: boolean;
        scope?: 'once' | 'session';
        addPattern?: string;
        alwaysAllow?: boolean;
        pattern?: string;
        enableYolo?: boolean;
    }): Promise<void> {
        const permissionManager = this._stateManager.permissionManager;
        if (!permissionManager) {
            return;
        }

        // Handle YOLO mode activation
        if (data.enableYolo) {
            await permissionManager.setYoloMode(true);
            vscode.window.showWarningMessage(
                '🚀 YOLO Mode enabled! All tool executions will be auto-approved.',
                'Disable YOLO'
            ).then(selection => {
                if (selection === 'Disable YOLO') {
                    permissionManager.setYoloMode(false);
                    vscode.window.showInformationMessage('YOLO Mode disabled.');
                }
            });
        }

        permissionManager.handlePermissionResponse({
            requestId: data.requestId,
            allowed: data.allowed,
            alwaysAllow: data.alwaysAllow || data.scope === 'session',
            pattern: data.pattern || data.addPattern
        });
    }

    // ===== REQ-002: Diff Rendering =====

    private async _openDiffEditor(data: {
        filePath: string;
        contentBefore: string;
        contentAfter: string;
    }): Promise<void> {
        await openDiffEditor(
            data.contentBefore,
            data.contentAfter,
            data.filePath
        );
    }

    // ===== REQ-003: Image Handling =====

    private async _handleImageDrop(data: { base64: string; mimeType: string }): Promise<void> {
        if (!this._imageHandler) {
            return;
        }

        const imageInfo = await this._imageHandler.saveImage(data.base64, data.mimeType);
        if (imageInfo) {
            this.attachImage(imageInfo);
        }
    }

    private async _handleImagePaste(data: { base64: string; mimeType: string }): Promise<void> {
        await this._handleImageDrop(data);
    }

    private _removeAttachedImage(imageId: string): void {
        const removed = this._stateManager.removeAttachedImage(imageId);
        if (removed && this._imageHandler) {
            this._imageHandler.deleteImage(removed.path);
        }
        this.postMessage({
            type: 'imageRemoved',
            data: { id: imageId }
        });
    }

    // ===== REQ-005: History Management =====

    private _sendHistory(): void {
        const historyManager = this._stateManager.historyManager;
        if (!historyManager) {
            this.postMessage({ type: 'historyData', data: { conversations: [], groups: {} } });
            return;
        }

        const conversations = historyManager.getConversations();
        const groups = historyManager.getConversationsGroupedByDate();

        this.postMessage({
            type: 'historyData',
            data: { conversations, groups }
        });
    }

    private async _searchHistory(query: string): Promise<void> {
        const historyManager = this._stateManager.historyManager;
        if (!historyManager) {
            this.postMessage({ type: 'historySearchResults', data: [] });
            return;
        }

        const results = await historyManager.searchConversations(query);
        this.postMessage({
            type: 'historySearchResults',
            data: results
        });
    }

    private async _loadConversation(id: string): Promise<void> {
        const historyManager = this._stateManager.historyManager;
        if (!historyManager) {
            return;
        }

        const conversation = await historyManager.getConversation(id);
        if (conversation) {
            this.postMessage({ type: 'clearMessages' });

            for (const msg of conversation.messages) {
                if (msg.type === 'user') {
                    this.postMessage({
                        type: 'userMessage',
                        data: msg.content
                    });
                } else if (msg.type === 'assistant') {
                    this.postMessage({
                        type: 'output',
                        data: msg.content
                    });
                }
            }

            this._stateManager.setCurrentSessionId(conversation.id);

            this.postMessage({
                type: 'conversationLoaded',
                data: { id: conversation.id, sessionId: conversation.sessionId }
            });
        }
    }

    private async _deleteConversation(id: string): Promise<void> {
        const historyManager = this._stateManager.historyManager;
        if (!historyManager) {
            return;
        }

        const success = await historyManager.deleteConversation(id);
        if (success) {
            this.postMessage({
                type: 'conversationDeleted',
                data: { id }
            });
            this._sendHistory();
        }
    }

    // ===== REQ-007: Thinking Mode =====

    private _setThinkingMode(mode: string): void {
        const thinkingModeManager = this._stateManager.thinkingModeManager;
        if (thinkingModeManager) {
            thinkingModeManager.setMode(mode as any);
            this._sendThinkingMode();
        }
    }

    private _sendThinkingMode(): void {
        const thinkingModeManager = this._stateManager.thinkingModeManager;
        if (!thinkingModeManager) {
            return;
        }

        const mode = thinkingModeManager.getMode();
        const config = thinkingModeManager.getModeConfig();
        const modes = thinkingModeManager.getModes();

        this.postMessage({
            type: 'thinkingModeData',
            data: {
                currentMode: mode,
                config,
                allModes: modes
            }
        });
    }

    // ===== Context Compaction =====

    private async _compactContext(): Promise<void> {
        // Context compaction sends a special message to Claude asking it to summarize
        // the conversation so far, then starts a new session with that summary
        const claudeSessionId = this._stateManager.claudeSessionId;

        if (!claudeSessionId) {
            this.postMessage({
                type: 'contextCompacted',
                success: false,
                error: 'No active session to compact'
            });
            return;
        }

        try {
            // Create a new Claude process to request summarization
            const summaryProcess = new ClaudeProcess({
                config: vscode.workspace.getConfiguration('draagon'),
                wslSupport: this._wslSupport
            });

            let summaryText = '';

            summaryProcess.onMessage((msg) => {
                if (msg.type === 'assistant' && msg.message?.content) {
                    for (const content of msg.message.content) {
                        if (content.type === 'text') {
                            summaryText += content.text;
                        }
                    }
                }
            });

            await new Promise<void>((resolve, reject) => {
                summaryProcess.onComplete(() => resolve());
                summaryProcess.onError((err) => reject(err));

                // Ask Claude to summarize the conversation
                summaryProcess.send(
                    'Please provide a brief summary of our conversation so far, focusing on key decisions, code changes made, and any pending tasks. Keep it concise (under 500 words).',
                    claudeSessionId
                );

                // Timeout after 30 seconds
                setTimeout(() => reject(new Error('Summary request timed out')), 30000);
            });

            // Reset the session and start fresh with the summary as context
            this._stateManager.setClaudeSessionId(undefined);
            this._claudeProcess = undefined;

            // Reset token tracker
            const tokenTracker = this._stateManager.tokenTracker;
            if (tokenTracker) {
                tokenTracker.resetSession();
            }

            this.postMessage({
                type: 'contextCompacted',
                success: true,
                summary: summaryText.substring(0, 200) + (summaryText.length > 200 ? '...' : ''),
                newTokenCount: 0
            });

            // Inject the summary as context for the new session
            if (summaryText) {
                this.postMessage({
                    type: 'output',
                    data: `**Previous conversation summary:**\n${summaryText}`
                });
            }

        } catch (error) {
            this.postMessage({
                type: 'contextCompacted',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
