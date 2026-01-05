# REQ-008: Stop Button for Processing Control

**Status:** COMPLETED
**Priority:** High
**Version:** 0.2.0
**Completed:** 2026-01-04

## Overview

Implement a visible stop button that allows users to interrupt Claude's processing at any time, similar to the Escape key functionality in Claude Code CLI.

## Requirements

### Functional Requirements

1. **Stop Button Display**
   - Show a red stop button (■ icon) when Claude is actively processing
   - Hide the send button during processing, replaced by stop button
   - Button should have visual feedback (pulsing animation)

2. **Keyboard Shortcut**
   - Escape key should also trigger stop while processing
   - Only active when input field is focused

3. **Stop Behavior**
   - Immediately terminate the Claude CLI process (SIGTERM)
   - Reset processing state in UI
   - Display "Stopping..." message in chat
   - Re-enable input for new messages

### Non-Functional Requirements

- Stop action should complete within 500ms
- Visual transition between send/stop buttons should be smooth
- Accessibility: button should have proper title/aria attributes

## Implementation

### Files Modified

1. **src/ui/webview/content.ts**
   - Added stop button HTML element next to send button
   - Added CSS for `.stop-btn` with red background and pulse animation
   - Added `.input-container.processing` styles to toggle button visibility
   - Added JavaScript handler for stop button click
   - Added Escape key handler for keyboard shortcut

2. **src/providers/chatViewProvider.ts**
   - `stopRequest` message handler already existed
   - `_stopProcessing()` method terminates Claude process

3. **src/claude/process.ts**
   - `stop()` method sends SIGTERM to child process

### UI/UX Design

```
┌─────────────────────────────────────────────┐
│  Normal State:                              │
│  [  Type message here...  ] [➤ Send]        │
│                                             │
│  Processing State:                          │
│  [  Type to inject...     ] [■ Stop]        │
│                            (pulsing red)    │
└─────────────────────────────────────────────┘
```

### CSS Classes

- `.stop-btn` - Red stop button with square icon
- `.stop-btn.hidden` - Hidden state (display: none)
- `.input-container.processing` - Processing state container
- `@keyframes pulse-stop` - Pulsing animation

## Testing

### Manual Test Cases

1. **TC-008-1**: Start a long-running Claude request, click stop button
   - Expected: Processing stops, UI resets to normal state

2. **TC-008-2**: Press Escape while Claude is processing
   - Expected: Same as clicking stop button

3. **TC-008-3**: Verify button visibility toggles correctly
   - Expected: Send visible when idle, Stop visible when processing

## Acceptance Criteria

- [x] Stop button appears during processing
- [x] Stop button is hidden when idle
- [x] Clicking stop terminates Claude process
- [x] Escape key triggers stop
- [x] UI resets to normal state after stop
- [x] "Stopping..." message displayed in chat

## Related Requirements

- REQ-009: Message Injection During Processing
