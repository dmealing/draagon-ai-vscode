import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface UsageRecord {
    timestamp: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    cost: number;
    sessionId: string;
    duration: number; // ms
}

export interface DailyStats {
    date: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    requestCount: number;
    models: Record<string, number>;
}

export interface UsageStats {
    totalTokens: number;
    totalCost: number;
    totalRequests: number;
    favoriteModel: string;
    currentStreak: number;
    longestStreak: number;
    dailyStats: DailyStats[];
    modelUsage: Record<string, { requests: number; tokens: number; cost: number }>;
    hourlyDistribution: number[]; // 24 hours
    averageRequestsPerDay: number;
    todayTokens: number;
    todayCost: number;
    thisWeekTokens: number;
    thisWeekCost: number;
    thisMonthTokens: number;
    thisMonthCost: number;
}

// Cost per 1M tokens (approximate, varies by model)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
    'claude-3-opus': { input: 15.0, output: 75.0 },
    'claude-3-sonnet': { input: 3.0, output: 15.0 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
    'claude-3.5-sonnet': { input: 3.0, output: 15.0 },
    'claude-3.5-haiku': { input: 0.80, output: 4.0 },
    'claude-sonnet-4': { input: 3.0, output: 15.0 },
    'claude-opus-4': { input: 15.0, output: 75.0 },
    'llama-3.1-8b': { input: 0.05, output: 0.08 },
    'llama-3.1-70b': { input: 0.35, output: 0.40 },
    'default': { input: 3.0, output: 15.0 }
};

export class UsageTracker {
    private _records: UsageRecord[] = [];
    private _storagePath: string;
    private _onStatsUpdated: vscode.EventEmitter<UsageStats> = new vscode.EventEmitter();

    public readonly onStatsUpdated = this._onStatsUpdated.event;

    constructor(context: vscode.ExtensionContext) {
        this._storagePath = path.join(context.globalStorageUri.fsPath, 'usage-stats.json');
        this._ensureStorageDir(context.globalStorageUri.fsPath);
        this._loadRecords();
    }

