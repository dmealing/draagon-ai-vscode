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
    // Personalization queries
    /based\s+on\s+(what\s+you\s+know|my\s+preferences|my\s+style)/i,
    /my\s+(coding\s+style|preferences|usual)/i,
];

// REQ-013: Error types for routing
export class RoutingError extends Error {
    constructor(
        message: string,
        public readonly type: 'timeout' | 'rate_limit' | 'network' | 'auth' | 'unknown',
        public readonly provider: string,
        public readonly retryable: boolean = false
    ) {
        super(message);
        this.name = 'RoutingError';
    }
}

// REQ-015: Routing statistics interface
export interface RoutingStats {
    fast: number;
    standard: number;
    deep: number;
    fallbacks: number;
    errors: number;
    totalRequests: number;
    sessionStart: string;
}

export interface RouteResult {
    provider: 'groq' | 'claude' | 'draagon';
    content?: string;
    decision: RoutingDecision;
    fallback?: boolean;
    contextInjection?: string;
}

// REQ-013: Retry configuration
interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    timeoutMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    timeoutMs: 30000
};

export class RequestRouter {
    private _fastPathPatterns: RegExp[];
    private _groqApiKey?: string;
    private _draagonEndpoint?: string;
    private _draagonConnected: boolean = false;

    // REQ-015: Statistics tracking
    private _stats: RoutingStats;
    private _onStatsUpdate = new vscode.EventEmitter<RoutingStats>();
    public readonly onStatsUpdate = this._onStatsUpdate.event;

    // REQ-013: Error events
    private _onRoutingError = new vscode.EventEmitter<RoutingError>();
    public readonly onRoutingError = this._onRoutingError.event;

    constructor(
        private _context: vscode.ExtensionContext,
        config: vscode.WorkspaceConfiguration
    ) {
        // Load custom patterns or use defaults
        const customPatterns = config.get<string[]>('routing.fastPathPatterns', []);
        this._fastPathPatterns = customPatterns.length > 0
            ? customPatterns.map(p => new RegExp(p, 'i'))
            : DEFAULT_FAST_PATH_PATTERNS;

        this._groqApiKey = config.get<string>('routing.groqApiKey');
        this._draagonEndpoint = config.get<string>('draagon.endpoint', 'http://localhost:8000');

        // REQ-015: Load persisted stats
        this._stats = this._loadStats();

        // REQ-016: Check Draagon connection on startup
        this._checkDraagonConnection();
    }

    // REQ-015: Load stats from storage
    private _loadStats(): RoutingStats {
        const saved = this._context.globalState.get<RoutingStats>('routingStats');
        if (saved) {
            return {
                ...saved,
                sessionStart: new Date().toISOString()
            };
        }
        return {
            fast: 0,
            standard: 0,
            deep: 0,
            fallbacks: 0,
            errors: 0,
            totalRequests: 0,
            sessionStart: new Date().toISOString()
        };
    }

    // REQ-015: Save stats to storage
    private _saveStats(): void {
        this._context.globalState.update('routingStats', this._stats);
    }

    // REQ-015: Record a routing decision
    private _recordRouting(tier: RoutingTier, fallback: boolean = false, error: boolean = false): void {
        this._stats.totalRequests++;
        this._stats[tier]++;
        if (fallback) {
            this._stats.fallbacks++;
        }
        if (error) {
            this._stats.errors++;
        }
        this._saveStats();
        this._onStatsUpdate.fire(this._stats);
    }

    // REQ-015: Get current stats
    public getRoutingStats(): RoutingStats {
        return { ...this._stats };
    }

    // REQ-015: Reset stats
    public resetStats(): void {
        this._stats = {
            fast: 0,
            standard: 0,
            deep: 0,
            fallbacks: 0,
            errors: 0,
            totalRequests: 0,
            sessionStart: new Date().toISOString()
        };
        this._saveStats();
        this._onStatsUpdate.fire(this._stats);
    }

