import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface Session {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    lastMessage: string;
    model: string;
    workspaceFolder?: string;
    tags: string[];
    archived: boolean;
}

export interface SessionMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    tokens?: number;
    toolCalls?: string[];
}

export interface SessionData {
    session: Session;
    messages: SessionMessage[];
}

export class SessionManager {
    private _sessions: Map<string, Session> = new Map();
    private _currentSessionId: string | null = null;
    private _storagePath: string;
    private _onSessionsChanged: vscode.EventEmitter<Session[]> = new vscode.EventEmitter();
    private _onCurrentSessionChanged: vscode.EventEmitter<string | null> = new vscode.EventEmitter();

    public readonly onSessionsChanged = this._onSessionsChanged.event;
    public readonly onCurrentSessionChanged = this._onCurrentSessionChanged.event;

    constructor(context: vscode.ExtensionContext) {
        this._storagePath = path.join(context.globalStorageUri.fsPath, 'sessions');
        this._ensureStorageDir();
        this._loadSessions();
    }

    private _ensureStorageDir(): void {
        if (!fs.existsSync(this._storagePath)) {
            fs.mkdirSync(this._storagePath, { recursive: true });
        }
    }

    private _loadSessions(): void {
        try {
            const indexPath = path.join(this._storagePath, 'index.json');
            if (fs.existsSync(indexPath)) {
                const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
                this._sessions = new Map(data.sessions.map((s: Session) => [s.id, s]));
                this._currentSessionId = data.currentSessionId || null;
            }
        } catch (error) {
            console.error('Failed to load sessions:', error);
        }
    }

    private _saveSessions(): void {
        try {
            const indexPath = path.join(this._storagePath, 'index.json');
            const data = {
                currentSessionId: this._currentSessionId,
                sessions: Array.from(this._sessions.values())
            };
            fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save sessions:', error);
        }
    }

    public createSession(name?: string): Session {
        const id = this._generateId();
        const now = new Date().toISOString();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name;

        const session: Session = {
            id,
            name: name || `Session ${this._sessions.size + 1}`,
            createdAt: now,
            updatedAt: now,
            messageCount: 0,
            lastMessage: '',
            model: 'default',
            workspaceFolder,
            tags: [],
            archived: false
        };

        this._sessions.set(id, session);
        this._currentSessionId = id;
        this._saveSessions();
        this._saveSessionData(id, { session, messages: [] });
        this._onSessionsChanged.fire(this.getSessions());
        this._onCurrentSessionChanged.fire(id);

        return session;
    }

    public renameSession(id: string, name: string): boolean {
        const session = this._sessions.get(id);
        if (!session) {
            return false;
        }

        session.name = name;
        session.updatedAt = new Date().toISOString();
        this._saveSessions();
        this._onSessionsChanged.fire(this.getSessions());
        return true;
    }

    public resumeSession(id: string): SessionData | null {
        const session = this._sessions.get(id);
        if (!session) {
            return null;
        }

        this._currentSessionId = id;
        session.updatedAt = new Date().toISOString();
        this._saveSessions();
        this._onCurrentSessionChanged.fire(id);

        return this._loadSessionData(id);
    }

    public resumeByName(name: string): SessionData | null {
        for (const session of this._sessions.values()) {
            if (session.name.toLowerCase() === name.toLowerCase()) {
                return this.resumeSession(session.id);
            }
        }
        return null;
    }

    public addMessage(sessionId: string, message: SessionMessage): void {
        const session = this._sessions.get(sessionId);
        if (!session) {
            return;
        }

        const data = this._loadSessionData(sessionId);
        if (!data) {
            return;
        }

        data.messages.push(message);
        session.messageCount = data.messages.length;
        session.lastMessage = message.content.substring(0, 100);
        session.updatedAt = new Date().toISOString();

        this._saveSessionData(sessionId, data);
        this._saveSessions();
        this._onSessionsChanged.fire(this.getSessions());
    }

    public deleteSession(id: string): boolean {
        if (!this._sessions.has(id)) {
            return false;
        }

        this._sessions.delete(id);

        // Delete session data file
        const sessionPath = path.join(this._storagePath, `${id}.json`);
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
        }

        // Update current session if needed
        if (this._currentSessionId === id) {
            this._currentSessionId = null;
            this._onCurrentSessionChanged.fire(null);
        }

        this._saveSessions();
        this._onSessionsChanged.fire(this.getSessions());
        return true;
    }

    public archiveSession(id: string): boolean {
        const session = this._sessions.get(id);
        if (!session) {
            return false;
        }

        session.archived = true;
        session.updatedAt = new Date().toISOString();
        this._saveSessions();
        this._onSessionsChanged.fire(this.getSessions());
        return true;
    }

    public tagSession(id: string, tags: string[]): boolean {
        const session = this._sessions.get(id);
        if (!session) {
            return false;
        }

        session.tags = tags;
        session.updatedAt = new Date().toISOString();
        this._saveSessions();
        this._onSessionsChanged.fire(this.getSessions());
        return true;
    }

    public getSessions(includeArchived: boolean = false): Session[] {
        return Array.from(this._sessions.values())
            .filter(s => includeArchived || !s.archived)
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    public getCurrentSession(): Session | null {
        if (!this._currentSessionId) {
            return null;
        }
        return this._sessions.get(this._currentSessionId) || null;
    }

    public getCurrentSessionId(): string | null {
        return this._currentSessionId;
    }

    public getSessionData(id: string): SessionData | null {
        return this._loadSessionData(id);
    }

    public searchSessions(query: string): Session[] {
        const lowerQuery = query.toLowerCase();
        return this.getSessions(true).filter(s =>
            s.name.toLowerCase().includes(lowerQuery) ||
            s.lastMessage.toLowerCase().includes(lowerQuery) ||
            s.tags.some(t => t.toLowerCase().includes(lowerQuery))
        );
    }

    public getRecentSessions(limit: number = 10): Session[] {
        return this.getSessions().slice(0, limit);
    }

    public exportSession(id: string): string | null {
        const data = this._loadSessionData(id);
        if (!data) {
            return null;
        }
        return JSON.stringify(data, null, 2);
    }

    private _loadSessionData(id: string): SessionData | null {
        try {
            const sessionPath = path.join(this._storagePath, `${id}.json`);
            if (fs.existsSync(sessionPath)) {
                return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
            }
        } catch (error) {
            console.error('Failed to load session data:', error);
        }
        return null;
    }

    private _saveSessionData(id: string, data: SessionData): void {
        try {
            const sessionPath = path.join(this._storagePath, `${id}.json`);
            fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save session data:', error);
        }
    }

    private _generateId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    public dispose(): void {
        this._onSessionsChanged.dispose();
        this._onCurrentSessionChanged.dispose();
    }
}
