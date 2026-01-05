import * as vscode from 'vscode';
import WebSocket from 'ws';
import { Memory, MemorySearchResult } from '../claude/types';

// REQ-014: Connection state enum
export type MemoryConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// REQ-014: Memory input for pending queue
export interface MemoryInput {
    content: string;
    memoryType?: string;
    importance?: number;
    metadata?: Record<string, unknown>;
}

export class MemoryClient {
    private _serverUrl: string;
    private _ws: WebSocket | null = null;
    private _messageHandlers: Map<string, (data: unknown) => void> = new Map();

    // REQ-014: Enhanced connection state tracking
    private _connectionState: MemoryConnectionState = 'disconnected';
    private _onConnectionStateChange = new vscode.EventEmitter<MemoryConnectionState>();
    public readonly onConnectionStateChange = this._onConnectionStateChange.event;

    // REQ-014: Auto-reconnect support
    private _reconnectAttempts = 0;
    private readonly _maxReconnectAttempts = 5;
    private _reconnectTimer?: ReturnType<typeof setTimeout>;
    private _autoReconnect = true;

    // REQ-014: Pending memory queue for offline mode
    private _pendingMemories: MemoryInput[] = [];

    constructor(config: vscode.WorkspaceConfiguration) {
        this._serverUrl = config.get<string>('memory.serverUrl', 'ws://localhost:3100');
        this._autoReconnect = config.get<boolean>('memory.autoReconnect', true);
    }

    // REQ-014: Get current connection state
    public get connectionState(): MemoryConnectionState {
        return this._connectionState;
    }

    // REQ-014: Set connection state and emit event
    private _setConnectionState(state: MemoryConnectionState): void {
        if (this._connectionState !== state) {
            this._connectionState = state;
            this._onConnectionStateChange.fire(state);
        }
    }

    public async connect(): Promise<void> {
        if (this._connectionState === 'connecting') {
            return; // Already attempting connection
        }

        this._setConnectionState('connecting');

        return new Promise((resolve, reject) => {
            try {
                this._ws = new WebSocket(this._serverUrl);

                const connectionTimeout = setTimeout(() => {
                    if (this._connectionState === 'connecting') {
                        this._ws?.close();
                        this._setConnectionState('error');
                        reject(new Error('Connection timeout'));
                    }
                }, 10000);

                this._ws.on('open', () => {
                    clearTimeout(connectionTimeout);
                    this._setConnectionState('connected');
                    this._reconnectAttempts = 0;
                    console.log('Connected to Draagon Memory Server');

                    // REQ-014: Sync pending memories on reconnect
                    this._syncPendingMemories();

                    resolve();
                });

                this._ws.on('error', (error: Error) => {
                    clearTimeout(connectionTimeout);
                    console.error('Memory server connection error:', error);
                    this._setConnectionState('error');
                    reject(new Error('Failed to connect to memory server'));
                });

                this._ws.on('close', () => {
                    const wasConnected = this._connectionState === 'connected';
                    this._setConnectionState('disconnected');
                    console.log('Disconnected from memory server');

                    // REQ-014: Auto-reconnect if enabled and was previously connected
                    if (wasConnected && this._autoReconnect) {
                        this._attemptReconnect();
                    }
                });

                this._ws.on('message', (data: WebSocket.Data) => {
                    this._handleMessage(data.toString());
                });
            } catch (error) {
                this._setConnectionState('error');
                reject(error);
            }
        });
    }

    // REQ-014: Automatic reconnection with exponential backoff
    private _attemptReconnect(): void {
        if (this._reconnectAttempts >= this._maxReconnectAttempts) {
            console.warn('Max reconnect attempts reached, giving up');
            this._setConnectionState('error');
            return;
        }

        const delay = Math.min(
            1000 * Math.pow(2, this._reconnectAttempts),
            30000 // Max 30 second delay
        );

        console.log(`Reconnecting to memory server in ${delay}ms (attempt ${this._reconnectAttempts + 1}/${this._maxReconnectAttempts})`);

        this._reconnectTimer = setTimeout(async () => {
            this._reconnectAttempts++;
            try {
                await this.connect();
            } catch (error) {
                console.error('Reconnection failed:', error);
                this._attemptReconnect();
            }
        }, delay);
    }

    // REQ-014: Sync pending memories when connected
    private async _syncPendingMemories(): Promise<void> {
        if (this._pendingMemories.length === 0) {
            return;
        }

        console.log(`Syncing ${this._pendingMemories.length} pending memories`);

        const toSync = [...this._pendingMemories];
        this._pendingMemories = [];

        for (const memory of toSync) {
            try {
                await this._sendRequest('memory/store', memory as unknown as Record<string, unknown>);
            } catch (error) {
                console.error('Failed to sync pending memory:', error);
                // Re-queue failed items
                this._pendingMemories.push(memory);
            }
        }

        if (this._pendingMemories.length > 0) {
            console.warn(`${this._pendingMemories.length} memories failed to sync, will retry later`);
        }
    }

    // REQ-014: Get pending memories count
    public get pendingMemoriesCount(): number {
        return this._pendingMemories.length;
    }

