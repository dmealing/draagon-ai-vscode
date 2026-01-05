# Draagon AI - VS Code Extension

Beautiful AI-powered coding assistant that wraps Claude Code CLI with enhanced UI features, conversation history, thinking modes, and more.

## Features

### 💬 Full Claude Code Integration
- All Claude Code tools available
- File editing with inline diffs
- Terminal commands
- Interactive questions (AskUserQuestion)
- Plan mode visualization
- Session management and resume

### 🧠 Thinking Modes
- **Default** - Standard Claude response
- **Think** - Enable extended thinking
- **Think Hard** - More thorough reasoning
- **Think Harder** - Deep analysis
- **Ultrathink** - Maximum reasoning depth

### 📜 Conversation History
- Persistent conversation storage
- Search across past conversations
- Resume previous sessions
- Export conversations

### 🖼️ Image Support
- Paste images directly into chat
- Drag and drop images
- Clipboard image support
- Image preview and management

### 🔒 Permission System
- Fine-grained tool permissions
- Session-based approvals
- YOLO mode for trusted workflows
- Safe tool allowlists

### 💾 Automatic Checkpoints
- Git-based checkpoint system
- Restore to previous states
- Auto-checkpoint before AI changes
- Configurable retention

### 🤖 Background Agents
- Code review agent
- Security scanner
- PR review with parallel analysis
- Custom agent definitions

---

## Coming Soon

> The following features are planned for future releases via Draagon MCP integration:

### 🎯 Multi-LLM Routing (Planned)
- Fast queries → Groq fast-path routing
- Deep reasoning → Draagon AgentLoop
- Intelligent request classification

### 🧠 Shared Memory (Planned)
- Persistent memory across sessions
- Context sharing with other Draagon apps
- Learning from interactions

## Installation

```bash
# From source
cd extensions/vscode
npm install
npm run compile
npm run package

# Install VSIX
code --install-extension draagon-ai-0.1.0.vsix
```

## Configuration

```json
{
  // Claude Code CLI
  "draagon.claude.path": "claude",
  "draagon.claude.model": "default",

  // Thinking Modes
  "draagon.thinkingMode.default": "default",
  "draagon.thinkingMode.showIndicator": true,

  // Conversation History
  "draagon.history.enabled": true,
  "draagon.history.maxConversations": 100,

  // Permissions
  "draagon.permissions.yoloMode": false,
  "draagon.permissions.safeTools": ["Read", "Glob", "Grep", "LS", "Task", "TodoRead"],

  // Checkpoints
  "draagon.backup.enabled": true,
  "draagon.backup.autoCheckpoint": true,

  // Background Agents
  "draagon.agents.codeReview.enabled": true,
  "draagon.agents.securityScan.enabled": true
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+D` | Open Draagon Chat |
| `Ctrl+Shift+R` | Run Code Review |
| `Ctrl+Shift+S` | Run Security Scan |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Draagon VS Code Extension                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Chat Panel    │  │  History View   │  │  Agent Panel    │ │
│  │   (Webview)     │  │  (Tree View)    │  │  (Tree View)    │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │          │
│           └────────────────────┼────────────────────┘          │
│                                ▼                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                   Extension Core                          │  │
│  │   Permissions | History | Checkpoints | Thinking Modes   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                │                               │
│                                ▼                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                   Claude Code CLI                         │  │
│  │         stream-json output | All Claude tools            │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  │
│                      PLANNED (Coming Soon)                      │
│  ┌─────────────────┐  ┌─────────────────┐                     │
│  │   Groq Router   │  │  Draagon MCP    │                     │
│  │  (fast-path)    │  │  (memory/AI)    │                     │
│  └─────────────────┘  └─────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

## Requirements

- VS Code 1.96.0+
- Claude Code CLI installed and authenticated (`npm install -g @anthropic-ai/claude-code`)

> **Note:** Groq API and Draagon AI integrations are not required for core functionality. These are planned for future releases.

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Package VSIX
npm run package

# Run tests
npm test
```

## Documentation

See `docs/requirements/` for detailed specifications:

- [REQ-001: Core Extension](docs/requirements/REQ-001-CORE-EXTENSION.md)
- [REQ-002: AskUserQuestion](docs/requirements/REQ-002-ASK-USER-QUESTION.md)
- [REQ-003: Multi-LLM Routing](docs/requirements/REQ-003-MULTI-LLM-ROUTING.md)
- [REQ-004: Memory Integration](docs/requirements/REQ-004-MEMORY-INTEGRATION.md)
- [REQ-005: Plan Mode](docs/requirements/REQ-005-PLAN-MODE.md)
- [REQ-006: Image Display](docs/requirements/REQ-006-IMAGE-DISPLAY.md)
- [REQ-007: Background Agents](docs/requirements/REQ-007-BACKGROUND-AGENTS.md)
- [REQ-008: Custom AI Agents](docs/requirements/REQ-008-CUSTOM-AI-AGENTS.md)

## License

AGPL-3.0 - See [LICENSE](../../LICENSE) for details.

Part of the [Draagon AI](https://github.com/Draagon/draagon-ai) framework.
