import * as vscode from 'vscode';
import type { ImageInfo } from '../../images/handler';
import type { ConversationHistoryManager } from '../../history/manager';
import type { ThinkingModeManager } from '../../thinking/modes';
import type { PermissionManager } from '../../permissions/manager';
import type { TokenTracker } from '../../stats/tokenTracker';
import type { SessionManager } from '../../sessions/manager';

/**
 * Manages chat state including session, images, and module references.
 * Extracted from ChatViewProvider to handle state-related concerns.
 */
export class ChatStateManager {
    private _attachedImages: ImageInfo[] = [];
    private _currentSessionId?: string;
    private _claudeSessionId?: string;  // Claude CLI session ID for --resume
    private _isProcessing: boolean = false;
    private _pendingDiffs: Map<string, { filePath: string; contentBefore: string }> = new Map();

    // Module references
    private _permissionManager?: PermissionManager;
    private _tokenTracker?: TokenTracker;
    private _historyManager?: ConversationHistoryManager;
    private _thinkingModeManager?: ThinkingModeManager;
    private _sessionManager?: SessionManager;

    constructor() {}

    // ===== Processing State =====

    public get isProcessing(): boolean {
        return this._isProcessing;
    }

    public setProcessing(value: boolean): void {
        this._isProcessing = value;
    }

    // ===== Session State =====

    public get currentSessionId(): string | undefined {
        return this._currentSessionId;
    }

    public setCurrentSessionId(id: string | undefined): void {
        this._currentSessionId = id;
    }

    public startNewSession(): string {
        this._currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        return this._currentSessionId;
    }

    // ===== Claude CLI Session ID =====

    public get claudeSessionId(): string | undefined {
        return this._claudeSessionId;
    }

    public setClaudeSessionId(id: string | undefined): void {
        this._claudeSessionId = id;
    }

    // ===== Image Attachments =====

    public get attachedImages(): ImageInfo[] {
        return [...this._attachedImages];
    }

    public attachImage(imageInfo: ImageInfo): void {
        this._attachedImages.push(imageInfo);
    }

    public removeAttachedImage(imageId: string): ImageInfo | undefined {
        const index = this._attachedImages.findIndex(img => img.id === imageId);
        if (index !== -1) {
            return this._attachedImages.splice(index, 1)[0];
        }
        return undefined;
    }

    public clearAttachedImages(): void {
        this._attachedImages = [];
    }

    public hasAttachedImages(): boolean {
        return this._attachedImages.length > 0;
    }

    // ===== Pending Diffs (REQ-002) =====

    public setPendingDiff(toolUseId: string, data: { filePath: string; contentBefore: string }): void {
        this._pendingDiffs.set(toolUseId, data);
    }

    public getPendingDiff(toolUseId: string): { filePath: string; contentBefore: string } | undefined {
        return this._pendingDiffs.get(toolUseId);
    }

    public deletePendingDiff(toolUseId: string): boolean {
        return this._pendingDiffs.delete(toolUseId);
    }

    public clearPendingDiffs(): void {
        this._pendingDiffs.clear();
    }

    // ===== Module References =====

    public get permissionManager(): PermissionManager | undefined {
        return this._permissionManager;
    }

    public setPermissionManager(manager: PermissionManager): void {
        this._permissionManager = manager;
    }

    public get tokenTracker(): TokenTracker | undefined {
        return this._tokenTracker;
    }

    public setTokenTracker(tracker: TokenTracker): void {
        this._tokenTracker = tracker;
    }

    public get historyManager(): ConversationHistoryManager | undefined {
        return this._historyManager;
    }

    public setHistoryManager(manager: ConversationHistoryManager): void {
        this._historyManager = manager;
    }

    public get thinkingModeManager(): ThinkingModeManager | undefined {
        return this._thinkingModeManager;
    }

    public setThinkingModeManager(manager: ThinkingModeManager): void {
        this._thinkingModeManager = manager;
    }

    public get sessionManager(): SessionManager | undefined {
        return this._sessionManager;
    }

    public setSessionManager(manager: SessionManager): void {
        this._sessionManager = manager;
    }

    // ===== State Reset =====

    public reset(): void {
        this._attachedImages = [];
        this._pendingDiffs.clear();
        this._isProcessing = false;
        this._claudeSessionId = undefined;  // Reset Claude session for new conversation
        // Don't reset _currentSessionId - that's handled explicitly
    }

    public dispose(): void {
        this.reset();
    }
}
