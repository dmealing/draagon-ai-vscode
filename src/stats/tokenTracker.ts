import * as vscode from 'vscode';

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
}

export interface SessionStats {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheWriteTokens: number;
    totalCost: number;
    requestCount: number;
    startTime: Date;
}

// Pricing per 1M tokens (as of 2024)
const PRICING: Record<string, { input: number; output: number }> = {
    'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
    'claude-3-opus': { input: 15.0, output: 75.0 },
    'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
    'claude-3-sonnet': { input: 3.0, output: 15.0 },
    'claude-3.5-sonnet': { input: 3.0, output: 15.0 },
    'claude-3.5-sonnet-20241022': { input: 3.0, output: 15.0 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
    'claude-3.5-haiku': { input: 0.8, output: 4.0 },
    'claude-opus-4': { input: 15.0, output: 75.0 },
    'claude-sonnet-4': { input: 3.0, output: 15.0 },
    // Groq models
    'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
    'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
    'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
    // Default fallback
    'default': { input: 3.0, output: 15.0 }
};

export class TokenTracker {
    private sessionStats: SessionStats;
    private currentModel: string = 'claude-3.5-sonnet';
    private _onTokenUpdate = new vscode.EventEmitter<TokenUsage>();
    private _onStatsUpdate = new vscode.EventEmitter<SessionStats>();

    public readonly onTokenUpdate = this._onTokenUpdate.event;
    public readonly onStatsUpdate = this._onStatsUpdate.event;

    constructor() {
        this.sessionStats = this.createEmptyStats();
    }

    private createEmptyStats(): SessionStats {
        return {
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCacheReadTokens: 0,
            totalCacheWriteTokens: 0,
            totalCost: 0,
            requestCount: 0,
            startTime: new Date()
        };
    }

    public setModel(model: string): void {
        this.currentModel = model;
    }

    public getModel(): string {
        return this.currentModel;
    }

    /**
     * Record token usage from a streaming response
     */
    public recordTokens(usage: Partial<TokenUsage>): void {
        const tokens: TokenUsage = {
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
            cacheReadTokens: usage.cacheReadTokens || 0,
            cacheWriteTokens: usage.cacheWriteTokens || 0
        };

        this.sessionStats.totalInputTokens += tokens.inputTokens;
        this.sessionStats.totalOutputTokens += tokens.outputTokens;
        this.sessionStats.totalCacheReadTokens += tokens.cacheReadTokens;
        this.sessionStats.totalCacheWriteTokens += tokens.cacheWriteTokens;

        // Calculate cost
        const cost = this.calculateCost(tokens.inputTokens, tokens.outputTokens, this.currentModel);
        this.sessionStats.totalCost += cost;

        this._onTokenUpdate.fire(tokens);
        this._onStatsUpdate.fire(this.sessionStats);
    }

    /**
     * Record a completed request
     */
    public recordRequest(cost?: number): void {
        this.sessionStats.requestCount++;
        if (cost !== undefined) {
            this.sessionStats.totalCost = cost;
        }
        this._onStatsUpdate.fire(this.sessionStats);
    }

    /**
     * Calculate cost for given tokens
     */
    public calculateCost(inputTokens: number, outputTokens: number, model?: string): number {
        const pricing = PRICING[model || this.currentModel] || PRICING['default'];
        const inputCost = (inputTokens / 1_000_000) * pricing.input;
        const outputCost = (outputTokens / 1_000_000) * pricing.output;
        return inputCost + outputCost;
    }

    /**
     * Get current session stats
     */
    public getSessionStats(): SessionStats {
        return { ...this.sessionStats };
    }

    /**
     * Reset session stats (for new session)
     */
    public resetSession(): void {
        this.sessionStats = this.createEmptyStats();
        this._onStatsUpdate.fire(this.sessionStats);
    }

    /**
     * Reset token counts (for compaction)
     */
    public resetTokenCounts(): void {
        this.sessionStats.totalInputTokens = 0;
        this.sessionStats.totalOutputTokens = 0;
        this.sessionStats.totalCacheReadTokens = 0;
        this.sessionStats.totalCacheWriteTokens = 0;
        this._onStatsUpdate.fire(this.sessionStats);
    }

    /**
     * Format cost as currency
     */
    public static formatCost(cost: number): string {
        if (cost < 0.0001) {
            return '$0.0000';
        } else if (cost < 0.01) {
            return `$${cost.toFixed(4)}`;
        } else if (cost < 1) {
            return `$${cost.toFixed(3)}`;
        } else {
            return `$${cost.toFixed(2)}`;
        }
    }

    /**
     * Format token count with commas
     */
    public static formatTokens(tokens: number): string {
        return tokens.toLocaleString();
    }

    /**
     * Get cache savings estimate
     */
    public getCacheSavings(): { tokens: number; cost: number } {
        const pricing = PRICING[this.currentModel] || PRICING['default'];
        // Cache reads are ~90% cheaper than regular input
        const savedTokens = this.sessionStats.totalCacheReadTokens;
        const savedCost = (savedTokens / 1_000_000) * pricing.input * 0.9;
        return { tokens: savedTokens, cost: savedCost };
    }

    /**
     * Generate HTML for token display
     */
    public getTokenDisplayHtml(): string {
        const stats = this.sessionStats;
        const cacheInfo = stats.totalCacheReadTokens > 0
            ? ` <span class="cache-info" title="Cache: ${TokenTracker.formatTokens(stats.totalCacheReadTokens)} read">💾</span>`
            : '';

        return `
<div class="token-display">
    <span class="input-tokens" title="Input tokens">↑ ${TokenTracker.formatTokens(stats.totalInputTokens)}</span>
    <span class="output-tokens" title="Output tokens">↓ ${TokenTracker.formatTokens(stats.totalOutputTokens)}</span>
    <span class="total-cost" title="Estimated cost">${TokenTracker.formatCost(stats.totalCost)}</span>
    ${cacheInfo}
</div>`;
    }

    public dispose(): void {
        this._onTokenUpdate.dispose();
        this._onStatsUpdate.dispose();
    }
}
