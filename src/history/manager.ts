import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ConversationMessage {
    timestamp: string;
    type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
}

export interface ConversationMetadata {
    id: string;
    filename: string;
    sessionId: string;
    startTime: string;
    endTime: string;
    messageCount: number;
    totalCost: number;
    totalTokens: { input: number; output: number };
    firstUserMessage: string;
    lastUserMessage: string;
    model?: string;
    tags?: string[];
}

export interface Conversation {
    id: string;
    sessionId: string;
    startTime: string;
    endTime?: string;
    messages: ConversationMessage[];
    metadata: {
        totalCost: number;
        totalTokens: { input: number; output: number };
        model?: string;
    };
}

export class ConversationHistoryManager {
    private conversationsPath: string;
    private indexPath: string;
    private index: ConversationMetadata[] = [];
    private currentConversation: Conversation | null = null;
    private _initialized: Promise<void>;
    private _saveInProgress: Promise<void> | null = null;

    constructor(private context: vscode.ExtensionContext) {
        const storagePath = context.storageUri?.fsPath || context.globalStorageUri.fsPath;
        this.conversationsPath = path.join(storagePath, 'conversations');
        this.indexPath = path.join(this.conversationsPath, 'index.json');
        this._initialized = this.initializeAsync();
    }

    /**
     * Wait for the manager to be fully initialized.
     */
    public async waitForInitialization(): Promise<void> {
        return this._initialized;
    }

    private async initializeAsync(): Promise<void> {
        try {
            // Create conversations directory if it doesn't exist
            await fs.promises.mkdir(this.conversationsPath, { recursive: true });

            // Load index
            try {
                const content = await fs.promises.readFile(this.indexPath, 'utf-8');
                this.index = JSON.parse(content);
            } catch {
                // File doesn't exist or is invalid
                this.index = [];
            }
        } catch (error) {
            console.error('Failed to initialize conversation history:', error);
            this.index = [];
        }
    }

    private async saveIndexAsync(): Promise<void> {
        try {
            await fs.promises.writeFile(this.indexPath, JSON.stringify(this.index, null, 2));
        } catch (error) {
            console.error('Failed to save conversation index:', error);
        }
    }

    /**
     * Get the current conversation (for testing)
     */
    public getCurrentConversation(): Conversation | null {
        return this.currentConversation;
    }

    /**
     * Start a new conversation
     */
    public startConversation(sessionId: string, model?: string): Conversation {
        const id = this.generateId();
        const now = new Date().toISOString();

        this.currentConversation = {
            id,
            sessionId,
            startTime: now,
            messages: [],
            metadata: {
                totalCost: 0,
                totalTokens: { input: 0, output: 0 },
                model
            }
        };

        return this.currentConversation;
    }

    /**
     * Add a message to the current conversation
     */
    public addMessage(message: ConversationMessage): void {
        if (!this.currentConversation) {
            return;
        }

        this.currentConversation.messages.push(message);
        this.scheduleAutoSave();
    }

    /**
     * Update conversation metadata (tokens, cost)
     */
    public updateMetadata(updates: Partial<Conversation['metadata']>): void {
        if (!this.currentConversation) {
            return;
        }

        Object.assign(this.currentConversation.metadata, updates);
        this.scheduleAutoSave();
    }

    /**
     * End the current conversation
     */
    public async endConversation(): Promise<void> {
        if (!this.currentConversation) {
            return;
        }

        this.currentConversation.endTime = new Date().toISOString();
        await this.saveConversationAsync(this.currentConversation);
        this.currentConversation = null;
    }

    /**
     * Save conversation to disk
     */
    private async saveConversationAsync(conversation: Conversation): Promise<void> {
        // Wait for any in-progress save
        if (this._saveInProgress) {
            await this._saveInProgress;
        }

        this._saveInProgress = (async () => {
            try {
                const filename = `conv_${this.formatTimestamp(new Date(conversation.startTime))}.json`;
                const filePath = path.join(this.conversationsPath, filename);

                await fs.promises.writeFile(filePath, JSON.stringify(conversation, null, 2));

                // Update index
                const userMessages = conversation.messages.filter(m => m.type === 'user');
                const firstUserMessage = userMessages[0]?.content || '';
                const lastUserMessage = userMessages[userMessages.length - 1]?.content || '';

                const existingIndex = this.index.findIndex(c => c.id === conversation.id);
                const metadata: ConversationMetadata = {
                    id: conversation.id,
                    filename,
                    sessionId: conversation.sessionId,
                    startTime: conversation.startTime,
                    endTime: conversation.endTime || new Date().toISOString(),
                    messageCount: conversation.messages.length,
                    totalCost: conversation.metadata.totalCost,
                    totalTokens: conversation.metadata.totalTokens,
                    firstUserMessage: firstUserMessage.substring(0, 200),
                    lastUserMessage: lastUserMessage.substring(0, 200),
                    model: conversation.metadata.model
                };

                if (existingIndex >= 0) {
                    this.index[existingIndex] = metadata;
                } else {
                    this.index.unshift(metadata);
                }

                // Limit index size
                const maxConversations = vscode.workspace.getConfiguration('draagon').get<number>('history.maxConversations', 100);
                if (this.index.length > maxConversations) {
                    const removed = this.index.splice(maxConversations);
                    // Delete old conversation files
                    for (const conv of removed) {
                        const oldPath = path.join(this.conversationsPath, conv.filename);
                        try {
                            await fs.promises.unlink(oldPath);
                        } catch {
                            // File may not exist
                        }
                    }
                }

                await this.saveIndexAsync();
            } catch (error) {
                console.error('Failed to save conversation:', error);
            } finally {
                this._saveInProgress = null;
            }
        })();

        return this._saveInProgress;
    }