    private _handleMessage(data: string): void {
        try {
            const response = JSON.parse(data);
            if (response.id) {
                const handler = this._messageHandlers.get(response.id);
                if (handler) {
                    handler(response);
                    this._messageHandlers.delete(response.id);
                }
            }
        } catch (error) {
            console.error('Failed to parse memory server message:', error);
        }
    }

    public disconnect(): void {
        this._autoReconnect = false; // Disable auto-reconnect on manual disconnect
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = undefined;
        }
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
        this._setConnectionState('disconnected');
    }

    // REQ-014: Backwards compatibility
    public isConnected(): boolean {
        return this._connectionState === 'connected';
    }

    // REQ-014: Store with offline queue support
    public async store(memory: MemoryInput): Promise<Memory | null> {
        // If not connected, queue for later
        if (this._connectionState !== 'connected') {
            console.log('Memory service offline, queuing memory for later sync');
            this._pendingMemories.push(memory);
            return null;
        }

        try {
            return await this._sendRequest('memory/store', memory as unknown as Record<string, unknown>);
        } catch (error) {
            console.error('Failed to store memory, queuing for retry:', error);
            this._pendingMemories.push(memory);
            this._handleConnectionError(error);
            return null;
        }
    }

    // REQ-014: Search with graceful degradation
    public async search(query: string, limit: number = 10): Promise<Memory[]> {
        if (this._connectionState !== 'connected') {
            console.log('Memory service offline, skipping search');
            return [];
        }

        try {
            const results = await this._sendRequest<MemorySearchResult[]>('memory/search', {
                query,
                limit
            });
            return results.map(r => r.memory);
        } catch (error) {
            console.error('Memory search failed:', error);
            this._handleConnectionError(error);
            return [];
        }
    }

    // REQ-014: List with graceful degradation
    public async list(limit: number = 20): Promise<Memory[]> {
        if (this._connectionState !== 'connected') {
            return [];
        }

        try {
            return await this._sendRequest('memory/list', { limit });
        } catch (error) {
            console.error('Memory list failed:', error);
            this._handleConnectionError(error);
            return [];
        }
    }

    public async get(id: string): Promise<Memory | null> {
        if (this._connectionState !== 'connected') {
            return null;
        }

        try {
            return await this._sendRequest('memory/get', { id });
        } catch (error) {
            console.error('Memory get failed:', error);
            this._handleConnectionError(error);
            return null;
        }
    }

    public async delete(id: string): Promise<boolean> {
        if (this._connectionState !== 'connected') {
            return false;
        }

        try {
            await this._sendRequest('memory/delete', { id });
            return true;
        } catch (error) {
            console.error('Memory delete failed:', error);
            this._handleConnectionError(error);
            return false;
        }
    }

    public async getContext(prompt: string): Promise<Memory[]> {
        if (this._connectionState !== 'connected') {
            return [];
        }

        try {
            return await this._sendRequest('memory/context', { prompt, limit: 5 });
        } catch (error) {
            console.error('Memory context fetch failed:', error);
            this._handleConnectionError(error);
            return [];
        }
    }

    // REQ-014: Handle connection errors and trigger reconnect if needed
    private _handleConnectionError(error: unknown): void {
        // If this looks like a connection error, trigger reconnect
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('socket hang up') ||
            errorMessage.includes('connection')
        ) {
            this._setConnectionState('error');
            if (this._autoReconnect) {
                this._attemptReconnect();
            }
        }
    }

    private async _sendRequest<T>(method: string, params: Record<string, unknown>): Promise<T> {
        if (this._connectionState !== 'connected' || !this._ws) {
            throw new Error('Not connected to memory server');
        }

        return new Promise((resolve, reject) => {
            const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

            // Register handler for this request
            this._messageHandlers.set(id, (response: unknown) => {
                const resp = response as { error?: { message: string }; result?: T };
                if (resp.error) {
                    reject(new Error(resp.error.message));
                } else {
                    resolve(resp.result as T);
                }
            });

            // Send MCP-style JSON-RPC request
            this._ws!.send(JSON.stringify({
                jsonrpc: '2.0',
                id,
                method,
                params
            }));

            // Timeout after 10 seconds
            setTimeout(() => {
                if (this._messageHandlers.has(id)) {
                    this._messageHandlers.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 10000);
        });
    }

    // REQ-014: Dispose with cleanup
    public dispose(): void {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
        }
        this._onConnectionStateChange.dispose();
        this.disconnect();
    }
}

// Memory context builder for injecting into prompts
export class MemoryContextBuilder {
    private _client: MemoryClient;

    constructor(client: MemoryClient) {
        this._client = client;
    }

    public async buildContext(prompt: string): Promise<string> {
        if (!this._client.isConnected()) {
            return '';
        }

        try {
            const memories = await this._client.getContext(prompt);

            if (memories.length === 0) {
                return '';
            }

            const contextLines = memories.map(m => {
                const typeIcon = this._getTypeIcon(m.memoryType);
                return `${typeIcon} ${m.content}`;
            });

            return `\n<relevant_memories>\n${contextLines.join('\n')}\n</relevant_memories>\n`;
        } catch (error) {
            console.error('Failed to build memory context:', error);
            return '';
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
}