    private _ensureStorageDir(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private _loadRecords(): void {
        try {
            if (fs.existsSync(this._storagePath)) {
                const data = fs.readFileSync(this._storagePath, 'utf-8');
                this._records = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load usage records:', error);
            this._records = [];
        }
    }

    private _saveRecords(): void {
        try {
            fs.writeFileSync(this._storagePath, JSON.stringify(this._records, null, 2));
        } catch (error) {
            console.error('Failed to save usage records:', error);
        }
    }

    public recordUsage(
        model: string,
        inputTokens: number,
        outputTokens: number,
        sessionId: string,
        duration: number,
        cacheReadTokens: number = 0,
        cacheWriteTokens: number = 0
    ): void {
        const costs = MODEL_COSTS[model] || MODEL_COSTS['default'];
        const cost = (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;

        const record: UsageRecord = {
            timestamp: new Date().toISOString(),
            model,
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens,
            cost,
            sessionId,
            duration
        };

        this._records.push(record);
        this._saveRecords();
        this._onStatsUpdated.fire(this.getStats());
    }

    public getStats(): UsageStats {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Aggregate by day
        const dailyMap = new Map<string, DailyStats>();
        const modelUsage: Record<string, { requests: number; tokens: number; cost: number }> = {};
        const hourlyDistribution = new Array(24).fill(0);

        let totalTokens = 0;
        let totalCost = 0;
        let todayTokens = 0;
        let todayCost = 0;
        let thisWeekTokens = 0;
        let thisWeekCost = 0;
        let thisMonthTokens = 0;
        let thisMonthCost = 0;

        for (const record of this._records) {
            const date = record.timestamp.split('T')[0];
            const recordDate = new Date(record.timestamp);
            const hour = recordDate.getHours();
            const tokens = record.inputTokens + record.outputTokens;

            // Total stats
            totalTokens += tokens;
            totalCost += record.cost;

            // Time-based stats
            if (date === today) {
                todayTokens += tokens;
                todayCost += record.cost;
            }
            if (recordDate >= weekAgo) {
                thisWeekTokens += tokens;
                thisWeekCost += record.cost;
            }
            if (recordDate >= monthAgo) {
                thisMonthTokens += tokens;
                thisMonthCost += record.cost;
            }

            // Hourly distribution
            hourlyDistribution[hour]++;

            // Daily aggregation
            if (!dailyMap.has(date)) {
                dailyMap.set(date, {
                    date,
                    totalInputTokens: 0,
                    totalOutputTokens: 0,
                    totalCost: 0,
                    requestCount: 0,
                    models: {}
                });
            }
            const daily = dailyMap.get(date)!;
            daily.totalInputTokens += record.inputTokens;
            daily.totalOutputTokens += record.outputTokens;
            daily.totalCost += record.cost;
            daily.requestCount++;
            daily.models[record.model] = (daily.models[record.model] || 0) + 1;

            // Model usage
            if (!modelUsage[record.model]) {
                modelUsage[record.model] = { requests: 0, tokens: 0, cost: 0 };
            }
            modelUsage[record.model].requests++;
            modelUsage[record.model].tokens += tokens;
            modelUsage[record.model].cost += record.cost;
        }

        // Calculate favorite model
        let favoriteModel = 'None';
        let maxRequests = 0;
        for (const [model, usage] of Object.entries(modelUsage)) {
            if (usage.requests > maxRequests) {
                maxRequests = usage.requests;
                favoriteModel = model;
            }
        }

        // Calculate streaks
        const sortedDates = Array.from(dailyMap.keys()).sort();
        let currentStreak = 0;
        let longestStreak = 0;
        let tempStreak = 0;

        for (let i = 0; i < sortedDates.length; i++) {
            if (i === 0) {
                tempStreak = 1;
            } else {
                const prevDate = new Date(sortedDates[i - 1]);
                const currDate = new Date(sortedDates[i]);
                const diffDays = Math.floor((currDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000));

                if (diffDays === 1) {
                    tempStreak++;
                } else {
                    tempStreak = 1;
                }
            }
            longestStreak = Math.max(longestStreak, tempStreak);

            // Check if current streak includes today
            if (sortedDates[i] === today) {
                currentStreak = tempStreak;
            }
        }

        // If yesterday is in the list but today isn't, current streak is 0
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        if (!dailyMap.has(today) && dailyMap.has(yesterday)) {
            currentStreak = 0;
        }

        const dailyStats = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));
        const averageRequestsPerDay = dailyStats.length > 0
            ? this._records.length / dailyStats.length
            : 0;

        return {
            totalTokens,
            totalCost,
            totalRequests: this._records.length,
            favoriteModel,
            currentStreak,
            longestStreak,
            dailyStats: dailyStats.slice(0, 30), // Last 30 days
            modelUsage,
            hourlyDistribution,
            averageRequestsPerDay,
            todayTokens,
            todayCost,
            thisWeekTokens,
            thisWeekCost,
            thisMonthTokens,
            thisMonthCost
        };
    }

    public getUsageGraph(days: number = 14): { labels: string[]; data: number[] } {
        const now = new Date();
        const labels: string[] = [];
        const data: number[] = [];

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = date.toISOString().split('T')[0];
            labels.push(date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));

            const dayTokens = this._records
                .filter(r => r.timestamp.startsWith(dateStr))
                .reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);
            data.push(dayTokens);
        }

        return { labels, data };
    }

    public exportStats(): string {
        return JSON.stringify({
            exportedAt: new Date().toISOString(),
            stats: this.getStats(),
            records: this._records
        }, null, 2);
    }

    public getStatsHtml(stats: UsageStats): string {
        const graph = this.getUsageGraph(14);
        const maxTokens = Math.max(...graph.data, 1);

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .stat-card { background: var(--vscode-input-background); padding: 16px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; color: var(--vscode-textLink-foreground); }
        .stat-label { font-size: 12px; opacity: 0.7; margin-top: 4px; }
        .chart { margin-top: 24px; }
        .bar-container { display: flex; align-items: end; height: 120px; gap: 4px; }
        .bar { flex: 1; background: var(--vscode-textLink-foreground); border-radius: 4px 4px 0 0; min-width: 20px; transition: height 0.3s; }
        .bar:hover { opacity: 0.8; }
        .bar-labels { display: flex; gap: 4px; margin-top: 8px; }
        .bar-label { flex: 1; text-align: center; font-size: 10px; opacity: 0.6; min-width: 20px; }
        h2 { margin-bottom: 16px; }
        .streak { color: #f59e0b; }
    </style>
</head>
<body>
    <h2>📊 Usage Statistics</h2>
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-value">${this._formatNumber(stats.totalTokens)}</div>
            <div class="stat-label">Total Tokens</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">$${stats.totalCost.toFixed(2)}</div>
            <div class="stat-label">Total Cost</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.totalRequests}</div>
            <div class="stat-label">Total Requests</div>
        </div>
        <div class="stat-card">
            <div class="stat-value streak">🔥 ${stats.currentStreak}</div>
            <div class="stat-label">Day Streak</div>
        </div>
    </div>

    <h2>📈 Token Usage (Last 14 Days)</h2>
    <div class="chart">
        <div class="bar-container">
            ${graph.data.map(d => `<div class="bar" style="height: ${(d / maxTokens) * 100}%" title="${this._formatNumber(d)} tokens"></div>`).join('')}
        </div>
        <div class="bar-labels">
            ${graph.labels.map(l => `<div class="bar-label">${l.split(' ')[0]}</div>`).join('')}
        </div>
    </div>

    <h2>🤖 Model Usage</h2>
    <div class="stats-grid">
        ${Object.entries(stats.modelUsage).map(([model, usage]) => `
            <div class="stat-card">
                <div class="stat-value">${usage.requests}</div>
                <div class="stat-label">${model}</div>
            </div>
        `).join('')}
    </div>
</body>
</html>`;
    }

    private _formatNumber(num: number): string {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    public clearStats(): void {
        this._records = [];
        this._saveRecords();
        this._onStatsUpdated.fire(this.getStats());
    }

    public dispose(): void {
        this._onStatsUpdated.dispose();
    }
}
