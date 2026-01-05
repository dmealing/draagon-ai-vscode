# REQ-015: Routing Statistics Tracking

**Status:** PLANNED
**Priority:** High
**Version:** 0.2.3
**Created:** 2026-01-05

## Overview

Implement actual routing statistics tracking to measure and display how requests are being routed between fast (Groq), standard (Claude), and deep (Draagon) tiers.

## Problem Statement

### Current State

The `getRoutingStats()` method in `src/routing/router.ts` returns hardcoded zeros:

```typescript
public getRoutingStats(): RoutingStats {
    // TODO: Implement actual stats tracking
    return { fast: 0, standard: 0, deep: 0 };
}
```

### Impact

| Issue | Impact |
|-------|--------|
| No visibility into routing effectiveness | Can't optimize routing patterns |
| Can't measure Groq cost savings | No ROI tracking |
| Can't identify routing issues | Problems go undetected |
| No data for user dashboard | Stats view is useless |

---

## Requirements

### FR-001: Request Counting

Track the number of requests routed to each tier.

**Implementation:**

```typescript
export interface RoutingStats {
    fast: number;      // Groq requests
    standard: number;  // Claude requests
    deep: number;      // Draagon requests
    fallbacks: number; // Groq -> Claude fallbacks
    totalRequests: number;
    sessionStart: Date;
}

export class Router {
    private stats: RoutingStats = {
        fast: 0,
        standard: 0,
        deep: 0,
        fallbacks: 0,
        totalRequests: 0,
        sessionStart: new Date()
    };

    private recordRouting(tier: RoutingTier, fallback: boolean = false): void {
        this.stats.totalRequests++;
        this.stats[tier]++;
        if (fallback) {
            this.stats.fallbacks++;
        }
        this._onStatsUpdate.fire(this.stats);
    }
}
```

**Acceptance Criteria:**
- [ ] Each routing decision is counted
- [ ] Fallbacks tracked separately
- [ ] Session start time recorded

---

### FR-002: Stats Persistence

Persist stats across VS Code sessions.

**Implementation:**

```typescript
export class Router {
    constructor(
        private context: vscode.ExtensionContext,
        config: RouterConfig
    ) {
        this.loadStats();
    }

    private loadStats(): void {
        const saved = this.context.globalState.get<RoutingStats>('routingStats');
        if (saved) {
            this.stats = {
                ...saved,
                sessionStart: new Date() // New session
            };
        }
    }

    private saveStats(): void {
        this.context.globalState.update('routingStats', this.stats);
    }

    public resetStats(): void {
        this.stats = {
            fast: 0,
            standard: 0,
            deep: 0,
            fallbacks: 0,
            totalRequests: 0,
            sessionStart: new Date()
        };
        this.saveStats();
        this._onStatsUpdate.fire(this.stats);
    }
}
```

**Acceptance Criteria:**
- [ ] Stats survive VS Code restart
- [ ] Reset option available
- [ ] Session vs lifetime stats distinguished

---

### FR-003: Stats Event Emitter

Emit events when stats change for UI updates.

**Implementation:**

```typescript
private _onStatsUpdate = new vscode.EventEmitter<RoutingStats>();
public readonly onStatsUpdate = this._onStatsUpdate.event;

// After recording
this._onStatsUpdate.fire(this.stats);
```

**Acceptance Criteria:**
- [ ] Events fired on each routing
- [ ] UI can subscribe to updates
- [ ] No event spam (debounce if needed)

---

### FR-004: Detailed Metrics

Track additional useful metrics.

**Implementation:**

```typescript
export interface DetailedRoutingStats extends RoutingStats {
    // Response times by tier
    avgResponseTime: {
        fast: number;
        standard: number;
        deep: number;
    };

    // Pattern matching stats
    patternMatches: Record<string, number>;

    // Error rates
    errors: {
        fast: number;
        standard: number;
        deep: number;
    };

    // Cost estimates (rough)
    estimatedCostSavings: number;
}

private recordRouting(
    tier: RoutingTier,
    responseTimeMs: number,
    pattern?: string,
    error?: boolean
): void {
    this.stats.totalRequests++;
    this.stats[tier]++;

    // Track response time
    this.responseTimes[tier].push(responseTimeMs);
    this.stats.avgResponseTime[tier] = this.calculateAvg(this.responseTimes[tier]);

    // Track pattern
    if (pattern) {
        this.stats.patternMatches[pattern] = (this.stats.patternMatches[pattern] || 0) + 1;
    }

    // Track errors
    if (error) {
        this.stats.errors[tier]++;
    }

    // Estimate savings (Groq is ~10x cheaper than Claude)
    if (tier === 'fast') {
        this.stats.estimatedCostSavings += 0.001; // Rough estimate
    }

    this._onStatsUpdate.fire(this.stats);
}
```

