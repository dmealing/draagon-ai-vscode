import * as vscode from 'vscode';
import { MemoryClient } from '../memory/client';

interface Memory {
    id: string;
    content: string;
    memoryType: string;
    scope: string;
    createdAt: string;
}

export class MemoryViewProvider implements vscode.TreeDataProvider<MemoryItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<MemoryItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _memories: Memory[] = [];
    private _client?: MemoryClient;

    constructor() {
        this._initializeClient();
    }

    private async _initializeClient(): Promise<void> {
        const config = vscode.workspace.getConfiguration('draagon');

        if (config.get<boolean>('memory.enabled', false)) {
            this._client = new MemoryClient(config);

            try {
                await this._client.connect();
                await this.refresh();
            } catch (error) {
                console.error('Failed to connect to memory server:', error);
            }
        }
    }

    getTreeItem(element: MemoryItem): vscode.TreeItem {
        return element;
    }

    getChildren(): MemoryItem[] {
        if (!this._client) {
            return [new MemoryItem({
                id: 'disabled',
                content: 'Memory integration disabled. Enable in settings.',
                memoryType: 'info',
                scope: '',
                createdAt: ''
            }, true)];
        }

        if (this._memories.length === 0) {
            return [new MemoryItem({
                id: 'empty',
                content: 'No memories yet. Start chatting to build memory.',
                memoryType: 'info',
                scope: '',
                createdAt: ''
            }, true)];
        }

        return this._memories.map(m => new MemoryItem(m));
    }

    async refresh(): Promise<void> {
        if (this._client) {
            try {
                this._memories = await this._client.list(20);
            } catch (error) {
                console.error('Failed to fetch memories:', error);
                this._memories = [];
            }
        }
        this._onDidChangeTreeData.fire(undefined);
    }

    async search(query: string): Promise<void> {
        if (this._client) {
            try {
                this._memories = await this._client.search(query, 20);
                this._onDidChangeTreeData.fire(undefined);
            } catch (error) {
                console.error('Failed to search memories:', error);
            }
        }
    }

    async deleteMemory(memoryId: string): Promise<void> {
        if (this._client) {
            try {
                await this._client.delete(memoryId);
                await this.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to delete memory: ${error}`);
            }
        }
    }
}

class MemoryItem extends vscode.TreeItem {
    constructor(
        public readonly memory: Memory,
        isPlaceholder: boolean = false
    ) {
        super(memory.content.substring(0, 50) + (memory.content.length > 50 ? '...' : ''));

        if (!isPlaceholder) {
            this.description = this._getTypeIcon(memory.memoryType);
            this.tooltip = new vscode.MarkdownString(`
**${this._getTypeName(memory.memoryType)}**

${memory.content}

---
*Scope:* ${memory.scope}
*Created:* ${new Date(memory.createdAt).toLocaleString()}
            `);
            this.contextValue = 'memory';
        } else {
            this.description = '';
        }
    }

    private _getTypeIcon(type: string): string {
        switch (type) {
            case 'fact': return '📝';
            case 'skill': return '💡';
            case 'preference': return '📌';
            case 'insight': return '🔮';
            case 'instruction': return '📋';
            default: return '🧠';
        }
    }

    private _getTypeName(type: string): string {
        switch (type) {
            case 'fact': return 'Fact';
            case 'skill': return 'Skill';
            case 'preference': return 'Preference';
            case 'insight': return 'Insight';
            case 'instruction': return 'Instruction';
            default: return 'Memory';
        }
    }
}
