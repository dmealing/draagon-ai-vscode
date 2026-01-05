# draagon-ai-vscode - Claude Context

**Last Updated:** 2026-01-04 (Development Testing section added)
**Version:** 0.1.0
**Project:** VS Code extension for Draagon AI cognitive assistant integration

---

## Project Overview

draagon-ai-vscode is a VS Code extension that wraps the Claude Code CLI with enhanced UI features. It enables developers to interact with Claude directly within their IDE.

### Current Features (v0.2.0)

- **Chat Interface** - Full Claude Code CLI integration with stream-json parsing
- **Thinking Modes** - Default, Think, ThinkHard, ThinkHarder, Ultrathink
- **Conversation History** - Persistent storage, search, and resume
- **Permission System** - Fine-grained tool approval with YOLO mode option
- **Image Support** - Paste/drop images into chat with clipboard support
- **Inline Diff Viewer** - Code changes displayed with VS Code diff editor
- **Automatic Checkpoints** - Git-based backup before AI changes
- **Background Agents** - Code review, security scanning, PR review
- **WSL Support** - Run Claude CLI via WSL on Windows

### Deferred Features (Coming Soon)

> These features have code scaffolding but are not yet functional:

- **Multi-LLM Routing** - Groq fast-path routing (disabled in settings)
- **Memory Integration** - Draagon AI memory service (disabled in settings)

These will be enabled in a future release via Draagon MCP integration.

### Related Projects

- **draagon-ai** (`../draagon-ai/`) - Core cognitive AI framework (Python) - future integration

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     VS Code Extension                            │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Chat View   │  │ Memory View  │  │    Agents View       │  │
│  │  (Webview)   │  │  (Webview)   │  │    (Webview)         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│          │                │                    │                 │
│          ▼                ▼                    ▼                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Extension Core                         │   │
│  │   Claude Process | Session Manager | LLM Router          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                       │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  External Services                       │   │
│  │   MCP Servers | draagon-ai Memory | AI Providers        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
draagon-ai-vscode/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── agents/               # Background agent orchestration
│   │   ├── orchestrator.ts   # Multi-agent coordination
│   │   └── prReview.ts       # PR review agent
│   ├── claude/               # Claude process management
│   │   ├── process.ts        # Spawn and manage Claude CLI
│   │   └── types.ts          # Type definitions
│   ├── memory/               # Memory integration
│   │   └── client.ts         # draagon-ai memory client
│   ├── mcp/                  # Model Context Protocol
│   │   └── serverManager.ts  # MCP server lifecycle
│   ├── providers/            # VS Code view providers
│   │   ├── chatViewProvider.ts
│   │   ├── memoryViewProvider.ts
│   │   └── agentsViewProvider.ts
│   ├── routing/              # LLM routing
│   │   └── router.ts         # Model selection logic
│   ├── sessions/             # Session management
│   │   └── manager.ts        # Conversation sessions
│   └── ui/                   # UI components
│       └── webview/          # Webview content
├── resources/                # Icons and assets
├── docs/                     # Documentation
│   └── requirements/         # REQ-xxx requirement docs
├── .specify/                 # Specification kit
│   ├── constitution.md       # Project principles
│   ├── requirements/         # FR-xxx requirements
│   └── planning/             # Implementation plans
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
└── CLAUDE.md                 # This file
```

---

## Development Guidelines

### TypeScript Standards

- **Strict mode enabled** - No implicit any, strict null checks
- **ES2022 target** - Modern JavaScript features
- **ESM modules** - Use ES module syntax

### Code Patterns

```typescript
// Use async/await for all async operations
async function fetchMemory(query: string): Promise<Memory[]> {
  const client = await getMemoryClient();
  return client.search(query);
}

// Use discriminated unions for message types
type Message =
  | { type: 'user'; content: string }
  | { type: 'assistant'; content: string; thinking?: string }
  | { type: 'tool_use'; name: string; args: unknown };

// Disposable pattern for cleanup
class SessionManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
```

### Extension API Usage

```typescript
// Register commands
context.subscriptions.push(
  vscode.commands.registerCommand('draagon.startChat', startChat)
);

// Create webview panels
const panel = vscode.window.createWebviewPanel(
  'draagonChat',
  'Draagon AI',
  vscode.ViewColumn.Beside,
  { enableScripts: true, retainContextWhenHidden: true }
);

// Use workspace configuration
const config = vscode.workspace.getConfiguration('draagon');
const apiKey = config.get<string>('apiKey');
```

### Error Handling

```typescript
// Always provide user-friendly error messages
try {
  await connectToMemoryService();
} catch (error) {
  vscode.window.showErrorMessage(
    `Failed to connect to Draagon AI: ${error instanceof Error ? error.message : 'Unknown error'}`
  );
  logger.error('Memory connection failed', { error });
}
```

---

## Testing

### Environment Variables

API keys are stored in `.env.local` (gitignored):

```
.env.local
├── GROQ_API_KEY    # For e2e tests with Groq as user simulator
```

### Running Tests

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run tests (launches VS Code test instance)
npm test

# Run with e2e tests (Groq simulates Claude-like responses, tests rendering)
GROQ_API_KEY="your-key-here" npm test

# Run with REAL Claude Code CLI integration (costs money, slower)
GROQ_API_KEY="your-key" E2E_REAL_CLAUDE=true npm test

# Run linting
npm run lint
```

Note: Environment variables must be passed inline as shown above. The `source .env.local` approach doesn't work because VS Code's extension host runs in a separate process.

### Test Structure

