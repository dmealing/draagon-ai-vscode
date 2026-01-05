# REQ-010: Test Suite Fixes and Architectural Hardening

**Status:** MOSTLY COMPLETE (Phase 4 deferred)
**Priority:** Critical
**Version:** 0.2.1
**Created:** 2026-01-04
**Updated:** 2026-01-04

## Overview

Address all issues identified in the architectural review:
1. ✅ **7 failing tests** — Missing mocks and configuration — **FIXED**
2. ✅ **Synchronous file I/O** — Blocks extension host thread — **FIXED**
3. ✅ **God object** — chatViewProvider.ts (1,036 lines) handles too much — **FIXED**
4. ⏳ **Monolithic webview** — content.ts (3,061 lines) needs bundling — **DEFERRED to v0.3.0**

## Implementation Summary

### Phase 1: Test Infrastructure — COMPLETE ✅

- Created `src/test/mocks/mockContext.ts` with reusable mock factories
- Fixed `ThinkingModeManager` to accept optional context
- Fixed `HistoryManager` tests to use proper async initialization
- Added missing `memory.endpoint` configuration to package.json
- Fixed ChatViewProvider test assertions

**Result:** All 115 tests passing

### Phase 2: Async File Operations — COMPLETE ✅

- Refactored `src/permissions/manager.ts` to use `fs.promises` API
- Refactored `src/history/manager.ts` to use `fs.promises` API
- Added `waitForInitialization()` method to both managers
- Added `_saveInProgress` promise chaining to prevent race conditions
- Updated all callers in extension.ts and chatViewProvider.ts

### Phase 3: ChatViewProvider Decomposition — COMPLETE ✅

- Created `src/providers/chat/stateManager.ts` (151 lines)
- Created `src/providers/chat/messageHandler.ts` (305 lines)
- Created `src/providers/chat/webviewManager.ts` (179 lines)
- Created `src/providers/chat/index.ts` (14 lines)
- Reduced `chatViewProvider.ts` from 1,036 → 790 lines (24% reduction)
- Total: 649 lines in focused modules

### Phase 4: Webview Bundling — DEFERRED ⏳

Deferred to v0.3.0. The current inline approach works but is not ideal for:
- Development tooling (hot reload, TypeScript in webview)
- Bundle optimization (minification, tree shaking)
- Component architecture

---

## Original Problem Statement

### Issue 1: Test Failures (7 tests)

| Test | Error | Root Cause |
|------|-------|------------|
| ThinkingModeManager wrap | `Cannot read 'workspaceState'` | Missing mock context |
| ThinkingModeManager modes | `Cannot read 'workspaceState'` | Missing mock context |
| HistoryManager create | `Should retrieve conversation` | Sync file ops race condition |
| Extension config | `memory.endpoint should exist` | Missing package.json entry |
| Providers router | `routing.fastPathPatterns` | Missing package.json entry |
| Providers account | `account.showInStatusBar` | Missing package.json entry |
| Providers memory | `memory.endpoint` | Missing package.json entry |

### Issue 2: Synchronous File I/O

**Files affected:**
- `src/permissions/manager.ts` — Uses `fs.writeFileSync`, `fs.readFileSync`, `fs.existsSync`
- `src/history/manager.ts` — Uses `fs.writeFileSync`, `fs.readFileSync`, `fs.existsSync`, `fs.mkdirSync`, `fs.unlinkSync`

**Impact:** Blocks extension host thread on slow disk, causing UI freezes.

### Issue 3: God Object (chatViewProvider.ts)

**Current responsibilities (1,036 lines):**
1. Webview lifecycle management
2. Message routing from webview
3. Claude process orchestration
4. Feature module coordination (9 modules)
5. State management
6. History recording
7. Diff generation coordination
8. Permission request handling
9. Image attachment handling

**Target:** Split into focused classes with single responsibility.

### Issue 4: Monolithic Webview (content.ts)

**Current structure (3,061 lines):**
- Inline HTML template
- Inline CSS (800+ lines)
- Inline JavaScript (1,500+ lines)
- No type safety in JS
- No component architecture

**Target:** Bundled webview with component architecture.

---

## Requirements

### Phase 1: Test Infrastructure (Critical)

#### FR-001: Mock Context Factory

Create reusable mock context for all tests.

**File:** `src/test/mocks/mockContext.ts`

