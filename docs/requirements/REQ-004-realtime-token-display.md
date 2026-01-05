# REQ-004: Real-time Token Display

**Status:** COMPLETED
**Version:** 0.2.0
**Completed:** 2026-01-04

## Overview
Display live token usage and cost information during Claude interactions, updating in real-time as responses stream.

## Priority
**MEDIUM** - Important for cost awareness

## User Stories

### US-001: Live Token Counter
As a user, I want to see token counts update in real-time as Claude responds, so I can monitor usage.

### US-002: Cost Tracking
As a user, I want to see estimated costs for the current session, so I can manage my API budget.

### US-003: Cache Token Display
As a user, I want to see cache read/write tokens, so I understand caching efficiency.

## Functional Requirements

### FR-001: Token Counter UI
- Display in chat header or status area
- Show: Input tokens, Output tokens, Total tokens
- Update during streaming (not just at end)
- Animate counter changes

### FR-002: Cost Calculation
- Calculate cost based on model pricing
- Support different pricing tiers (Opus, Sonnet, Haiku)
- Show cumulative session cost
- Format as currency ($X.XXXX)

### FR-003: Cache Metrics
- Display cache creation tokens
- Display cache read tokens
- Show cache hit ratio
- Highlight cache savings

### FR-004: Usage Summary
- Per-message token breakdown
- Session totals
- Daily/weekly aggregation (link to stats)

### FR-005: Real-time Updates
- Parse `usage` field from streaming JSON
- Update UI immediately on each chunk
- Smooth animation for counter increments

## Technical Design

### Token Display Component
```html
<div class="token-display">
  <span class="input-tokens">↑ 1,234</span>
  <span class="output-tokens">↓ 567</span>
  <span class="total-cost">$0.0234</span>
  <span class="cache-info" title="Cache: 890 read">💾</span>
</div>
```

### Message Handling
```typescript
// Parse from Claude streaming response
if (jsonData.message?.usage) {
  this.updateTokens({
    input: jsonData.message.usage.input_tokens,
    output: jsonData.message.usage.output_tokens,
    cacheRead: jsonData.message.usage.cache_read_input_tokens,
    cacheWrite: jsonData.message.usage.cache_creation_input_tokens
  });
}
```

### Pricing Table
```typescript
const PRICING = {
  'claude-3-opus': { input: 15.0, output: 75.0 },
  'claude-3-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-3.5-sonnet': { input: 3.0, output: 15.0 }
};
// Prices per 1M tokens
```

### CSS Styling
```css
.token-display {
  font-size: 11px;
  opacity: 0.8;
  display: flex;
  gap: 12px;
}

.input-tokens { color: var(--vscode-charts-blue); }
.output-tokens { color: var(--vscode-charts-green); }
.total-cost { color: var(--vscode-charts-yellow); }

.token-count.updating {
  animation: pulse 0.3s ease-out;
}
```

## Configuration
- `draagon.ui.showTokenCost`: Show/hide token display (default: true)
- `draagon.ui.showCacheInfo`: Show cache metrics (default: true)
- `draagon.pricing.customRates`: Override default pricing

## Acceptance Criteria
- [ ] Token counts display in UI
- [ ] Counters update during streaming
- [ ] Cost calculated correctly per model
- [ ] Cache tokens shown when available
- [ ] Session totals accumulate correctly
- [ ] Smooth animations on updates