```
src/test/
├── runTest.ts           # Test runner setup
├── e2e/
│   ├── testHarness.ts   # E2E test harness (Groq + Claude)
│   └── scenarios.ts     # Test scenarios
├── fixtures/
│   ├── generateFixtures.ts  # Groq fixture generator
│   └── validateFixtures.ts  # Fixture validation
└── suite/
    ├── index.ts         # Test suite loader
    ├── extension.test.ts # Extension tests
    ├── e2e.test.ts      # E2E tests with Groq
    └── rendering.test.ts # Webview rendering tests
```

### Writing Tests

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('draagon.draagon-ai-vscode');
    assert.ok(ext);
    await ext.activate();
    assert.ok(ext.isActive);
  });
});
```

---

## Building and Packaging

```bash
# Compile for development
npm run compile

# Watch mode for development
npm run watch

# Package for distribution
npx vsce package

# Publish to marketplace
npx vsce publish
```

---

## Development Testing

### Quick Launch (Most Common)

Use this one-liner to compile and launch the extension for testing:

```bash
# Compile and launch in Extension Development Mode (opens this workspace)
npm run compile && code --extensionDevelopmentPath=/home/doug/Development/draagon-ai-vscode /home/doug/Development/draagon-ai-vscode &
```

This compiles TypeScript, then launches VS Code with the extension loaded, opening this project as the workspace.

### Extension Development Mode (Recommended)

When developing the extension, **always use Extension Development Mode** to test changes. This launches an isolated VS Code instance that loads your extension directly from source, avoiding conflicts with other running VS Code instances.

```bash
# Launch VS Code in Extension Development Mode (no workspace)
code --extensionDevelopmentPath=/home/doug/Development/draagon-ai-vscode --new-window
```

**Why use this approach:**
- Avoids conflicts with installed extensions in other VS Code windows
- Loads the extension directly from compiled source (`./out/`)
- Provides better error messages and debugging capabilities
- This is the standard VS Code extension development workflow

### Development Workflow

```bash
# 1. Make changes to TypeScript files

# 2. Compile the extension
npm run compile

# 3. Launch in development mode (new window)
code --extensionDevelopmentPath=/home/doug/Development/draagon-ai-vscode --new-window

# 4. Test your changes in the new window
```

### Watch Mode Development

For rapid iteration, use watch mode in one terminal while testing in another:

```bash
# Terminal 1: Start watch mode
npm run watch

# Terminal 2: Launch extension development window
code --extensionDevelopmentPath=/home/doug/Development/draagon-ai-vscode --new-window

# After making changes, reload the development window (Ctrl+R / Cmd+R)
```

### Common Issue: "Command not found"

If you see "command 'draagon.xxx' not found" errors:
1. **Check for other VS Code instances** - Close other windows or use `--new-window`
2. **Ensure compilation succeeded** - Run `npm run compile` and check for errors
3. **Use Extension Development Mode** - Don't install the VSIX while developing

---

## Configuration

The extension adds these VS Code settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `draagon.apiKey` | string | - | API key for AI providers |
| `draagon.memoryEndpoint` | string | `localhost:8000` | draagon-ai memory service |
| `draagon.defaultModel` | string | `claude-sonnet-4` | Default LLM model |
| `draagon.enableThinking` | boolean | `true` | Show thinking process |

---

## Integration with draagon-ai (DEFERRED)

> **Note:** The following integrations are scaffolded but not yet functional.
> They will be enabled in a future release via Draagon MCP.

### Memory Client (Coming Soon)

The code exists to connect to draagon-ai's memory service but is currently disabled:

```typescript
// src/memory/client.ts - exists but not initialized
import { MemoryClient } from './memory/client';

// This would store memories when enabled:
await client.store({
  content: 'User prefers dark mode',
  type: 'PREFERENCE',
  importance: 0.9,
});
```

### LLM Routing (Coming Soon)

The routing logic exists but is currently disabled:

```typescript
// src/routing/router.ts - exists but not initialized
// Settings show "Coming Soon" deprecation message
// routing.enabled defaults to false and has no effect
```

### Current Integration

The extension currently integrates only with:

- **Claude Code CLI** - Spawned as child process with `--output-format stream-json`
- **VS Code APIs** - Webviews, tree views, configuration, commands

---

## Webview Security

All webviews follow VS Code security best practices:

```typescript
// Use CSP in webviews
function getWebviewContent(webview: vscode.Webview): string {
  const nonce = getNonce();
  return `<!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}';
        img-src ${webview.cspSource} https:;
      ">
    </head>
    <body>
      <script nonce="${nonce}">
        // Webview script
      </script>
    </body>
    </html>`;
}
```

---

## Common Tasks

### Adding a New Command

1. Add command to `package.json` contributes.commands
2. Register handler in `extension.ts`
3. Add keybinding if needed in contributes.keybindings

### Adding a New View

1. Create provider in `src/providers/`
2. Register in `extension.ts`
3. Add to `package.json` contributes.views

### Adding a New Setting

1. Add to `package.json` contributes.configuration
2. Read via `vscode.workspace.getConfiguration('draagon')`

---

## Troubleshooting

### Extension not activating

- Check Output panel > "Draagon AI" for errors
- Verify all dependencies installed: `npm install`
- Rebuild: `npm run compile`

### Memory connection issues

- Ensure draagon-ai service is running
- Check endpoint configuration
- Verify API key is set

### Webview not loading

- Check Developer Tools (Help > Toggle Developer Tools)
- Verify CSP headers are correct
- Check for JavaScript errors

---

**End of CLAUDE.md**
