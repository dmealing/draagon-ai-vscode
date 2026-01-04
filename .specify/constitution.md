# draagon-ai-vscode Constitution

**Version:** 1.0
**Last Updated:** 2026-01-04

This document defines the inviolable principles that govern development of the Draagon AI VS Code extension.

---

## Core Principles

### 1. User Experience First

The extension must enhance, never hinder, the developer experience.

| Principle | Requirement |
|-----------|-------------|
| **Responsive** | UI must remain responsive; never block the main thread |
| **Non-intrusive** | Features are opt-in; don't overwhelm with notifications |
| **Predictable** | Same action produces same result; no surprises |
| **Fast** | Startup < 500ms; operations feel instant |

### 2. Security by Default

User data and credentials are sacred.

| NEVER | ALWAYS |
|-------|--------|
| Store API keys in plain text | Use VS Code's SecretStorage |
| Send data to unauthorized endpoints | Validate all external URLs |
| Execute untrusted code in webviews | Use strict CSP policies |
| Log sensitive information | Sanitize logs before output |

### 3. VS Code Integration Standards

Be a good citizen of the VS Code ecosystem.

```typescript
// ✅ CORRECT: Follow VS Code patterns
context.subscriptions.push(disposable);

// ❌ WRONG: Orphaned resources
const watcher = vscode.workspace.createFileSystemWatcher('**/*');
// Never disposed!
```

**Required patterns:**
- All resources must be disposable
- Commands registered in package.json
- Settings use VS Code configuration API
- Webviews follow security guidelines

### 4. Graceful Degradation

The extension must work even when services are unavailable.

| Scenario | Behavior |
|----------|----------|
| draagon-ai service down | Show cached data, queue operations |
| No API key configured | Prompt setup, disable AI features |
| Network offline | Local-only features remain functional |
| LLM rate limited | Queue requests, show status |

---

## Testing Integrity (CRITICAL)

Inherited from draagon-ai constitution - these are INVIOLABLE:

### NEVER Weaken Tests to Pass

Tests exist to validate the system. The system must rise to meet the tests.

| ❌ FORBIDDEN | ✅ REQUIRED |
|--------------|-------------|
| Skip failing tests without root cause | Fix the underlying issue |
| Mock core functionality in integration tests | Use real VS Code API in tests |
| Remove assertions that fail | Fix the code, not the test |
| Lower coverage thresholds | Improve test coverage |

### Use Real VS Code API in Tests

```typescript
// ✅ CORRECT: Real VS Code test environment
suite('Extension Tests', () => {
  test('activates correctly', async () => {
    const ext = vscode.extensions.getExtension('draagon.draagon-ai-vscode');
    await ext?.activate();
    assert.ok(ext?.isActive);
  });
});

// ❌ WRONG: Mocking VS Code API
jest.mock('vscode', () => ({ ... }));  // NO!
```

---

## Code Quality Standards

### TypeScript Strictness

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Error Handling

```typescript
// ✅ CORRECT: Typed errors with user feedback
try {
  await memoryClient.connect();
} catch (error) {
  if (error instanceof ConnectionError) {
    vscode.window.showErrorMessage(`Cannot connect: ${error.message}`);
  } else {
    vscode.window.showErrorMessage('Unexpected error occurred');
    logger.error('Unhandled error', { error });
  }
}

// ❌ WRONG: Silent failures
try {
  await memoryClient.connect();
} catch {
  // Silently fail
}
```

### Async Patterns

```typescript
// ✅ CORRECT: Proper async handling
async function loadData(): Promise<Data> {
  const result = await fetchData();
  return result;
}

// ❌ WRONG: Floating promises
function loadData(): void {
  fetchData();  // Promise ignored!
}
```

---

## Performance Requirements

| Metric | Threshold | Critical |
|--------|-----------|----------|
| Extension activation | < 500ms | < 1000ms |
| Command execution | < 100ms | < 500ms |
| Webview load | < 200ms | < 500ms |
| Memory usage | < 50MB | < 100MB |

### Lazy Loading

```typescript
// ✅ CORRECT: Lazy load heavy dependencies
let memoryClient: MemoryClient | undefined;

async function getMemoryClient(): Promise<MemoryClient> {
  if (!memoryClient) {
    const { MemoryClient } = await import('./memory/client');
    memoryClient = new MemoryClient(config);
  }
  return memoryClient;
}

// ❌ WRONG: Eager load everything
import { MemoryClient } from './memory/client';  // At top level
import { AgentOrchestrator } from './agents/orchestrator';
import { Router } from './routing/router';
// All loaded on activation!
```

---

## Accessibility Requirements

The extension must be accessible to all users.

- All UI elements must have ARIA labels
- Keyboard navigation for all features
- High contrast theme support
- Screen reader compatibility

---

## Documentation Requirements

### Code Documentation

```typescript
/**
 * Manages conversation sessions with persistence.
 *
 * Sessions are stored in the workspace state and restored
 * on extension activation.
 *
 * @example
 * ```typescript
 * const manager = new SessionManager(context);
 * const session = await manager.create('New Session');
 * await session.addMessage({ role: 'user', content: 'Hello' });
 * ```
 */
export class SessionManager implements vscode.Disposable {
  // ...
}
```

### README Requirements

- Quick start guide
- Feature overview with screenshots
- Configuration reference
- Troubleshooting section

---

## Release Process

1. All tests must pass
2. No TypeScript errors
3. ESLint clean
4. Version bump in package.json
5. CHANGELOG.md updated
6. Tag created
7. Published to VS Code Marketplace

---

**These principles are non-negotiable. Any proposed change that violates them must be rejected.**
