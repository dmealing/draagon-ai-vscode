import * as vscode from 'vscode';

export interface ThinkingStep {
    id: string;
    type: 'analysis' | 'planning' | 'reasoning' | 'reflection' | 'revision' | 'decision';
    title: string;
    content: string;
    timestamp: string;
    duration?: number;
    confidence?: number;
    children?: ThinkingStep[];
    collapsed?: boolean;
}

export interface ThinkingSession {
    id: string;
    prompt: string;
    startTime: string;
    endTime?: string;
    steps: ThinkingStep[];
    summary?: string;
    totalDuration?: number;
}

export class ThinkingDisplay {
    private _currentSession: ThinkingSession | null = null;
    private _sessions: ThinkingSession[] = [];
    private _onThinkingUpdated: vscode.EventEmitter<ThinkingSession | null> = new vscode.EventEmitter();

    public readonly onThinkingUpdated = this._onThinkingUpdated.event;

    constructor() {}

    public startSession(prompt: string): ThinkingSession {
        this._currentSession = {
            id: this._generateId(),
            prompt,
            startTime: new Date().toISOString(),
            steps: []
        };
        this._onThinkingUpdated.fire(this._currentSession);
        return this._currentSession;
    }

    public addStep(step: Omit<ThinkingStep, 'id' | 'timestamp'>): ThinkingStep | null {
        if (!this._currentSession) {
            return null;
        }

        const fullStep: ThinkingStep = {
            ...step,
            id: this._generateId(),
            timestamp: new Date().toISOString()
        };

        this._currentSession.steps.push(fullStep);
        this._onThinkingUpdated.fire(this._currentSession);
        return fullStep;
    }

    public updateStep(stepId: string, updates: Partial<ThinkingStep>): boolean {
        if (!this._currentSession) {
            return false;
        }

        const step = this._findStep(this._currentSession.steps, stepId);
        if (!step) {
            return false;
        }

        Object.assign(step, updates);
        this._onThinkingUpdated.fire(this._currentSession);
        return true;
    }

    public addChildStep(parentId: string, step: Omit<ThinkingStep, 'id' | 'timestamp'>): ThinkingStep | null {
        if (!this._currentSession) {
            return null;
        }

        const parent = this._findStep(this._currentSession.steps, parentId);
        if (!parent) {
            return null;
        }

        const fullStep: ThinkingStep = {
            ...step,
            id: this._generateId(),
            timestamp: new Date().toISOString()
        };

        if (!parent.children) {
            parent.children = [];
        }
        parent.children.push(fullStep);
        this._onThinkingUpdated.fire(this._currentSession);
        return fullStep;
    }

    public endSession(summary?: string): ThinkingSession | null {
        if (!this._currentSession) {
            return null;
        }

        this._currentSession.endTime = new Date().toISOString();
        this._currentSession.summary = summary;
        this._currentSession.totalDuration =
            new Date(this._currentSession.endTime).getTime() -
            new Date(this._currentSession.startTime).getTime();

        this._sessions.push(this._currentSession);
        const completed = this._currentSession;
        this._currentSession = null;
        this._onThinkingUpdated.fire(null);

        return completed;
    }

    public getCurrentSession(): ThinkingSession | null {
        return this._currentSession;
    }

    public getSessionHistory(): ThinkingSession[] {
        return [...this._sessions];
    }

    public toggleStepCollapse(stepId: string): boolean {
        if (!this._currentSession) {
            return false;
        }

        const step = this._findStep(this._currentSession.steps, stepId);
        if (!step) {
            return false;
        }

        step.collapsed = !step.collapsed;
        this._onThinkingUpdated.fire(this._currentSession);
        return true;
    }

    public renderToHtml(): string {
        if (!this._currentSession) {
            return '';
        }

        return `
            <div class="thinking-panel">
                <div class="thinking-header">
                    <span class="thinking-icon">🧠</span>
                    <span class="thinking-title">Chain of Thought</span>
                    <span class="thinking-status ${this._currentSession.endTime ? 'complete' : 'thinking'}">
                        ${this._currentSession.endTime ? 'Complete' : 'Thinking...'}
                    </span>
                </div>
                <div class="thinking-steps">
                    ${this._renderSteps(this._currentSession.steps)}
                </div>
                ${this._currentSession.summary ? `
                    <div class="thinking-summary">
                        <strong>Summary:</strong> ${this._escapeHtml(this._currentSession.summary)}
                    </div>
                ` : ''}
            </div>
        `;
    }