    /**
     * Auto-save current conversation periodically
     */
    private autoSaveTimer: NodeJS.Timeout | null = null;
    private scheduleAutoSave(): void {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }

        this.autoSaveTimer = setTimeout(async () => {
            if (this.currentConversation) {
                await this.saveConversationAsync(this.currentConversation);
            }
        }, 5000); // Save after 5 seconds of inactivity
    }

    /**
     * Get all conversations (metadata only)
     */
    public getConversations(): ConversationMetadata[] {
        return [...this.index];
    }

    /**
     * Get conversation by ID
     */
    public async getConversation(id: string): Promise<Conversation | null> {
        await this._initialized;

        const metadata = this.index.find(c => c.id === id);
        if (!metadata) {
            return null;
        }

        try {
            const filePath = path.join(this.conversationsPath, metadata.filename);
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Failed to load conversation:', error);
            return null;
        }
    }

    /**
     * Get the latest conversation
     */
    public getLatestConversation(): ConversationMetadata | null {
        return this.index[0] || null;
    }

    /**
     * Search conversations
     */
    public async searchConversations(query: string, limit: number = 50): Promise<ConversationMetadata[]> {
        await this._initialized;

        const lowerQuery = query.toLowerCase();
        const results: ConversationMetadata[] = [];

        for (const metadata of this.index) {
            if (results.length >= limit) break;

            // Search in preview text
            if (metadata.firstUserMessage.toLowerCase().includes(lowerQuery) ||
                metadata.lastUserMessage.toLowerCase().includes(lowerQuery)) {
                results.push(metadata);
                continue;
            }

            // Search in full conversation
            const conversation = await this.getConversation(metadata.id);
            if (conversation) {
                const hasMatch = conversation.messages.some(m =>
                    m.content.toLowerCase().includes(lowerQuery)
                );
                if (hasMatch) {
                    results.push(metadata);
                }
            }
        }

        return results;
    }

    /**
     * Delete a conversation
     */
    public async deleteConversation(id: string): Promise<boolean> {
        await this._initialized;

        const index = this.index.findIndex(c => c.id === id);
        if (index < 0) {
            return false;
        }

        const metadata = this.index[index];
        const filePath = path.join(this.conversationsPath, metadata.filename);

        try {
            try {
                await fs.promises.unlink(filePath);
            } catch {
                // File may not exist
            }
            this.index.splice(index, 1);
            await this.saveIndexAsync();
            return true;
        } catch (error) {
            console.error('Failed to delete conversation:', error);
            return false;
        }
    }

    /**
     * Export conversation as Markdown
     */
    public async exportAsMarkdown(id: string): Promise<string | null> {
        const conversation = await this.getConversation(id);
        if (!conversation) {
            return null;
        }

        const lines: string[] = [];
        lines.push(`# Conversation`);
        lines.push(`**Session ID:** ${conversation.sessionId}`);
        lines.push(`**Started:** ${new Date(conversation.startTime).toLocaleString()}`);
        if (conversation.endTime) {
            lines.push(`**Ended:** ${new Date(conversation.endTime).toLocaleString()}`);
        }
        lines.push(`**Messages:** ${conversation.messages.length}`);
        lines.push(`**Cost:** $${conversation.metadata.totalCost.toFixed(4)}`);
        lines.push('');
        lines.push('---');
        lines.push('');

        for (const message of conversation.messages) {
            const time = new Date(message.timestamp).toLocaleTimeString();
            switch (message.type) {
                case 'user':
                    lines.push(`## 👤 User (${time})`);
                    lines.push('');
                    lines.push(message.content);
                    break;
                case 'assistant':
                    lines.push(`## 🤖 Assistant (${time})`);
                    lines.push('');
                    lines.push(message.content);
                    break;
                case 'tool_use':
                    lines.push(`## 🔧 Tool Use (${time})`);
                    lines.push('');
                    lines.push('```');
                    lines.push(message.content);
                    lines.push('```');
                    break;
                case 'tool_result':
                    lines.push(`## 📋 Tool Result (${time})`);
                    lines.push('');
                    lines.push('```');
                    lines.push(message.content.substring(0, 500));
                    if (message.content.length > 500) {
                        lines.push('... (truncated)');
                    }
                    lines.push('```');
                    break;
            }
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Group conversations by date
     */
    public getConversationsGroupedByDate(): Record<string, ConversationMetadata[]> {
        const groups: Record<string, ConversationMetadata[]> = {
            'Today': [],
            'Yesterday': [],
            'This Week': [],
            'This Month': [],
            'Older': []
        };

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

        for (const conv of this.index) {
            const date = new Date(conv.startTime);
            if (date >= today) {
                groups['Today'].push(conv);
            } else if (date >= yesterday) {
                groups['Yesterday'].push(conv);
            } else if (date >= weekAgo) {
                groups['This Week'].push(conv);
            } else if (date >= monthAgo) {
                groups['This Month'].push(conv);
            } else {
                groups['Older'].push(conv);
            }
        }

        // Remove empty groups
        for (const key of Object.keys(groups)) {
            if (groups[key].length === 0) {
                delete groups[key];
            }
        }

        return groups;
    }

    private generateId(): string {
        return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    private formatTimestamp(date: Date): string {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    }

    public async dispose(): Promise<void> {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        // Save any pending conversation
        if (this.currentConversation) {
            await this.saveConversationAsync(this.currentConversation);
        }
    }
}
