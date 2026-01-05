# REQ-002: Inline Diff Viewer

**Status:** COMPLETED
**Version:** 0.2.0
**Completed:** 2026-01-04

## Overview
Display inline diffs in the chat when Claude performs Edit, MultiEdit, or Write operations, allowing users to see exactly what changed.

## Priority
**HIGH** - Essential for code review workflow

## User Stories

### US-001: View Changes Inline
As a user, I want to see a diff of what Claude changed directly in the chat, so I can quickly review modifications without switching contexts.

### US-002: Open in Diff Editor
As a user, I want to click a button to open the full diff in VS Code's native side-by-side diff editor, so I can do detailed review.

### US-003: Syntax Highlighting
As a user, I want the diff to have syntax highlighting for additions (green) and deletions (red), so changes are visually clear.

## Functional Requirements

### FR-001: Capture File State
- Read file content BEFORE tool execution
- Read file content AFTER tool execution (from tool result)
- Store both states for diff generation

### FR-002: Diff Display
- Show unified diff format in chat
- Green background for additions (+)
- Red background for deletions (-)
- Gray for context lines
- Truncate long diffs with "Show more" button

### FR-003: Line Number Tracking
- Calculate starting line number for Edit operations
- Show line numbers in diff display
- Support MultiEdit with multiple change locations

### FR-004: VS Code Diff Integration
- Register `DiffContentProvider` for `claude-diff://` scheme
- "Open Diff" button opens VS Code's native diff view
- Side-by-side comparison with original and modified

### FR-005: File Path Display
- Show relative file path above diff
- Clickable to open file in editor
- Show file language for syntax context

## Technical Design

### Components
1. `DiffContentProvider` class for VS Code diff scheme
2. Diff rendering in webview with CSS styling
3. File state capture in tool use/result handling

### Diff Format
```
📝 Modified: src/utils/helper.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@@ -15,7 +15,9 @@
   function helper() {
-    return "old";
+    return "new";
+    // Added comment
   }
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Open in Diff Editor]
```

### Message Structure
```typescript
interface ToolUseMessage {
  type: 'toolUse';
  data: {
    toolName: string;
    rawInput: any;
    fileContentBefore?: string;
    startLine?: number;
  };
}

interface ToolResultMessage {
  type: 'toolResult';
  data: {
    toolName: string;
    rawInput: any;
    fileContentAfter?: string;
    startLine?: number;
  };
}
```

## Acceptance Criteria
- [ ] Diff appears inline for Edit/MultiEdit/Write operations
- [ ] Additions shown in green, deletions in red
- [ ] Line numbers displayed correctly
- [ ] "Open Diff" button opens VS Code diff editor
- [ ] Long diffs are truncated with expand option
- [ ] New file creation shows all lines as additions
