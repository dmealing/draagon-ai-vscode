# REQ-001: Core VS Code Extension

**Priority:** Critical
**Estimated Effort:** 1 week
**Dependencies:** None
**Blocks:** All other extension features

---

## 1. Overview

### 1.1 Vision
A VS Code extension that provides a beautiful chat interface for AI-assisted coding, with intelligent routing between Claude Code CLI, Groq fast-path, and Draagon AgentLoop.

### 1.2 Goals
- Provide chat UI similar to claude-code-chat quality
- Integrate Claude Code CLI for full tool access
- Enable future multi-LLM routing
- Support Draagon Memory MCP integration

### 1.3 Success Metrics
- Extension installs and activates in VS Code
- Chat messages send/receive correctly
- Claude Code CLI spawns and streams responses
- Basic tool output displays (text, code blocks)

---

## 2. Requirements

### 2.1 Extension Activation

**ID:** REQ-001-01

#### Description
VS Code extension that activates on command and provides sidebar panel.

#### Acceptance Criteria
- [ ] Extension activates via command palette
- [ ] Extension activates via keyboard shortcut (Ctrl+Shift+D)
- [ ] Sidebar panel opens with chat interface
- [ ] Extension icon appears in activity bar

---

### 2.2 Webview Chat Interface

**ID:** REQ-001-02

#### Description
HTML/CSS/JS webview providing chat interface.

#### UI Components
- Header with title, version, status indicators
- Message list (scrollable)
- Input area with textarea and send button
- Model selector dropdown
- Settings button

#### Message Types
- User messages (right-aligned or distinct style)
- Assistant messages (with markdown rendering)
- System messages (status updates, errors)
- Tool use messages (collapsible)

#### Acceptance Criteria
- [ ] Messages display with proper styling
- [ ] Markdown renders correctly (code blocks, lists, etc.)
- [ ] Auto-scroll on new messages
- [ ] Input textarea auto-resizes
- [ ] Send on Enter (Shift+Enter for newline)

---

### 2.3 Claude Code CLI Integration

**ID:** REQ-001-03

#### Description
Spawn and communicate with Claude Code CLI process.

#### Process Management
```typescript
interface ClaudeProcess {
  spawn(options: SpawnOptions): void;
  send(message: UserMessage): void;
  onMessage(handler: (msg: AssistantMessage) => void): void;
  onError(handler: (err: Error) => void): void;
  kill(): void;
}
```

#### CLI Arguments
```bash
claude --output-format stream-json --verbose --input-format stream-json
```

#### Message Protocol
Input (to stdin):
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "Hello"
  }
}
```

Output (from stdout):
```json
{"type": "assistant", "message": {...}}
{"type": "result", "subtype": "success", ...}
```

#### Acceptance Criteria
- [ ] Claude process spawns successfully
- [ ] Messages stream in real-time
- [ ] Process handles errors gracefully
- [ ] Process terminates on extension deactivate

---

### 2.4 Message Parsing & Display

**ID:** REQ-001-04

#### Description
Parse Claude's stream-json output and render appropriately.

#### Message Types to Handle
| Type | Display |
|------|---------|
| `text` | Rendered markdown |
| `thinking` | Collapsible thinking block |
| `tool_use` | Tool execution card |
| `tool_result` | Result display (collapsible) |

#### Acceptance Criteria
- [ ] Text content renders as markdown
- [ ] Code blocks have syntax highlighting
- [ ] Thinking blocks are collapsible
- [ ] Tool use shows tool name and inputs
- [ ] Long outputs are truncated with "show more"

---

### 2.5 Basic Tool Display

**ID:** REQ-001-05

#### Description
Display common tool executions nicely.

#### Tools to Support Initially
| Tool | Display |
|------|---------|
| Read | File path, line count |
| Write | File path, diff preview |
| Edit | File path, before/after diff |
| Bash | Command, output (truncated) |
| Glob/Grep | Results list |

#### Acceptance Criteria
- [ ] Each tool type has distinct visual
- [ ] File paths are clickable (open in editor)
- [ ] Diffs show with syntax highlighting
- [ ] Long outputs truncate with expand option

---

### 2.6 Error Handling

**ID:** REQ-001-06

#### Description
Handle errors gracefully at all levels.

#### Error Types
- Claude CLI not installed
- Claude CLI crashes
- Network errors
- Parse errors
- Permission errors

#### Acceptance Criteria
- [ ] Clear error messages displayed to user
- [ ] Suggestions for resolution shown
- [ ] Extension doesn't crash on errors
- [ ] Errors logged for debugging

---

### 2.7 Configuration

**ID:** REQ-001-07

#### Description
VS Code settings for extension configuration.

#### Settings
```json
{
  "draagon.claude.path": "claude",
  "draagon.claude.model": "default",
  "draagon.memory.enabled": true,
  "draagon.memory.mcpUrl": "http://localhost:8080",
  "draagon.routing.enabled": false,
  "draagon.groq.apiKey": ""
}
```

#### Acceptance Criteria
- [ ] Settings appear in VS Code settings UI
- [ ] Settings are read on activation
- [ ] Settings changes take effect without restart

---

## 3. Technical Design

### 3.1 File Structure

```
extensions/vscode/
├── src/
│   ├── extension.ts           # Entry point, activation
│   ├── providers/
│   │   └── chatViewProvider.ts # Webview provider
│   ├── claude/
│   │   ├── process.ts         # CLI process management
│   │   ├── parser.ts          # Message parsing
│   │   └── types.ts           # TypeScript types
│   ├── ui/
│   │   ├── webview/
│   │   │   ├── index.html     # Main HTML
│   │   │   ├── script.ts      # Frontend JS
│   │   │   └── styles.css     # Styles
│   │   └── components/        # Reusable UI components
│   └── utils/
│       ├── markdown.ts        # Markdown rendering
│       └── diff.ts            # Diff display
├── package.json               # Extension manifest
├── tsconfig.json
└── README.md
```

### 3.2 Extension Entry Point

```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { ChatViewProvider } from './providers/chatViewProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new ChatViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('draagon.chatView', provider),
    vscode.commands.registerCommand('draagon.openChat', () => {
      vscode.commands.executeCommand('draagon.chatView.focus');
    }),
    vscode.commands.registerCommand('draagon.newSession', () => {
      provider.newSession();
    })
  );
}
```

### 3.3 Message Flow

```
User Input
    │
    ▼
Webview (postMessage)
    │
    ▼
ChatViewProvider
    │
    ▼
ClaudeProcess.send()
    │
    ▼
Claude CLI (stdin)
    │
    ▼
Claude CLI (stdout) ──stream──▶ Parser ──▶ Webview (postMessage)
```

---

## 4. Testing

### 4.1 Unit Tests
- Message parsing
- Markdown rendering
- Configuration loading

### 4.2 Integration Tests
- Claude CLI spawning
- Full message round-trip
- Error handling scenarios

### 4.3 Manual Tests
- Install in VS Code
- Send messages, verify responses
- Test with various Claude tools
- Test error scenarios

---

## 5. Acceptance Checklist

- [ ] Extension installs from VSIX
- [ ] Chat interface opens in sidebar
- [ ] Messages send to Claude CLI
- [ ] Responses stream in real-time
- [ ] Markdown renders correctly
- [ ] Tool outputs display appropriately
- [ ] Errors handled gracefully
- [ ] Settings configurable