**Acceptance Criteria:**
- [ ] Response times tracked per tier
- [ ] Pattern match frequency recorded
- [ ] Error rates by tier
- [ ] Cost savings estimated

---

### FR-005: Stats Display in UI

Show routing stats in the extension UI.

**Implementation:**

```typescript
// In stats view or chat footer
function renderStats(stats: RoutingStats): string {
    const total = stats.fast + stats.standard + stats.deep;
    const fastPct = total > 0 ? Math.round((stats.fast / total) * 100) : 0;
    const standardPct = total > 0 ? Math.round((stats.standard / total) * 100) : 0;
    const deepPct = total > 0 ? Math.round((stats.deep / total) * 100) : 0;

    return `
        <div class="routing-stats">
            <div class="stat-row">
                <span class="stat-label">⚡ Fast (Groq)</span>
                <span class="stat-value">${stats.fast} (${fastPct}%)</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">🔵 Standard (Claude)</span>
                <span class="stat-value">${stats.standard} (${standardPct}%)</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">🟣 Deep (Draagon)</span>
                <span class="stat-value">${stats.deep} (${deepPct}%)</span>
            </div>
            <div class="stat-row fallback">
                <span class="stat-label">↩️ Fallbacks</span>
                <span class="stat-value">${stats.fallbacks}</span>
            </div>
        </div>
    `;
}
```

**CSS:**

```css
.routing-stats {
    padding: 12px;
    background: var(--vscode-sideBar-background);
    border-radius: 6px;
}

.stat-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
}

.stat-label {
    color: var(--vscode-descriptionForeground);
}

.stat-value {
    font-weight: 500;
}

.stat-row.fallback {
    border-top: 1px solid var(--vscode-panel-border);
    margin-top: 8px;
    padding-top: 8px;
}
```

**Acceptance Criteria:**
- [ ] Stats visible in dedicated view
- [ ] Real-time updates
- [ ] Clear visualization

---

## Implementation Plan

### Phase 1: Core Stats (30 min)
1. Add stats interface and tracking
2. Record on each routing decision
3. Implement `getRoutingStats()`

### Phase 2: Persistence (30 min)
1. Save stats to global state
2. Load on startup
3. Add reset functionality

### Phase 3: Event System (15 min)
1. Add EventEmitter
2. Fire on stats update
3. Wire up listeners

### Phase 4: UI Display (45 min)
1. Update stats view provider
2. Add real-time updates
3. Style the display

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/routing/router.ts` | Stats tracking, persistence, events |
| `src/providers/statsViewProvider.ts` | Display stats |
| `src/extension.ts` | Pass context to Router |

---

## Testing

```typescript
describe('Routing Statistics', () => {
    it('should track routing decisions', async () => {
        const router = new Router(context, config);

        await router.route('simple query');
        await router.route('complex analysis needed');

        const stats = router.getRoutingStats();
        expect(stats.totalRequests).toBe(2);
    });

    it('should persist stats across sessions', async () => {
        const router1 = new Router(context, config);
        await router1.route('query');

        // Simulate restart
        const router2 = new Router(context, config);
        const stats = router2.getRoutingStats();

        expect(stats.fast + stats.standard + stats.deep).toBeGreaterThan(0);
    });

    it('should track fallbacks', async () => {
        // Mock Groq failure
        const router = new Router(context, config);
        await router.route('simple query');

        const stats = router.getRoutingStats();
        expect(stats.fallbacks).toBe(1);
    });

    it('should emit events on stats update', async () => {
        const router = new Router(context, config);
        const updates: RoutingStats[] = [];

        router.onStatsUpdate(stats => updates.push(stats));

        await router.route('query');

        expect(updates.length).toBe(1);
    });
});
```

---

## Acceptance Criteria

- [ ] Routing decisions are accurately counted
- [ ] Stats persist across VS Code sessions
- [ ] Stats visible in extension UI
- [ ] Real-time updates via events
- [ ] Fallbacks tracked separately
- [ ] Reset functionality works
- [ ] All existing tests pass