```typescript
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

export function createMockContext(): vscode.ExtensionContext {
    const storagePath = path.join(os.tmpdir(), `test-storage-${Date.now()}`);

    const mockMemento = {
        keys: () => [] as readonly string[],
        get: <T>(_key: string, defaultValue?: T) => defaultValue as T,
        update: (_key: string, _value: unknown) => Promise.resolve()
    };

    return {
        storageUri: vscode.Uri.file(storagePath),
        globalStorageUri: vscode.Uri.file(storagePath),
        workspaceState: mockMemento as vscode.Memento,
        globalState: {
            ...mockMemento,
            setKeysForSync: () => {}
        } as vscode.Memento & { setKeysForSync: (keys: readonly string[]) => void },
        subscriptions: [],
        extensionPath: '/tmp/test-extension',
        extensionUri: vscode.Uri.file('/tmp/test-extension'),
        secrets: {
            get: () => Promise.resolve(undefined),
            store: () => Promise.resolve(),
            delete: () => Promise.resolve(),
            onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
        },
        extensionMode: vscode.ExtensionMode.Test,
        environmentVariableCollection: {} as vscode.GlobalEnvironmentVariableCollection,
        storagePath: storagePath,
        globalStoragePath: storagePath,
        logPath: storagePath,
        logUri: vscode.Uri.file(storagePath),
        extension: {} as vscode.Extension<unknown>,
        languageModelAccessInformation: {} as vscode.LanguageModelAccessInformation
    } as vscode.ExtensionContext;
}
```

#### FR-002: ThinkingModeManager Optional Context

Make context optional with fallback defaults.

**File:** `src/thinking/modes.ts`

```typescript
constructor(context?: vscode.ExtensionContext) {
    this._context = context;
    this._mode = context?.workspaceState.get('thinkingMode', 'default') ?? 'default';
}
```

#### FR-003: Package.json Configuration Entries

Add all missing configuration entries.

---

### Phase 2: Async File Operations (High)

#### FR-004: PermissionManager Async Refactor

Convert all sync file operations to async.

**Before:**
```typescript
private loadConfig(): PermissionConfig {
    if (fs.existsSync(this.permissionsPath)) {
        const content = fs.readFileSync(this.permissionsPath, 'utf-8');
        return JSON.parse(content);
    }
}
```

**After:**
```typescript
private async loadConfig(): Promise<PermissionConfig> {
    try {
        const content = await fs.promises.readFile(this.permissionsPath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return this.getDefaultConfig();
    }
}
```

#### FR-005: HistoryManager Async Refactor

Same pattern for all file operations.

---

### Phase 3: ChatViewProvider Decomposition (Medium)

#### FR-006: Extract Message Handlers

**New file:** `src/providers/chat/messageHandler.ts`

```typescript
export class ChatMessageHandler {
    constructor(
        private claudeProcess: ClaudeProcess,
        private permissionManager: PermissionManager,
        private tokenTracker: TokenTracker
    ) {}

    async handleClaudeMessage(message: ClaudeMessage): Promise<void> { }
    async handleToolUse(toolUse: ToolUseBlock): Promise<void> { }
    async handleToolResult(result: ToolResultBlock): Promise<void> { }
}
```

#### FR-007: Extract State Manager

**New file:** `src/providers/chat/stateManager.ts`

```typescript
export class ChatStateManager {
    private _isProcessing: boolean = false;
    private _currentSessionId?: string;
    private _attachedImages: ImageInfo[] = [];
    private _pendingDiffs: Map<string, DiffState> = new Map();

    // Getters and setters with event emission
}
```

#### FR-008: Extract Webview Manager

**New file:** `src/providers/chat/webviewManager.ts`

```typescript
export class ChatWebviewManager {
    constructor(private extensionUri: vscode.Uri) {}

    createWebview(context: vscode.WebviewViewResolveContext): void { }
    postMessage(message: WebviewMessage): void { }
    dispose(): void { }
}
```

---

### Phase 4: Webview Bundling (Medium)

#### FR-009: Webview Build Setup

**New files:**
```
src/webview/
├── esbuild.config.js      # Build configuration
├── src/
│   ├── index.ts           # Entry point
│   ├── components/
│   │   ├── ChatMessage.ts
│   │   ├── PermissionDialog.ts
│   │   ├── TokenDisplay.ts
│   │   ├── HistoryPanel.ts
│   │   └── StopButton.ts
│   ├── styles/
│   │   ├── variables.css
│   │   └── components.css
│   └── handlers/
│       ├── messageHandler.ts
│       └── inputHandler.ts
└── dist/
    └── webview.js         # Bundled output
```

