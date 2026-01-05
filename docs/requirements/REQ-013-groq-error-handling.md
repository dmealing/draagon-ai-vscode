# REQ-013: Groq API Error Handling

**Status:** PLANNED
**Priority:** High
**Version:** 0.2.3
**Created:** 2026-01-05

## Overview

Implement robust error handling for Groq API calls with automatic fallback to Claude when Groq fails or is unavailable.

## Problem Statement

### Current State

The `executeGroq()` method in `src/routing/router.ts` has minimal error handling:

```typescript
private async executeGroq(query: string): Promise<string> {
    const groq = new Groq({ apiKey: this.groqApiKey });
    const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: query }],
        max_tokens: 1024
    });
    return response.choices[0]?.message?.content || '';
}
```

### Issues

| Issue | Impact | Severity |
|-------|--------|----------|
| No retry logic | Single failure = complete failure | High |
| No timeout handling | Requests can hang indefinitely | High |
| No fallback to Claude | Users blocked when Groq down | High |
| No rate limit handling | 429 errors cause crashes | Medium |
| No error reporting to UI | Users don't know what failed | Medium |

---

## Requirements

### FR-001: Automatic Retry with Exponential Backoff

Retry failed requests with increasing delays.

**Implementation:**

```typescript
async function withRetry<T>(
    fn: () => Promise<T>,
    options: { maxRetries: number; baseDelay: number }
): Promise<T> {
    let lastError: Error;
    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            if (attempt < options.maxRetries) {
                const delay = options.baseDelay * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastError!;
}
```

**Acceptance Criteria:**
- [ ] Retry up to 3 times on transient failures
- [ ] Exponential backoff: 1s, 2s, 4s delays
- [ ] Don't retry on 4xx client errors (except 429)

---

### FR-002: Request Timeout

Add timeout to prevent hanging requests.

**Implementation:**

```typescript
async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
    });
    return Promise.race([promise, timeout]);
}
```

**Acceptance Criteria:**
- [ ] Default timeout: 30 seconds
- [ ] Configurable via settings
- [ ] Timeout error clearly identified

---

### FR-003: Fallback to Claude

When Groq fails after retries, fall back to Claude.

**Implementation:**

```typescript
async route(query: string): Promise<RoutingResult> {
    const decision = this.analyzeQuery(query);

    if (decision.tier === 'fast' && this.groqApiKey) {
        try {
            const response = await this.executeGroqWithRetry(query);
            return { provider: 'groq', response, decision };
        } catch (error) {
            console.warn('Groq failed, falling back to Claude:', error);
            this.recordFallback('groq', 'claude', error);
            return { provider: 'claude', decision, fallback: true };
        }
    }

    return { provider: 'claude', decision };
}
```

**Acceptance Criteria:**
- [ ] Groq failures automatically route to Claude
- [ ] Fallback is logged for debugging
- [ ] User notified of degraded mode

---

### FR-004: Rate Limit Handling

Handle 429 errors gracefully with appropriate wait times.

**Implementation:**

```typescript
if (error.status === 429) {
    const retryAfter = error.headers?.['retry-after'] || 60;
    console.warn(`Rate limited. Retry after ${retryAfter}s`);
    // Don't retry, fall back immediately
    throw new RateLimitError(retryAfter);
}
```

**Acceptance Criteria:**
- [ ] Detect 429 status codes
- [ ] Parse retry-after header if present
- [ ] Fall back to Claude immediately on rate limit
- [ ] Display rate limit warning to user

---

### FR-005: Error Reporting to UI

Communicate failures to the user interface.

**Implementation:**

```typescript
interface RoutingError {
    type: 'timeout' | 'rate_limit' | 'network' | 'auth' | 'unknown';
    message: string;
    provider: string;
    fallbackUsed: boolean;
}

// Emit error event
this._onRoutingError.fire({
    type: 'rate_limit',
    message: 'Groq rate limited, using Claude',
    provider: 'groq',
    fallbackUsed: true
});
```

**Acceptance Criteria:**
- [ ] Errors emit events for UI consumption
- [ ] Error type is categorized
- [ ] Fallback status is communicated

---

## Implementation Plan

### Phase 1: Core Error Handling (1 hour)
1. Add `withRetry()` utility function
2. Add `withTimeout()` utility function
3. Update `executeGroq()` to use utilities

### Phase 2: Fallback Logic (30 min)
1. Modify `route()` to catch Groq errors
2. Return Claude fallback on failure
3. Track fallback occurrences

### Phase 3: UI Integration (30 min)
1. Add error event emitter
2. Update chat provider to listen
3. Display fallback notifications

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/routing/router.ts` | Add retry, timeout, fallback logic |
| `src/providers/chatViewProvider.ts` | Listen for routing errors |
| `src/ui/webview/content.ts` | Display fallback notifications |

---

## Testing

```typescript
describe('Groq Error Handling', () => {
    it('should retry on transient failure', async () => {
        // Mock Groq to fail twice, succeed third time
    });

    it('should fall back to Claude after max retries', async () => {
        // Mock Groq to always fail
    });

    it('should timeout long requests', async () => {
        // Mock Groq to hang
    });

    it('should handle rate limits gracefully', async () => {
        // Mock 429 response
    });
});
```

---

## Acceptance Criteria

- [ ] Groq failures don't crash the extension
- [ ] Automatic fallback to Claude on Groq failure
- [ ] Retry with exponential backoff on transient errors
- [ ] Timeout prevents hanging requests
- [ ] Rate limits handled gracefully
- [ ] User informed of degraded mode
- [ ] All existing tests pass
