import * as vscode from 'vscode';
import { RoutingTier, RoutingDecision } from '../claude/types';

// Patterns that can be handled by fast-path (Groq)
const DEFAULT_FAST_PATH_PATTERNS = [
    // Simple questions
    /^(what|how|why|when|where|who|which|can you|could you|please)\s+(is|are|do|does|explain|describe|tell|show|list)/i,
    // Code explanations (not modifications)
    /^explain\s+(this|the|what)/i,
    /^what\s+does\s+this\s+(code|function|method|class)/i,
    // Documentation requests
    /^(document|add\s+comments|write\s+docs)/i,
    // Simple formatting
    /^(format|lint|prettify)/i,
    // Git status/info (not actions)
    /^(git\s+status|show\s+diff|what.*changed)/i,
];

// Patterns that require standard Claude
const STANDARD_PATH_PATTERNS = [
    // Code modifications
    /^(fix|change|modify|update|refactor|add|remove|delete|implement|create|write)/i,
    // File operations
    /^(edit|create|write|save)\s+(file|to)/i,
    // Complex reasoning
    /^(analyze|review|audit|investigate|debug)/i,
    // Multi-step tasks
    /(and\s+then|after\s+that|next|also|additionally)/i,
];

// Patterns that require deep Draagon processing
const DEEP_PATH_PATTERNS = [
    // Memory operations
    /^(remember|recall|what\s+did\s+(i|we)|based\s+on\s+our)/i,
    // Persona/personality
    /^(act\s+as|you\s+are|pretend|roleplay)/i,
    // Learning/adaptation
    /^(learn|adapt|improve|get\s+better)/i,
    // Belief updates
    /^(update\s+your|change\s+your|modify\s+your)\s+(beliefs?|understanding)/i,
];

export interface RouteResult {
    provider: 'groq' | 'claude' | 'draagon';
    content?: string;
    decision: RoutingDecision;
}

export class RequestRouter {
    private _fastPathPatterns: RegExp[];
    private _groqApiKey?: string;

    constructor(config: vscode.WorkspaceConfiguration) {
        // Load custom patterns or use defaults
        const customPatterns = config.get<string[]>('routing.fastPathPatterns', []);
        this._fastPathPatterns = customPatterns.length > 0
            ? customPatterns.map(p => new RegExp(p, 'i'))
            : DEFAULT_FAST_PATH_PATTERNS;

        this._groqApiKey = config.get<string>('routing.groqApiKey');
    }

    public async route(prompt: string, _options?: { memoryContext?: string }): Promise<RouteResult> {
        const decision = this._getRoutingDecision(prompt);

        // If routed to fast path, execute with Groq
        if (decision.tier === 'fast' && this._groqApiKey) {
            const content = await this.executeGroq(prompt);
            return { provider: 'groq', content, decision };
        }

        // TODO: Add Draagon deep processing
        if (decision.tier === 'deep') {
            // For now, fall back to Claude
            return { provider: 'claude', decision };
        }

        return { provider: 'claude', decision };
    }

    private _getRoutingDecision(prompt: string): RoutingDecision {
        // Check deep path first (Draagon cognitive features)
        for (const pattern of DEEP_PATH_PATTERNS) {
            if (pattern.test(prompt)) {
                return {
                    tier: 'deep',
                    provider: 'draagon',
                    model: 'draagon-cognitive',
                    reason: 'Cognitive/memory operation detected'
                };
            }
        }

        // Check standard path (Claude required)
        for (const pattern of STANDARD_PATH_PATTERNS) {
            if (pattern.test(prompt)) {
                return {
                    tier: 'standard',
                    provider: 'claude',
                    model: 'claude-sonnet',
                    reason: 'Code modification or complex task detected'
                };
            }
        }

        // Check fast path (Groq eligible)
        if (this._groqApiKey) {
            for (const pattern of this._fastPathPatterns) {
                if (pattern.test(prompt)) {
                    return {
                        tier: 'fast',
                        provider: 'groq',
                        model: 'llama-3.3-70b-versatile',
                        reason: 'Simple query eligible for fast-path'
                    };
                }
            }
        }

        // Default to standard Claude
        return {
            tier: 'standard',
            provider: 'claude',
            model: 'claude-sonnet',
            reason: 'Default routing to Claude'
        };
    }

    public async executeGroq(prompt: string, systemPrompt?: string): Promise<string> {
        if (!this._groqApiKey) {
            throw new Error('Groq API key not configured');
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this._groqApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 4096
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Groq API error: ${error}`);
        }

        const data = await response.json() as {
            choices: Array<{ message: { content: string } }>;
        };

        return data.choices[0]?.message?.content || '';
    }

    public isGroqConfigured(): boolean {
        return !!this._groqApiKey;
    }

    public getRoutingStats(): { fast: number; standard: number; deep: number } {
        // TODO: Implement actual stats tracking
        return { fast: 0, standard: 0, deep: 0 };
    }
}

export class RoutingIndicator {
    private _statusBarItem: vscode.StatusBarItem;

    constructor() {
        this._statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this._statusBarItem.show();
        this.update('idle');
    }

    public update(tier: RoutingTier | 'idle'): void {
        switch (tier) {
            case 'fast':
                this._statusBarItem.text = '$(zap) Groq';
                this._statusBarItem.tooltip = 'Fast-path: Using Groq LLM';
                this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case 'standard':
                this._statusBarItem.text = '$(hubot) Claude';
                this._statusBarItem.tooltip = 'Standard: Using Claude';
                this._statusBarItem.backgroundColor = undefined;
                break;
            case 'deep':
                this._statusBarItem.text = '$(brain) Draagon';
                this._statusBarItem.tooltip = 'Deep: Using Draagon Cognitive';
                this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
                break;
            case 'idle':
                this._statusBarItem.text = '$(circle-outline) Ready';
                this._statusBarItem.tooltip = 'Draagon AI ready';
                this._statusBarItem.backgroundColor = undefined;
                break;
        }
    }

    public dispose(): void {
        this._statusBarItem.dispose();
    }
}
