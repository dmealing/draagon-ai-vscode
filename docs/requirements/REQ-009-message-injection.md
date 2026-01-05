# REQ-009: Message Injection During Processing

**Status:** COMPLETED
**Priority:** High
**Version:** 0.2.0
**Completed:** 2026-01-04

## Overview

Allow users to inject additional messages into an ongoing Claude conversation without stopping the current processing. This mirrors the Claude Code CLI behavior where users can type while Claude is working to provide additional context or instructions.

## Requirements

### Functional Requirements

1. **Input During Processing**
   - Input field remains enabled while Claude is processing
   - Placeholder text changes to indicate injection mode
   - Users can type and submit messages during processing

2. **Message Injection**
   - Submitted messages are sent to Claude via stdin
   - Messages appear in chat with injection indicator (↪ prefix)
   - Messages are tracked in conversation history with [Injected] tag

3. **Process Communication**
   - Use stdin to send user input to running Claude CLI process
   - Format: `{"type": "user_input", "content": "..."}`
   - Confirmation sent back to UI when injection received

### Non-Functional Requirements

- Injection should be delivered within 100ms
- Should not interrupt Claude's current output stream
- Graceful fallback if process stdin is not writable

## Implementation

### Files Modified

1. **src/ui/webview/content.ts**
   - Track `isCurrentlyProcessing` state variable
   - Modified `sendMessage()` to detect processing state
   - Send `injectMessage` type when processing, `sendMessage` when idle
   - Updated placeholder text during processing
   - Injected messages prefixed with ↪ in chat display

2. **src/providers/chatViewProvider.ts**
   - Added `injectMessage` case in message handler
   - New `_injectMessage()` method:
     - Falls back to normal message if not processing
     - Calls `claudeProcess.injectMessage()`
     - Tracks in history with [Injected] prefix
     - Sends `injectionReceived` confirmation

3. **src/claude/process.ts**
   - Added `injectMessage(text: string)` method
   - Writes JSON to process stdin
   - Format matches Claude Code CLI user input protocol

### Message Flow

```
┌──────────────┐    injectMessage     ┌───────────────────┐
│   Webview    │ ──────────────────▶ │ ChatViewProvider  │
└──────────────┘                      └───────────────────┘
                                              │
                                              │ _injectMessage()
                                              ▼
                                      ┌───────────────────┐
                                      │   ClaudeProcess   │
                                      └───────────────────┘
                                              │
                                              │ stdin.write()
                                              ▼
                                      ┌───────────────────┐
                                      │  Claude CLI       │
                                      │  (subprocess)     │
                                      └───────────────────┘
```

### stdin Protocol

```json
{"type": "user_input", "content": "Please also check the tests"}
```

## UI/UX Design

### Processing State Indicators

1. **Input Placeholder**: "Type to inject message into conversation... (Escape to stop)"
2. **Border Color**: Accent color to indicate active processing
3. **Message Prefix**: ↪ character indicates injected message

### Chat Display

```
┌─────────────────────────────────────────────┐
│ You: Implement the login feature            │
│                                             │
│ Claude: I'll implement the login feature... │
│ 🔧 Edit: src/auth/login.ts                  │
│                                             │
│ ↪ You: Also add password validation         │
│        (injected during processing)         │
│                                             │
│ Claude: Good point! Adding validation...    │
└─────────────────────────────────────────────┘
```

## Testing

### Manual Test Cases

1. **TC-009-1**: Send message while Claude is processing
   - Expected: Message injected, appears with ↪ prefix

2. **TC-009-2**: Press Enter with text during processing
   - Expected: Same as TC-009-1

3. **TC-009-3**: Inject message when not processing
   - Expected: Falls back to normal message send

4. **TC-009-4**: Verify history tracking
   - Expected: Injected messages have [Injected] prefix in history

## Acceptance Criteria

- [x] Input enabled during processing
- [x] Placeholder text changes during processing
- [x] Messages can be submitted during processing
- [x] Injected messages sent via stdin to Claude
- [x] Visual indicator (↪) for injected messages
- [x] History tracks injected messages
- [x] Fallback to normal send if not processing

## Related Requirements

- REQ-008: Stop Button for Processing Control
