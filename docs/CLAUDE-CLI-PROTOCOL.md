# Claude CLI Streaming Protocol

This document describes how to properly spawn and communicate with the Claude Code CLI from a VS Code extension or Node.js application.

## Overview

Claude Code CLI supports two main modes of operation:
1. **Print mode (`--print` / `-p`)**: One-shot execution with a prompt
2. **Interactive mode**: Bidirectional streaming with `--input-format stream-json`

## Stream JSON Format

Claude uses Newline-Delimited JSON (NDJSON) for streaming communication. Each line is a complete JSON object.

### Output Message Types

| Type | Subtype | Description |
|------|---------|-------------|
| `system` | `init` | Session initialization with tools, model, session_id |
| `assistant` | - | Claude's response message with content array |
| `result` | `success`/`error` | Final completion status with usage stats |
| `user` | - | User message (when replayed) |

### Example Output Stream

```json
{"type":"system","subtype":"init","session_id":"abc-123","tools":["Bash","Read","Write"],"model":"claude-opus-4-5-20251101"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello!"}]}}
{"type":"result","subtype":"success","duration_ms":5000,"total_cost_usd":0.05}
```

## Spawning Claude from Node.js

### Critical Configuration: stdio

The most common issue when spawning Claude from Node.js is incorrect `stdio` configuration.

**DO NOT USE**: `stdio: ['pipe', 'pipe', 'pipe']` - This causes the process to hang!

**USE INSTEAD**:
```javascript
const child = spawn('claude', args, {
    stdio: ['inherit', 'pipe', 'pipe'],  // inherit stdin, pipe stdout/stderr
    // OR for bidirectional:
    stdio: ['pipe', 'pipe', 'pipe'],     // BUT with proper stdin handling
});
```

### Working Example: Print Mode

```javascript
const { spawn } = require('child_process');

// One-shot mode - simpler, no bidirectional communication needed
const child = spawn('claude', [
    '--output-format', 'stream-json',
    '--verbose',
    '--print', 'Your prompt here'
], {
    cwd: '/path/to/workspace',
    stdio: ['inherit', 'pipe', 'pipe'],  // KEY: inherit stdin
    env: {
        ...process.env,
        FORCE_COLOR: '0'  // Disable color codes in output
    }
});

child.stdout.on('data', (data) => {
    // Parse NDJSON lines
    const lines = data.toString().split('\n');
    for (const line of lines) {
        if (line.trim()) {
            try {
                const message = JSON.parse(line);
                console.log('Message type:', message.type);
            } catch (e) {
                console.log('Non-JSON output:', line);
            }
        }
    }
});

child.stderr.on('data', (data) => {
    console.error('Claude stderr:', data.toString());
});

child.on('exit', (code) => {
    console.log('Claude exited with code:', code);
});
```

### Working Example: Bidirectional Streaming

For persistent sessions with multiple turns:

```javascript
const { spawn } = require('child_process');

const child = spawn('claude', [
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--verbose',
    '--include-partial-messages'
], {
    cwd: '/path/to/workspace',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
        ...process.env,
        FORCE_COLOR: '0'
    }
});

// IMPORTANT: If using pipe for stdin, you MUST send messages or close stdin
// Send a user message
const userMessage = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: 'Hello, Claude!' }
});
child.stdin.write(userMessage + '\n');

// Handle responses
child.stdout.on('data', (data) => {
    // Process NDJSON lines...
});
```

## Official VS Code Extension Arguments

The official Claude Code VS Code extension spawns the CLI with these arguments:

```
claude --output-format stream-json --verbose --input-format stream-json \
    --max-thinking-tokens 0 --model default --permission-prompt-tool stdio \
    --setting-sources user,project,local --permission-mode default \
    --include-partial-messages --debug --debug-to-stderr --enable-auth-status
```

### Key Flags Explained

| Flag | Description |
|------|-------------|
| `--output-format stream-json` | Output NDJSON format |
| `--input-format stream-json` | Accept NDJSON input via stdin |
| `--verbose` | Required when using stream-json with --print |
| `--include-partial-messages` | Stream partial responses for real-time display |
| `--permission-prompt-tool stdio` | Handle permission prompts via stdin/stdout |
| `--max-thinking-tokens 0` | Disable extended thinking (faster responses) |

## Common Issues and Solutions

### Issue 1: Process Hangs Indefinitely

**Cause**: Using `stdio: ['pipe', 'pipe', 'pipe']` without sending any stdin data.

**Solution**: Either:
1. Use `stdio: ['inherit', 'pipe', 'pipe']` for print mode
2. Or send data to stdin immediately and/or close it when done

### Issue 2: No Output Received

**Cause**: Missing `--verbose` flag when using `--output-format stream-json` with `--print`.

**Solution**: Always include `--verbose` with stream-json in print mode.

### Issue 3: JSON Parse Errors on Windows

**Cause**: ANSI color codes in output on Windows (versions 2.0.62-2.0.73).

**Solution**: Set `FORCE_COLOR: '0'` in the environment.

### Issue 4: Process Spawns But No stdout Events

**Cause**: The stdout event handlers might not be attached before the process starts outputting.

**Solution**: Attach event handlers immediately after spawn, before any async operations.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `FORCE_COLOR=0` | Disable ANSI color codes |
| `ANTHROPIC_API_KEY` | API key (leave empty to use default auth) |

## Session Management

### Resuming Sessions

Use `--resume <session-id>` to continue a previous conversation:

```javascript
const args = [
    '--output-format', 'stream-json',
    '--verbose',
    '--print', 'Follow up question',
    '--resume', 'previous-session-uuid'
];
```

### Forking Sessions

Use `--fork-session` with `--resume` to create a new session branching from an existing one.

## Message Type Reference

### System Init Message

```typescript
interface SystemInitMessage {
    type: 'system';
    subtype: 'init';
    cwd: string;
    session_id: string;
    tools: string[];
    mcp_servers: Array<{name: string; status: string}>;
    model: string;
    permissionMode: string;
    claude_code_version: string;
}
```

### Assistant Message

```typescript
interface AssistantMessage {
    type: 'assistant';
    message: {
        model: string;
        id: string;
        role: 'assistant';
        content: Array<{type: string; text?: string}>;
        stop_reason: string | null;
        usage: {
            input_tokens: number;
            output_tokens: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
        };
    };
    session_id: string;
    uuid: string;
}
```

### Result Message

```typescript
interface ResultMessage {
    type: 'result';
    subtype: 'success' | 'error';
    is_error: boolean;
    duration_ms: number;
    num_turns: number;
    result: string;
    session_id: string;
    total_cost_usd: number;
    usage: object;
}
```

## Sources

- [GitHub Issue #771: Claude Code can't be spawned from Node.js](https://github.com/anthropics/claude-code/issues/771)
- [Claude Flow Wiki: Stream-JSON Chaining](https://github.com/ruvnet/claude-flow/wiki/Stream-Chaining)
- [Claude Code VS Code Extension Source (minified)](~/.vscode/extensions/anthropic.claude-code-*/extension.js)
