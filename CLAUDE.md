# draagon-ai-vscode - Claude Context

**Last Updated:** 2026-01-04
**Version:** 0.1.0
**Project:** VS Code extension for Draagon AI cognitive assistant integration

---

## Project Overview

draagon-ai-vscode is a VS Code extension that provides deep integration with the Draagon AI cognitive framework. It enables developers to interact with AI assistants directly within their IDE, with features like:

- **Chat Interface** - Conversational AI with context-aware responses
- **Memory Integration** - Persistent memory across sessions via draagon-ai
- **Multi-LLM Routing** - Intelligent routing to appropriate AI models
- **Plan Mode** - Structured planning for complex development tasks
- **Background Agents** - Autonomous agents for research and analysis
- **MCP Server Support** - Model Context Protocol integration

### Related Projects

- **draagon-ai** (`../draagon-ai/`) - Core cognitive AI framework (Python)
- This extension communicates with draagon-ai services for memory and cognition

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

### Running Tests

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run tests (launches VS Code test instance)
npm test

# Run linting
npm run lint
```

### Test Structure

```
src/test/
├── runTest.ts           # Test runner setup
└── suite/
    ├── index.ts         # Test suite loader
    └── extension.test.ts # Extension tests
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

## Configuration

The extension adds these VS Code settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `draagon.apiKey` | string | - | API key for AI providers |
| `draagon.memoryEndpoint` | string | `localhost:8000` | draagon-ai memory service |
| `draagon.defaultModel` | string | `claude-sonnet-4` | Default LLM model |
| `draagon.enableThinking` | boolean | `true` | Show thinking process |

---

## Integration with draagon-ai

### Memory Client

The extension connects to draagon-ai's memory service:

```typescript
import { MemoryClient } from './memory/client';

const client = new MemoryClient({
  endpoint: config.memoryEndpoint,
  apiKey: config.apiKey,
});

// Store memory
await client.store({
  content: 'User prefers dark mode',
  type: 'PREFERENCE',
  importance: 0.9,
});

// Retrieve relevant memories
const memories = await client.search('user preferences');
```

### LLM Routing

Uses draagon-ai's model routing logic:

```typescript
import { Router } from './routing/router';

const router = new Router();

// Route based on complexity
const model = router.selectModel({
  query: 'Explain quantum computing',
  complexity: 'high',
  budget: 'standard',
});
```

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
