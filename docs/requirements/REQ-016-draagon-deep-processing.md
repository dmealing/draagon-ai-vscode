# REQ-016: Draagon Deep Processing

**Status:** PLANNED
**Priority:** High
**Version:** 0.2.3
**Created:** 2026-01-05

## Overview

Implement the Draagon deep processing tier for memory-augmented, cognitive AI responses when queries match deep-path patterns.

## Problem Statement

### Current State

The router identifies deep-path queries but falls back to Claude:

```typescript
// src/routing/router.ts:72
// TODO: Add Draagon deep processing
if (decision.tier === 'deep') {
    // For now, fall back to Claude
    return { provider: 'claude', decision };
}
```

### Deep-Path Patterns (from router.ts)

Queries matching these patterns should use Draagon:
- "based on what you know about me"
- "remember when"
- "my preferences"
- "personalize"
- "my style"
- "how I usually"

### Expected Behavior

| Query Type | Current | Expected |
|------------|---------|----------|
| "What's my coding style?" | Claude (no context) | Draagon (with memory) |
| "Remember that bug fix?" | Claude (no memory) | Draagon (searches history) |
| "Based on my preferences..." | Claude (generic) | Draagon (personalized) |

---

## Requirements

### FR-001: Draagon Service Client

Create a client to communicate with the draagon-ai cognitive service.

**Implementation:**

```typescript
// src/draagon/client.ts
export interface DraagonConfig {
    endpoint: string;
    apiKey?: string;
    timeout?: number;
}

export interface CognitiveRequest {
    query: string;
    context?: {
        memories?: Memory[];
        sessionHistory?: Message[];
        userProfile?: UserProfile;
    };
    options?: {
        searchDepth?: 'shallow' | 'deep';
        includeReasoning?: boolean;
    };
}

export interface CognitiveResponse {
    response: string;
    reasoning?: string;
    memoriesUsed?: Memory[];
    confidence: number;
}

export class DraagonClient {
    private _endpoint: string;
    private _apiKey?: string;
    private _connected: boolean = false;

    constructor(config: DraagonConfig) {
        this._endpoint = config.endpoint;
        this._apiKey = config.apiKey;
    }

    public async connect(): Promise<boolean> {
        try {
            const response = await fetch(`${this._endpoint}/health`);
            this._connected = response.ok;
            return this._connected;
        } catch (error) {
            this._connected = false;
            return false;
        }
    }

    public async process(request: CognitiveRequest): Promise<CognitiveResponse> {
        if (!this._connected) {
            throw new Error('Draagon service not connected');
        }

        const response = await fetch(`${this._endpoint}/cognitive/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this._apiKey && { 'Authorization': `Bearer ${this._apiKey}` })
            },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            throw new Error(`Draagon request failed: ${response.status}`);
        }

        return response.json();
    }

    public get isConnected(): boolean {
        return this._connected;
    }
}
```

**Acceptance Criteria:**
- [ ] Client connects to draagon-ai service
- [ ] Health check on startup
- [ ] Authentication support
- [ ] Timeout handling

---

### FR-002: Memory Context Injection

Retrieve and inject relevant memories into requests.

**Implementation:**

```typescript
// In router.ts
private async executeDraagon(query: string): Promise<string> {
    if (!this._draagonClient?.isConnected) {
        console.warn('Draagon not connected, falling back to Claude');
        return this.fallbackToClaude(query);
    }

    // Retrieve relevant memories
    const memories = await this._memoryClient?.search(query) || [];

    // Get recent session history
    const sessionHistory = this.getSessionHistory();

    // Process with Draagon
    const response = await this._draagonClient.process({
        query,
        context: {
            memories,
            sessionHistory,
            userProfile: await this.getUserProfile()
        },
        options: {
            searchDepth: 'deep',
            includeReasoning: true
        }
    });

    // Store the response as a new memory if valuable
    if (response.confidence > 0.8) {
        await this._memoryClient?.store({
            content: `Q: ${query}\nA: ${response.response}`,
            type: 'INTERACTION',
            importance: response.confidence
        });
    }

    return response.response;
}
```

**Acceptance Criteria:**
- [ ] Memories retrieved for context
- [ ] Session history included
- [ ] User profile available
- [ ] Response stored if high confidence

---

### FR-003: Fallback on Unavailability

Gracefully fall back to Claude when Draagon unavailable.

**Implementation:**

```typescript
public async route(query: string): Promise<RoutingResult> {
    const decision = this.analyzeQuery(query);

    if (decision.tier === 'deep') {
        try {
            if (this._draagonClient?.isConnected) {
                const response = await this.executeDraagon(query);
                this.recordRouting('deep');
                return { provider: 'draagon', response, decision };
            }
        } catch (error) {
            console.warn('Draagon processing failed:', error);
            this.recordFallback('draagon', 'claude', error);
        }

        // Fall back to Claude with memory context
        return this.routeToClaudeWithContext(query, decision);
    }

    // ... rest of routing
}

