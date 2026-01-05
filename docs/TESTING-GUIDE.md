# VS Code Extension Testing Guide

**Last Updated:** 2026-01-05
**Project:** draagon-ai-vscode

This guide documents the complete testing strategy for VS Code extensions, covering unit tests, integration tests, and end-to-end testing patterns.

---

## Table of Contents

1. [Testing Architecture](#testing-architecture)
2. [Running Tests](#running-tests)
3. [Test Structure](#test-structure)
4. [Writing Unit Tests](#writing-unit-tests)
5. [Writing Integration Tests](#writing-integration-tests)
6. [Testing Webview Content](#testing-webview-content)
7. [Mocking Strategies](#mocking-strategies)
8. [Test Fixtures with Groq](#test-fixtures-with-groq)
9. [Common Patterns](#common-patterns)
10. [Troubleshooting](#troubleshooting)

---

## Testing Architecture

VS Code extension testing uses the official `@vscode/test-electron` package which:

1. Downloads a VS Code instance for testing
2. Launches VS Code in extension development mode
3. Loads and activates your extension
4. Runs Mocha test suites inside the VS Code process

```
┌─────────────────────────────────────────────────────┐
│                   Test Runner                        │
│  (src/test/runTest.ts)                              │
│                                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │         VS Code Test Instance               │   │
│  │  (.vscode-test/vscode-linux-x64-xxx/)       │   │
│  │                                              │   │
│  │  ┌─────────────────────────────────────┐   │   │
│  │  │     Your Extension (loaded)          │   │   │
│  │  │     (out/extension.js)               │   │   │
│  │  └─────────────────────────────────────┘   │   │
│  │                                              │   │
│  │  ┌─────────────────────────────────────┐   │   │
│  │  │     Mocha Test Suite                 │   │   │
│  │  │     (out/test/suite/*.test.js)       │   │   │
│  │  └─────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Running Tests

### Prerequisites

```bash
# Install dependencies
npm install

# Compile TypeScript (required before testing)
npm run compile
```

### Run All Tests

```bash
npm test
```

This executes `src/test/runTest.ts`, which:
1. Downloads VS Code if not cached
2. Launches VS Code in test mode
3. Runs all `*.test.ts` files in `src/test/suite/`

### Watch Mode for Development

```bash
# Terminal 1: Watch and compile
npm run watch

# Terminal 2: Run tests after changes
npm test
```

### Run Specific Test File

Modify `src/test/suite/index.ts` temporarily:

```typescript
// Change glob pattern to specific file
const files = glob.sync('**/extension.test.js', { cwd: testsRoot });
```

---

## Test Structure

### Directory Layout

```
src/test/
├── runTest.ts              # Test runner entry point
├── suite/
│   ├── index.ts            # Mocha test loader
│   ├── extension.test.ts   # Extension activation tests
│   ├── providers.test.ts   # View provider tests
│   ├── routing.test.ts     # Router logic tests
│   ├── sessions.test.ts    # Session manager tests
│   ├── rendering.test.ts   # Webview rendering tests
│   └── integrations.test.ts # Integration tests
├── mocks/
│   ├── mockContext.ts      # Mock ExtensionContext
│   └── mockClaudeProcess.ts # Mock Claude process
└── fixtures/
    ├── generateFixtures.ts  # Groq-based fixture generator
    ├── validateFixtures.ts  # Fixture validation script
    └── generated/
        └── claude-responses.json  # Generated test data
```

### Test Runner (runTest.ts)

```typescript
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                '--disable-extensions',  // Disable other extensions
                '--disable-gpu'          // Faster headless testing
            ]
        });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();
```

### Suite Loader (suite/index.ts)

```typescript
import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',      // Use suite/test syntax
        color: true,
        timeout: 60000  // 60s timeout for slow tests
    });

    const testsRoot = path.resolve(__dirname, '.');

    return new Promise((resolve, reject) => {
        glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
            if (err) {
                return reject(err);
            }

            files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

            mocha.run(failures => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        });
    });
}
```

---

## Writing Unit Tests

### Basic Structure

VS Code tests use Mocha's TDD interface (`suite`/`test`), NOT BDD (`describe`/`it`):

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('My Feature Tests', () => {

    // Setup before all tests in suite
    suiteSetup(async () => {
        // One-time setup
    });

    // Setup before each test
    setup(() => {
        // Per-test setup
    });

    // Cleanup after each test
    teardown(() => {
        // Per-test cleanup
    });

    test('should do something', () => {
        const result = myFunction();
        assert.strictEqual(result, 'expected');
    });

    test('should handle async operations', async () => {
        const result = await asyncFunction();
        assert.ok(result.success);
    });
});
```

### Testing Extension Activation

```typescript
suite('Extension Activation', () => {
    test('Extension should be present', () => {
        const ext = vscode.extensions.getExtension('publisher.extension-name');
        assert.ok(ext, 'Extension should be installed');
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('publisher.extension-name');
        await ext?.activate();
        assert.ok(ext?.isActive, 'Extension should be active');
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('myExtension.myCommand'));
    });
});
```

### Testing Configuration

```typescript
suite('Configuration Tests', () => {
    test('Default settings should exist', () => {
        const config = vscode.workspace.getConfiguration('myExtension');
        const value = config.get<string>('someSetting');
        assert.strictEqual(value, 'defaultValue');
    });

    test('Settings should be updatable', async () => {
        const config = vscode.workspace.getConfiguration('myExtension');
        await config.update('someSetting', 'newValue', true);

        const updated = config.get<string>('someSetting');
        assert.strictEqual(updated, 'newValue');
    });
});
```

---

## Writing Integration Tests

### Testing with VS Code APIs

```typescript
suite('Integration Tests', () => {
    test('Should open a document', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'Hello World',
            language: 'plaintext'
        });

        assert.strictEqual(doc.getText(), 'Hello World');
    });

    test('Should execute command', async () => {
        // Execute a command and check side effects
        await vscode.commands.executeCommand('myExtension.doSomething');

        // Verify the command's effect
        const state = getExtensionState();
        assert.ok(state.commandWasExecuted);
    });

    test('Should show webview', async () => {
        await vscode.commands.executeCommand('myExtension.showPanel');

        // Give webview time to load
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Webview testing is limited - check panel exists
        // Actual content testing requires reference implementation
    });
});
```

---

## Testing Webview Content

Webviews run in an iframe and can't be directly accessed from tests. Use a **reference implementation** approach:

### The Problem

```typescript
// This WON'T work - webview content is isolated
const webview = panel.webview;
const html = webview.html;  // You can set this, but not test internal functions
```

### The Solution: Reference Implementation

1. **Extract pure functions** from webview JavaScript
2. **Create matching TypeScript implementations** for testing
3. **Test the reference implementation** with unit tests

```typescript
// src/test/suite/rendering.test.ts

// Reference implementation matching webview's formatContent
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatContent(content: string): string {
    let text = escapeHtml(content);

    // Markdown processing...
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    return text;
}

suite('Webview Rendering Tests', () => {
    suite('XSS Protection', () => {
        test('should escape script tags', () => {
            const malicious = '<script>alert("xss")</script>';
            const result = formatContent(malicious);
            assert.ok(!result.includes('<script>'));
            assert.ok(result.includes('&lt;script&gt;'));
        });
    });

    suite('Markdown Rendering', () => {
        test('should render bold text', () => {
            const result = formatContent('This is **bold** text');
            assert.ok(result.includes('<strong>bold</strong>'));
        });
    });
});
```

---

## Mocking Strategies

### Mock ExtensionContext

```typescript
// src/test/mocks/mockContext.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

export function createMockContext(): vscode.ExtensionContext {
    const tmpDir = path.join(os.tmpdir(), 'vscode-test-' + Date.now());

    return {
        subscriptions: [],
        workspaceState: createMockMemento(),
        globalState: createMockMemento(),
        extensionPath: path.resolve(__dirname, '../../../'),
        storagePath: tmpDir,
        globalStoragePath: tmpDir,
        logPath: tmpDir,
        extensionUri: vscode.Uri.file(path.resolve(__dirname, '../../../')),
        globalStorageUri: vscode.Uri.file(tmpDir),
        storageUri: vscode.Uri.file(tmpDir),
        logUri: vscode.Uri.file(tmpDir),
        extensionMode: vscode.ExtensionMode.Test,
        asAbsolutePath: (relativePath: string) =>
            path.resolve(__dirname, '../../../', relativePath),
        secrets: createMockSecrets(),
        extension: {} as vscode.Extension<unknown>,
        languageModelAccessInformation: {} as vscode.LanguageModelAccessInformation,
        environmentVariableCollection: {} as vscode.GlobalEnvironmentVariableCollection,
    };
}

function createMockMemento(): vscode.Memento {
    const storage = new Map<string, unknown>();
    return {
        get: <T>(key: string, defaultValue?: T): T | undefined =>
            storage.get(key) as T ?? defaultValue,
        update: (key: string, value: unknown) => {
            storage.set(key, value);
            return Promise.resolve();
        },
        keys: () => Array.from(storage.keys()),
        setKeysForSync: () => {}
    };
}
```

### Mock External Services

```typescript
// src/test/mocks/mockClaudeProcess.ts
export class MockClaudeProcess {
    private responses: Map<string, string> = new Map();

    setResponse(prompt: string, response: string): void {
        this.responses.set(prompt, response);
    }

    async sendMessage(message: string): Promise<string> {
        return this.responses.get(message) || 'Mock response';
    }
}
```

---

## Test Fixtures with Groq

Use Groq's fast LLM to generate realistic test fixtures that simulate Claude Code responses.

### Setup

1. **Store API key** in `.claude/.env` (gitignored):

```bash
GROQ_API_KEY=gsk_your_key_here
```

2. **Add to .gitignore**:

```gitignore
.claude/.env
```

### Fixture Generator

```typescript
// src/test/fixtures/generateFixtures.ts
import Groq from 'groq-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../../.claude/.env') });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

interface Fixture {
    id: string;
    type: string;
    input: string;
    metadata?: Record<string, unknown>;
}

const PROMPTS = [
    {
        id: 'markdown_basic',
        prompt: 'Explain async/await in JavaScript with examples',
        type: 'mixed'
    },
    {
        id: 'code_javascript',
        prompt: 'Write a function to debounce API calls',
        type: 'code'
    },
    // ... more prompts
];

async function generateFixture(prompt: typeof PROMPTS[0]): Promise<Fixture> {
    const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
            {
                role: 'system',
                content: 'You are a helpful coding assistant. Format responses with markdown.'
            },
            { role: 'user', content: prompt.prompt }
        ],
        max_tokens: 1000
    });

    return {
        id: `groq_${prompt.id}`,
        type: prompt.type,
        input: response.choices[0]?.message?.content || ''
    };
}

async function main() {
    const fixtures: Fixture[] = [];

    for (const prompt of PROMPTS) {
        const fixture = await generateFixture(prompt);
        fixtures.push(fixture);
    }

    // Add XSS test vectors
    fixtures.push(...getXSSTestVectors());

    const outputPath = path.join(__dirname, 'generated/claude-responses.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(fixtures, null, 2));
}

main();
```

### Using Fixtures in Tests

```typescript
import * as fs from 'fs';
import * as path from 'path';

suite('Fixture-Based Tests', () => {
    const fixtures = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, '../fixtures/generated/claude-responses.json'),
            'utf-8'
        )
    );

    fixtures.forEach((fixture: { id: string; input: string }) => {
        test(`should safely render ${fixture.id}`, () => {
            const result = formatContent(fixture.input);

            // XSS checks
            assert.ok(!result.includes('<script>'));
            assert.ok(!result.includes('<img '));
        });
    });
});
```

---

## Common Patterns

### Testing Async Operations

```typescript
test('should handle async correctly', async () => {
    const result = await someAsyncFunction();
    assert.ok(result);
});

// With timeout
test('should complete within timeout', async function() {
    this.timeout(5000);  // 5 second timeout
    await longRunningOperation();
});
```

### Testing Events

```typescript
test('should emit events', async () => {
    const events: string[] = [];

    myEmitter.onDidChange(e => events.push(e));

    await triggerChange();

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0], 'expected');
});
```

### Testing Error Handling

```typescript
test('should throw on invalid input', () => {
    assert.throws(
        () => myFunction(null),
        /Invalid input/
    );
});

test('should reject promise on error', async () => {
    await assert.rejects(
        async () => await asyncFunction('bad'),
        { message: /Error message/ }
    );
});
```

---

## Troubleshooting

### "describe is not defined"

VS Code tests use TDD syntax, not BDD:

```typescript
// WRONG (BDD)
describe('My Test', () => {
    it('should work', () => {});
});

// CORRECT (TDD)
suite('My Test', () => {
    test('should work', () => {});
});
```

### "Extension not found"

Check your extension ID matches `package.json`:

```json
{
    "publisher": "your-publisher",
    "name": "extension-name"
}
```

Extension ID is `publisher.extension-name`.

### Tests timeout

Increase timeout in test or suite:

```typescript
test('slow test', async function() {
    this.timeout(30000);  // 30 seconds
    // ...
});
```

### Can't access webview content

Webviews are isolated - use reference implementation pattern described above.

### Tests pass locally but fail in CI

Add these launch args:

```typescript
await runTests({
    launchArgs: [
        '--disable-extensions',
        '--disable-gpu',
        '--no-sandbox'  // Required for some CI environments
    ]
});
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npm run compile

      - name: Run tests
        run: xvfb-run -a npm test
        # xvfb-run required for VS Code's UI
```

---

## Summary

| Test Type | Location | Purpose |
|-----------|----------|---------|
| Unit Tests | `suite/*.test.ts` | Test isolated functions |
| Integration Tests | `suite/integrations.test.ts` | Test VS Code API interactions |
| Rendering Tests | `suite/rendering.test.ts` | Test webview content (via reference impl) |
| Fixtures | `fixtures/generated/` | Realistic test data from Groq |

**Key Points:**
- Use `suite`/`test` (TDD), not `describe`/`it` (BDD)
- Test webviews via reference implementations
- Generate fixtures with Groq for realistic test data
- Store API keys in `.claude/.env` (gitignored)
