# REQ-014: Memory Service Offline Mode

**Status:** PLANNED
**Priority:** High
**Version:** 0.2.3
**Created:** 2026-01-05

## Overview

Enable the extension to operate gracefully when the draagon-ai memory service is unavailable, with clear user feedback and automatic reconnection.

## Problem Statement

### Current State

The memory client in `src/memory/client.ts` attempts connection but:

1. Errors are only logged, not communicated to users
2. No automatic reconnection on disconnect
3. No indication of degraded mode in UI
4. Features silently fail without memory context

### Impact

| Scenario | Current Behavior | Expected Behavior |
|----------|------------------|-------------------|
| Memory service not running | Silent failure | Clear "offline" indicator |
| Connection drops mid-session | No reconnection | Auto-reconnect with backoff |
| Memory query fails | Empty results | Graceful degradation + notification |
| Service comes back online | Manual restart needed | Auto-reconnect |

---

## Requirements

### FR-001: Connection Status Tracking

Track and expose memory service connection state.

**Implementation:**

```typescript
export type MemoryConnectionState =
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'error';

export class MemoryClient {
    private _connectionState: MemoryConnectionState = 'disconnected';
    private _onConnectionStateChange = new vscode.EventEmitter<MemoryConnectionState>();
    public readonly onConnectionStateChange = this._onConnectionStateChange.event;

    public get connectionState(): MemoryConnectionState {
        return this._connectionState;
    }

    private setConnectionState(state: MemoryConnectionState): void {
        if (this._connectionState !== state) {
            this._connectionState = state;
            this._onConnectionStateChange.fire(state);
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Connection state is tracked accurately
- [ ] State changes emit events
- [ ] State is queryable at any time

---

### FR-002: Automatic Reconnection

Automatically reconnect when connection is lost.

**Implementation:**

```typescript
private reconnectAttempts = 0;
private readonly maxReconnectAttempts = 5;
private reconnectTimer?: NodeJS.Timeout;

private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.setConnectionState('error');
        return;
    }

    this.setConnectionState('connecting');
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    this.reconnectTimer = setTimeout(async () => {
        try {
            await this.connect();
            this.reconnectAttempts = 0;
            this.setConnectionState('connected');
        } catch (error) {
            this.reconnectAttempts++;
            this.attemptReconnect();
        }
    }, delay);
}

public dispose(): void {
    if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
    }
}
```

**Acceptance Criteria:**
- [ ] Auto-reconnect on connection loss
- [ ] Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
- [ ] Max 5 reconnect attempts before giving up
- [ ] Reset attempts on successful reconnect

---

### FR-003: Graceful Degradation

Continue working without memory, with clear limitations.

**Implementation:**

```typescript
public async search(query: string): Promise<Memory[]> {
    if (this._connectionState !== 'connected') {
        console.log('Memory service offline, skipping search');
        return [];
    }

    try {
        return await this.performSearch(query);
    } catch (error) {
        console.error('Memory search failed:', error);
        this.handleConnectionError(error);
        return [];
    }
}

public async store(memory: MemoryInput): Promise<boolean> {
    if (this._connectionState !== 'connected') {
        // Queue for later sync
        this.pendingMemories.push(memory);
        return false;
    }

    try {
        await this.performStore(memory);
        return true;
    } catch (error) {
        this.pendingMemories.push(memory);
        this.handleConnectionError(error);
        return false;
    }
}
```

**Acceptance Criteria:**
- [ ] Extension works without memory service
- [ ] Failed stores queued for retry
- [ ] Search returns empty on offline
- [ ] No crashes on memory failures

---

### FR-004: UI Status Indicator

Show memory connection status in the chat UI.

**Implementation:**

```typescript
// In chatViewProvider.ts
private updateMemoryStatus(): void {
    const state = this._memoryClient?.connectionState || 'disconnected';
    const statusMap = {
        'disconnected': { text: 'Memory: Offline', icon: '⚫' },
        'connecting': { text: 'Memory: Connecting...', icon: '🟡' },
        'connected': { text: 'Memory: Connected', icon: '🟢' },
        'error': { text: 'Memory: Error', icon: '🔴' }
    };

    this._webviewManager.postMessage({
        type: 'updateMemoryStatus',
        ...statusMap[state]
    });
}
```

**CSS:**

```css
.memory-status {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
}

.memory-status.offline { color: var(--vscode-descriptionForeground); }
.memory-status.connecting { color: #f59e0b; }
.memory-status.connected { color: #22c55e; }
.memory-status.error { color: #ef4444; }
```

**Acceptance Criteria:**
- [ ] Status visible in footer
- [ ] Color indicates state
- [ ] Updates in real-time

---

### FR-005: Pending Memory Sync

Sync queued memories when connection restored.

**Implementation:**

```typescript
private pendingMemories: MemoryInput[] = [];

private async syncPendingMemories(): Promise<void> {
    if (this.pendingMemories.length === 0) return;

    console.log(`Syncing ${this.pendingMemories.length} pending memories`);

    const toSync = [...this.pendingMemories];
    this.pendingMemories = [];

    for (const memory of toSync) {
        try {
            await this.performStore(memory);
        } catch (error) {
            // Re-queue failed items
            this.pendingMemories.push(memory);
        }
    }
}

// Call on successful reconnect
private onConnected(): void {
    this.setConnectionState('connected');
    this.syncPendingMemories();
}
```

**Acceptance Criteria:**
- [ ] Failed stores are queued
- [ ] Queue syncs on reconnect
- [ ] Failed sync items re-queued
- [ ] Queue persists in memory only (not disk)

---

## Implementation Plan

### Phase 1: Connection State (1 hour)
1. Add connection state enum and tracking
2. Add event emitter for state changes
3. Update connect/disconnect methods

### Phase 2: Auto-Reconnect (1 hour)
1. Implement reconnection logic
2. Add exponential backoff
3. Handle max retry limit

### Phase 3: Graceful Degradation (30 min)
1. Add offline checks to all public methods
2. Implement pending memory queue
3. Add sync on reconnect

### Phase 4: UI Integration (30 min)
1. Update chat provider to listen for state changes
2. Add status indicator to webview
3. Style status indicator

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/memory/client.ts` | Connection state, reconnect, queue |
| `src/providers/chatViewProvider.ts` | Listen for state changes |
| `src/ui/webview/content.ts` | Status indicator |

---

## Testing

```typescript
describe('Memory Offline Mode', () => {
    it('should track connection state', async () => {
        const client = new MemoryClient(config);
        expect(client.connectionState).toBe('disconnected');

        await client.connect();
        expect(client.connectionState).toBe('connected');
    });

    it('should auto-reconnect on disconnect', async () => {
        // Simulate disconnect
        // Verify reconnect attempts
    });

    it('should queue memories when offline', async () => {
        const client = new MemoryClient(config);
        // Don't connect

        await client.store({ content: 'test' });
        // Verify queued
    });

    it('should sync pending memories on reconnect', async () => {
        // Queue some memories
        // Connect
        // Verify sync
    });
});
```

---

## Acceptance Criteria

- [ ] Extension works when memory service is unavailable
- [ ] Connection state is clearly visible in UI
- [ ] Auto-reconnect with exponential backoff
- [ ] Failed memory stores are queued
- [ ] Queued memories sync on reconnect
- [ ] No crashes or hangs on memory failures
- [ ] All existing tests pass