private async routeToClaudeWithContext(
    query: string,
    decision: RoutingDecision
): Promise<RoutingResult> {
    // Get memories even for Claude fallback
    const memories = await this._memoryClient?.search(query) || [];

    if (memories.length > 0) {
        const contextPrefix = this.formatMemoryContext(memories);
        return {
            provider: 'claude',
            decision,
            fallback: true,
            contextInjection: contextPrefix
        };
    }

    return { provider: 'claude', decision, fallback: true };
}
```

**Acceptance Criteria:**
- [ ] Draagon failure falls back to Claude
- [ ] Memory context injected into Claude fallback
- [ ] Fallback is logged
- [ ] User notified of degraded mode

---

### FR-004: Deep Processing Indicator

Show when Draagon deep processing is active.

**Implementation:**

```typescript
// Update routing indicator in UI
function updateRoutingIndicator(tier: string, provider: string): void {
    const indicators = {
        fast: { icon: '⚡', text: 'Groq', color: 'warning' },
        standard: { icon: '🔵', text: 'Claude', color: 'info' },
        deep: { icon: '🟣', text: 'Draagon', color: 'purple' }
    };

    const indicator = indicators[tier];
    routingIndicator.innerHTML = `
        <span class="indicator-icon">${indicator.icon}</span>
        <span class="indicator-text">${indicator.text}</span>
    `;
    routingIndicator.className = `routing-indicator ${indicator.color}`;
}
```

**CSS:**

```css
.routing-indicator.purple {
    color: #8b5cf6;
}

.routing-indicator.purple .indicator-icon {
    animation: pulse-purple 2s infinite;
}

@keyframes pulse-purple {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
}
```

**Acceptance Criteria:**
- [ ] Purple indicator for Draagon
- [ ] Animated when processing
- [ ] Clear distinction from Claude

---

### FR-005: Configuration

Add configuration options for Draagon integration.

**package.json contribution:**

```json
{
    "draagon.endpoint": {
        "type": "string",
        "default": "http://localhost:8000",
        "description": "Draagon cognitive service endpoint"
    },
    "draagon.apiKey": {
        "type": "string",
        "default": "",
        "description": "API key for Draagon service (if required)"
    },
    "draagon.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable Draagon deep processing"
    },
    "draagon.autoConnect": {
        "type": "boolean",
        "default": true,
        "description": "Automatically connect to Draagon on startup"
    }
}
```

**Acceptance Criteria:**
- [ ] Endpoint configurable
- [ ] API key support
- [ ] Enable/disable toggle
- [ ] Auto-connect option

---

## Implementation Plan

### Phase 1: Draagon Client (1.5 hours)
1. Create `src/draagon/client.ts`
2. Implement connection, health check
3. Implement process method
4. Add error handling

### Phase 2: Router Integration (1.5 hours)
1. Initialize Draagon client in router
2. Implement `executeDraagon()`
3. Add memory context injection
4. Implement fallback logic

### Phase 3: Configuration (30 min)
1. Add package.json settings
2. Load config in extension
3. Pass to router

### Phase 4: UI Updates (30 min)
1. Add purple indicator
2. Update routing status
3. Show Draagon-specific feedback

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `src/draagon/client.ts` | **NEW** - Draagon service client |
| `src/routing/router.ts` | Integrate Draagon processing |
| `package.json` | Add Draagon configuration |
| `src/extension.ts` | Initialize Draagon client |
| `src/ui/webview/content.ts` | Add purple indicator |

---

## API Contract

### Draagon Service API (Expected)

```yaml
POST /cognitive/process
Request:
  query: string
  context:
    memories: Memory[]
    sessionHistory: Message[]
    userProfile: UserProfile
  options:
    searchDepth: 'shallow' | 'deep'
    includeReasoning: boolean

Response:
  response: string
  reasoning: string?
  memoriesUsed: Memory[]
  confidence: number (0-1)

GET /health
Response:
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  memoryCount: number
```

---

## Testing

```typescript
describe('Draagon Deep Processing', () => {
    it('should route deep queries to Draagon', async () => {
        const router = new Router(context, config);
        // Mock Draagon as connected

        const result = await router.route('Based on my coding style...');

        expect(result.provider).toBe('draagon');
    });

    it('should inject memory context', async () => {
        // Mock memory client with results
        const router = new Router(context, config);

        await router.route('Remember that discussion?');

        // Verify memories were included in request
    });

    it('should fall back to Claude when Draagon unavailable', async () => {
        const router = new Router(context, { ...config, draagonEnabled: true });
        // Mock Draagon as disconnected

        const result = await router.route('My preferences are...');

        expect(result.provider).toBe('claude');
        expect(result.fallback).toBe(true);
    });

    it('should include memory context in Claude fallback', async () => {
        // Mock Draagon disconnected, memory available

        const result = await router.route('Based on what you know...');

        expect(result.contextInjection).toBeDefined();
    });
});
```

---

## Dependencies

- **draagon-ai service** must be running at configured endpoint
- **Memory service** should be available for full functionality
- Falls back gracefully when either is unavailable

---

## Acceptance Criteria

- [ ] Draagon client connects to service
- [ ] Deep-path queries routed to Draagon
- [ ] Memory context injected into requests
- [ ] Graceful fallback to Claude
- [ ] Purple indicator shows Draagon active
- [ ] Configuration options available
- [ ] Works offline (fallback mode)
- [ ] All existing tests pass
