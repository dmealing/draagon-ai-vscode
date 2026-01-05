# REQ-001: Permission System

**Status:** COMPLETED
**Version:** 0.2.0
**Completed:** 2026-01-04

## Overview
Implement an interactive permission system that allows users to approve, deny, or pre-approve tool executions before Claude runs them.

## Priority
**HIGH** - Critical for production use and user safety

## User Stories

### US-001: Permission Request Dialog
As a user, I want to see a dialog when Claude attempts to use a potentially dangerous tool, so I can review and approve the action before it executes.

### US-002: Always Allow Patterns
As a power user, I want to configure "Always Allow" patterns for common commands (npm, git, docker), so I don't have to approve every routine operation.

### US-003: YOLO Mode
As an advanced user, I want a "YOLO Mode" that auto-approves all tool uses, so I can work without interruptions when I trust the context.

### US-004: Permission Persistence
As a user, I want my permission preferences to persist across sessions, so I don't have to reconfigure them each time.

## Functional Requirements

### FR-001: Permission Request UI
- Display tool name, description, and input parameters
- Show "Allow", "Deny", and "Always Allow" buttons
- Support pattern input for Bash commands (e.g., "npm *", "git *")
- Highlight potentially dangerous operations in red

### FR-002: Permission Storage
- Store permissions in `{storageUri}/permissions/permissions.json`
- Structure:
  ```json
  {
    "alwaysAllow": {
      "Read": true,
      "Glob": true,
      "Bash": ["npm *", "git *", "docker *", "yarn *", "pnpm *"]
    },
    "yoloMode": false
  }
  ```

### FR-003: Pattern Matching
- Support exact match: `npm install`
- Support prefix wildcard: `npm *` matches any npm command
- Support full wildcard: `*` matches all commands for that tool

### FR-004: Default Safe Tools
- Auto-approve by default: Read, Glob, Grep, LS
- Require approval: Bash, Write, Edit, Delete

### FR-005: Permission Management UI
- Command to open permission management panel
- List all stored permissions
- Edit/delete individual permissions
- Toggle YOLO mode

## Technical Design

### Components
1. `PermissionManager` class in `src/permissions/manager.ts`
2. Permission UI in webview (question panel style)
3. Integration with ClaudeProcess for stdio permission requests

### Integration Points
- Hook into Claude CLI's `control_request` stdio messages
- Respond with `control_response` via stdin

## Acceptance Criteria
- [ ] Permission dialog appears for Bash, Write, Edit, Delete tools
- [ ] "Always Allow" persists across sessions
- [ ] Pattern matching works for Bash commands
- [ ] YOLO mode bypasses all permission checks
- [ ] Safe tools (Read, Glob) are auto-approved