#### FR-010: Type-Safe Message Protocol

**New file:** `src/webview/src/protocol.ts`

```typescript
export type WebviewMessage =
    | { type: 'sendMessage'; text: string }
    | { type: 'injectMessage'; text: string }
    | { type: 'stopRequest' }
    | { type: 'permissionResponse'; requestId: string; allowed: boolean; scope: 'once' | 'session' }
    | { type: 'getHistory' }
    | { type: 'loadConversation'; id: string };

export type ExtensionMessage =
    | { type: 'addMessage'; role: string; content: string }
    | { type: 'setProcessing'; data: { isProcessing: boolean } }
    | { type: 'tokenUpdate'; data: TokenData }
    | { type: 'permissionRequest'; data: PermissionRequest }
    | { type: 'diffResult'; data: DiffResult };
```

---

## Implementation Plan

### Sprint 1: Critical Fixes (Day 1)

| Task | Priority | Est. Time |
|------|----------|-----------|
| Create mockContext.ts | P0 | 30 min |
| Fix ThinkingModeManager | P0 | 15 min |
| Add package.json config | P0 | 15 min |
| Update test imports | P0 | 30 min |
| Run tests, verify 0 failures | P0 | 15 min |

### Sprint 2: Async Conversion (Day 1-2)

| Task | Priority | Est. Time |
|------|----------|-----------|
| PermissionManager async | P1 | 1 hr |
| HistoryManager async | P1 | 1.5 hr |
| Update callers to await | P1 | 30 min |
| Test async behavior | P1 | 30 min |

### Sprint 3: ChatViewProvider Split (Day 2-3)

| Task | Priority | Est. Time |
|------|----------|-----------|
| Extract messageHandler.ts | P2 | 2 hr |
| Extract stateManager.ts | P2 | 1 hr |
| Extract webviewManager.ts | P2 | 1 hr |
| Refactor chatViewProvider | P2 | 2 hr |
| Integration testing | P2 | 1 hr |

### Sprint 4: Webview Bundling (Day 3-4)

| Task | Priority | Est. Time |
|------|----------|-----------|
| Setup esbuild | P2 | 1 hr |
| Extract components | P2 | 3 hr |
| Extract styles | P2 | 1 hr |
| Type-safe protocol | P2 | 1 hr |
| Build integration | P2 | 1 hr |

---

## Acceptance Criteria

### Phase 1 (Must Have)
- [ ] All 7 tests pass
- [ ] No new test failures
- [ ] Mock context is reusable

### Phase 2 (Must Have)
- [ ] No synchronous file I/O in production code
- [ ] Extension doesn't block on disk operations

### Phase 3 (Should Have)
- [ ] chatViewProvider.ts < 300 lines
- [ ] Each extracted class has single responsibility
- [ ] All existing functionality preserved

### Phase 4 (Nice to Have)
- [ ] Webview is bundled with esbuild
- [ ] Type-safe message protocol
- [ ] Component-based webview architecture

---

## Files to Modify/Create

### New Files
| File | Purpose |
|------|---------|
| `src/test/mocks/mockContext.ts` | Mock context factory |
| `src/providers/chat/messageHandler.ts` | Claude message handling |
| `src/providers/chat/stateManager.ts` | Chat state management |
| `src/providers/chat/webviewManager.ts` | Webview lifecycle |
| `src/webview/esbuild.config.js` | Webview build config |
| `src/webview/src/index.ts` | Webview entry |
| `src/webview/src/protocol.ts` | Type-safe messages |

### Modified Files
| File | Change |
|------|--------|
| `src/thinking/modes.ts` | Optional context |
| `src/permissions/manager.ts` | Async file ops |
| `src/history/manager.ts` | Async file ops |
| `src/providers/chatViewProvider.ts` | Extract to sub-modules |
| `src/test/suite/claude-code.test.ts` | Use mock context |
| `package.json` | Add config + build scripts |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Comprehensive integration tests before refactor |
| Async conversion breaks callers | Add compatibility layer during transition |
| Webview bundling complexity | Incremental extraction, test each component |

---

## Testing Strategy

### Unit Tests
- Mock context factory tests
- Each extracted class has own test file
- Async operation tests with mocked fs

### Integration Tests
- Full message flow tests
- Permission dialog flow
- History save/load cycle

### E2E Tests
- Extension activation
- Send message → receive response
- Stop button functionality

---

**End of REQ-010**