    private _renderSteps(steps: ThinkingStep[], depth: number = 0): string {
        return steps.map(step => `
            <div class="thinking-step depth-${depth} type-${step.type}" data-step-id="${step.id}">
                <div class="step-header" onclick="toggleThinkingStep('${step.id}')">
                    <span class="step-icon">${this._getStepIcon(step.type)}</span>
                    <span class="step-title">${this._escapeHtml(step.title)}</span>
                    ${step.confidence !== undefined ? `
                        <span class="step-confidence" style="--confidence: ${step.confidence}%">
                            ${step.confidence}%
                        </span>
                    ` : ''}
                    ${step.children?.length ? `
                        <span class="step-toggle">${step.collapsed ? '▶' : '▼'}</span>
                    ` : ''}
                </div>
                <div class="step-content ${step.collapsed ? 'collapsed' : ''}">
                    ${this._escapeHtml(step.content)}
                </div>
                ${step.children && !step.collapsed ? `
                    <div class="step-children">
                        ${this._renderSteps(step.children, depth + 1)}
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    private _getStepIcon(type: ThinkingStep['type']): string {
        const icons: Record<ThinkingStep['type'], string> = {
            'analysis': '🔍',
            'planning': '📋',
            'reasoning': '💭',
            'reflection': '🪞',
            'revision': '✏️',
            'decision': '✅'
        };
        return icons[type] || '•';
    }

    private _findStep(steps: ThinkingStep[], id: string): ThinkingStep | null {
        for (const step of steps) {
            if (step.id === id) {
                return step;
            }
            if (step.children) {
                const found = this._findStep(step.children, id);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private _generateId(): string {
        return `think_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    public dispose(): void {
        this._onThinkingUpdated.dispose();
    }
}

export function getThinkingStyles(): string {
    return `
        .thinking-panel {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            margin: 8px 0;
            overflow: hidden;
        }

        .thinking-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .thinking-icon {
            font-size: 16px;
        }

        .thinking-title {
            font-weight: 600;
            flex: 1;
        }

        .thinking-status {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 10px;
        }

        .thinking-status.thinking {
            background: var(--vscode-progressBar-background);
            color: white;
            animation: pulse 1.5s infinite;
        }

        .thinking-status.complete {
            background: var(--vscode-testing-iconPassed);
            color: white;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }

        .thinking-steps {
            padding: 8px;
        }

        .thinking-step {
            margin: 4px 0;
            border-left: 2px solid var(--vscode-panel-border);
            padding-left: 12px;
        }

        .thinking-step.depth-1 { margin-left: 16px; }
        .thinking-step.depth-2 { margin-left: 32px; }
        .thinking-step.depth-3 { margin-left: 48px; }

        .thinking-step.type-analysis { border-left-color: #4FC3F7; }
        .thinking-step.type-planning { border-left-color: #81C784; }
        .thinking-step.type-reasoning { border-left-color: #FFB74D; }
        .thinking-step.type-reflection { border-left-color: #BA68C8; }
        .thinking-step.type-revision { border-left-color: #FF8A65; }
        .thinking-step.type-decision { border-left-color: #4DB6AC; }

        .step-header {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            padding: 4px 0;
        }

        .step-header:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .step-icon {
            font-size: 14px;
        }

        .step-title {
            font-weight: 500;
            flex: 1;
        }

        .step-confidence {
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 8px;
            background: linear-gradient(90deg,
                var(--vscode-testing-iconPassed) var(--confidence),
                var(--vscode-panel-border) var(--confidence)
            );
            color: white;
        }

        .step-toggle {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }

        .step-content {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            padding: 4px 0;
            line-height: 1.4;
        }

        .step-content.collapsed {
            display: none;
        }

        .step-children {
            margin-top: 4px;
        }

        .thinking-summary {
            padding: 8px 12px;
            background: var(--vscode-textBlockQuote-background);
            border-top: 1px solid var(--vscode-panel-border);
            font-size: 12px;
        }
    `;
}