    // REQ-016: Check Draagon service connection
    private async _checkDraagonConnection(): Promise<void> {
        if (!this._draagonEndpoint) {
            this._draagonConnected = false;
            return;
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${this._draagonEndpoint}/health`, {
                signal: controller.signal
            });

            clearTimeout(timeout);
            this._draagonConnected = response.ok;
        } catch {
            this._draagonConnected = false;
        }
    }

    // REQ-016: Check if Draagon is available
    public isDraagonConnected(): boolean {
        return this._draagonConnected;
    }

    public async route(prompt: string, options?: { memoryContext?: string }): Promise<RouteResult> {
        const decision = this._getRoutingDecision(prompt);

        // REQ-013: Fast path with error handling and fallback
        if (decision.tier === 'fast' && this._groqApiKey) {
            try {
                const content = await this._executeGroqWithRetry(prompt);
                this._recordRouting('fast');
                return { provider: 'groq', content, decision };
            } catch (error) {
                console.warn('Groq failed, falling back to Claude:', error);
                this._recordRouting('standard', true, true);

                const routingError = error instanceof RoutingError ? error : new RoutingError(
                    error instanceof Error ? error.message : 'Unknown error',
                    'unknown',
                    'groq'
                );
                this._onRoutingError.fire(routingError);

                return { provider: 'claude', decision, fallback: true };
            }
        }

        // REQ-016: Deep path with Draagon
        if (decision.tier === 'deep') {
            if (this._draagonConnected) {
                try {
                    const content = await this._executeDraagon(prompt, options?.memoryContext);
                    this._recordRouting('deep');
                    return { provider: 'draagon', content, decision };
                } catch (error) {
                    console.warn('Draagon failed, falling back to Claude:', error);
                    this._recordRouting('standard', true, true);

                    const routingError = error instanceof RoutingError ? error : new RoutingError(
                        error instanceof Error ? error.message : 'Unknown error',
                        'unknown',
                        'draagon'
                    );
                    this._onRoutingError.fire(routingError);
                }
            }

            // Fall back to Claude with context injection if available
            this._recordRouting('standard', !this._draagonConnected);
            return {
                provider: 'claude',
                decision,
                fallback: true,
                contextInjection: options?.memoryContext
            };
        }

        this._recordRouting('standard');
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

    // REQ-013: Execute Groq with retry and timeout
    private async _executeGroqWithRetry(
        prompt: string,
        systemPrompt?: string,
        config: RetryConfig = DEFAULT_RETRY_CONFIG
    ): Promise<string> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
            try {
                return await this._executeGroqWithTimeout(prompt, systemPrompt, config.timeoutMs);
            } catch (error) {
                lastError = error as Error;

                // REQ-013: Don't retry on auth errors or rate limits (fall back immediately)
                if (error instanceof RoutingError) {
                    if (error.type === 'auth' || error.type === 'rate_limit') {
                        throw error;
                    }
                }

                // Wait before retry with exponential backoff
                if (attempt < config.maxRetries) {
                    const delay = Math.min(
                        config.baseDelayMs * Math.pow(2, attempt),
                        config.maxDelayMs
                    );
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        throw lastError || new RoutingError('Max retries exceeded', 'unknown', 'groq');
    }

    // REQ-013: Execute Groq with timeout
    private async _executeGroqWithTimeout(
        prompt: string,
        systemPrompt?: string,
        timeoutMs: number = DEFAULT_RETRY_CONFIG.timeoutMs
    ): Promise<string> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
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
                }),
                signal: controller.signal
            });

            clearTimeout(timeout);

            // REQ-013: Handle specific error codes
            if (!response.ok) {
                const errorText = await response.text();

                if (response.status === 401 || response.status === 403) {
                    throw new RoutingError(
                        `Authentication failed: ${errorText}`,
                        'auth',
                        'groq',
                        false
                    );
                }

                if (response.status === 429) {
                    const retryAfter = response.headers.get('retry-after');
                    throw new RoutingError(
                        `Rate limited${retryAfter ? `, retry after ${retryAfter}s` : ''}`,
                        'rate_limit',
                        'groq',
                        false
                    );
                }

                if (response.status >= 500) {
                    throw new RoutingError(
                        `Server error: ${errorText}`,
                        'network',
                        'groq',
                        true
                    );
                }

                throw new RoutingError(`API error: ${errorText}`, 'unknown', 'groq', true);
            }

            const data = await response.json() as {
                choices: Array<{ message: { content: string } }>;
            };

            return data.choices[0]?.message?.content || '';
        } catch (error) {
            clearTimeout(timeout);

            if (error instanceof RoutingError) {
                throw error;
            }

            if (error instanceof Error && error.name === 'AbortError') {
                throw new RoutingError('Request timeout', 'timeout', 'groq', true);
            }

            throw new RoutingError(
                error instanceof Error ? error.message : 'Unknown error',
                'network',
                'groq',
                true
            );
        }
    }

    // REQ-016: Execute Draagon cognitive processing
    private async _executeDraagon(prompt: string, memoryContext?: string): Promise<string> {
        if (!this._draagonEndpoint) {
            throw new RoutingError('Draagon endpoint not configured', 'unknown', 'draagon');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // Longer timeout for cognitive processing

        try {
            const response = await fetch(`${this._draagonEndpoint}/cognitive/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: prompt,
                    context: {
                        memoryContext
                    },
                    options: {
                        searchDepth: 'deep',
                        includeReasoning: true
                    }
                }),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorText = await response.text();
                throw new RoutingError(`Draagon error: ${errorText}`, 'unknown', 'draagon', true);
            }

            const data = await response.json() as {
                response: string;
                reasoning?: string;
                confidence?: number;
            };

            return data.response;
        } catch (error) {
            clearTimeout(timeout);

            if (error instanceof RoutingError) {
                throw error;
            }

            if (error instanceof Error && error.name === 'AbortError') {
                throw new RoutingError('Request timeout', 'timeout', 'draagon', true);
            }

            throw new RoutingError(
                error instanceof Error ? error.message : 'Unknown error',
                'network',
                'draagon',
                true
            );
        }
    }

    // Public method for direct Groq execution (used by other components)
    public async executeGroq(prompt: string, systemPrompt?: string): Promise<string> {
        if (!this._groqApiKey) {
            throw new RoutingError('Groq API key not configured', 'auth', 'groq');
        }
        return this._executeGroqWithRetry(prompt, systemPrompt);
    }

    public isGroqConfigured(): boolean {
        return !!this._groqApiKey;
    }

    public dispose(): void {
        this._onStatsUpdate.dispose();
        this._onRoutingError.dispose();
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

    public update(tier: RoutingTier | 'idle', fallback: boolean = false): void {
        const fallbackSuffix = fallback ? ' (fallback)' : '';

        switch (tier) {
            case 'fast':
                this._statusBarItem.text = '$(zap) Groq';
                this._statusBarItem.tooltip = 'Fast-path: Using Groq LLM' + fallbackSuffix;
                this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case 'standard':
                this._statusBarItem.text = '$(hubot) Claude';
                this._statusBarItem.tooltip = 'Standard: Using Claude' + fallbackSuffix;
                this._statusBarItem.backgroundColor = fallback
                    ? new vscode.ThemeColor('statusBarItem.errorBackground')
                    : undefined;
                break;
            case 'deep':
                this._statusBarItem.text = '$(brain) Draagon';
                this._statusBarItem.tooltip = 'Deep: Using Draagon Cognitive' + fallbackSuffix;
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
