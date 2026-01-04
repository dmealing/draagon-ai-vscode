# Draagon AI - VS Code Extension

Beautiful AI-powered coding assistant with intelligent multi-LLM routing, shared memory, and custom agents.

## Features

### 🎯 Intelligent Request Routing
- **Fast queries** → Groq Llama-8B (~100ms, nearly free)
- **Code tasks** → Claude Code CLI (full tool access)
- **Deep reasoning** → Draagon AgentLoop (memory, learning)

### 🧠 Shared Memory
- Memories persist across sessions
- Share context with Roxy and other Draagon apps
- Learn from successful interactions
- Belief reconciliation for conflicting info

### 🤖 Custom AI Agents
- Code Reviewer (Groq-powered)
- Security Scanner
- Documentation Generator
- Test Writer
- Create your own agents

### 💬 Full Claude Code Integration
- All Claude Code tools available
- File editing with diffs
- Terminal commands
- Interactive questions (AskUserQuestion)
- Plan mode visualization

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
  // Claude Code
  "draagon.claude.path": "claude",
  "draagon.claude.model": "default",

  // Multi-LLM Routing
  "draagon.routing.enabled": true,
  "draagon.groq.apiKey": "gsk_xxx",

  // Memory Integration
  "draagon.memory.enabled": true,
  "draagon.memory.serverCommand": "python -m draagon_ai.mcp.server",

  // Custom Agents
  "draagon.agents.custom": []
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
│  │   Chat Panel    │  │  Memory Panel   │  │  Agent Panel    │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │          │
│           └────────────────────┼────────────────────┘          │
│                                ▼                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                   Request Router                         │  │
│  │      Simple → Groq | Code → Claude | Complex → Draagon  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                │                               │
│           ┌────────────────────┼────────────────────┐         │
│           ▼                    ▼                    ▼         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │   Claude Code   │  │   Groq API      │  │  Draagon AI     ││
│  │   CLI Process   │  │   (fast path)   │  │  AgentLoop      ││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘│
│                                │                               │
│                                ▼                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Draagon Memory MCP Server                   │  │
│  │    (shared with Roxy, mobile app, other extensions)      │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Requirements

- VS Code 1.85.0+
- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- Groq API key (for fast-path routing)
- Draagon AI (for memory and AgentLoop)

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
