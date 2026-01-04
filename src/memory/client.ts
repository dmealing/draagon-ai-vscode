import * as vscode from 'vscode';
import WebSocket from 'ws';
import { Memory, MemorySearchResult } from '../claude/types';

export class MemoryClient {
    private _serverUrl: string;
    private _connected: boolean = false;
    private _ws: WebSocket | null = null;
    private _messageHandlers: Map<string, (data: unknown) => void> = new Map();

    constructor(config: vscode.WorkspaceConfiguration) {
        this._serverUrl = config.get<string>('memory.serverUrl', 'ws://localhost:3100');
    }

    public async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // Use MCP protocol over WebSocket
                this._ws = new WebSocket(this._serverUrl);

                this._ws.on('open', () => {
                    this._connected = true;
                    console.log('Connected to Draagon Memory Server');
                    resolve();
                });

                this._ws.on('error', (error: Error) => {
                    console.error('Memory server connection error:', error);
                    reject(new Error('Failed to connect to memory server'));
                });

                this._ws.on('close', () => {
                    this._connected = false;
                    console.log('Disconnected from memory server');
                });

                this._ws.on('message', (data: WebSocket.Data) => {
                    this._handleMessage(data.toString());
                });
            } catch (error) {
                reject(error);
            }
        });
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
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
        this._connected = false;
    }

    public isConnected(): boolean {
        return this._connected;
    }

    public async store(memory: Omit<Memory, 'id' | 'createdAt'>): Promise<Memory> {
        return this._sendRequest('memory/store', memory);
    }

    public async search(query: string, limit: number = 10): Promise<Memory[]> {
        const results = await this._sendRequest<MemorySearchResult[]>('memory/search', {
            query,
            limit
        });
        return results.map(r => r.memory);
    }

    public async list(limit: number = 20): Promise<Memory[]> {
        return this._sendRequest('memory/list', { limit });
    }

    public async get(id: string): Promise<Memory | null> {
        return this._sendRequest('memory/get', { id });
    }

    public async delete(id: string): Promise<void> {
        await this._sendRequest('memory/delete', { id });
    }

    public async getContext(prompt: string): Promise<Memory[]> {
        // Get relevant memories for a given prompt
        return this._sendRequest('memory/context', { prompt, limit: 5 });
    }

    private async _sendRequest<T>(method: string, params: Record<string, unknown>): Promise<T> {
        if (!this._connected || !this._ws) {
            throw new Error('Not connected to memory server');
        }

        return new Promise((resolve, reject) => {
            const id = Date.now().toString();

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
