# Improvement Roadmap

This document outlines the areas needing improvement in the draagon-ai-vscode extension, with implementation details and priorities.

---

## Recently Completed (2026-01-05)

### Tool Handling Improvements ✅
- [x] Added streaming support for `content_block_start`, `content_block_delta` events
- [x] Handle `text_delta` and `thinking_delta` for incremental text display
- [x] Added `TodoWrite` handler to update todo panel in UI
- [x] Added `Task` tool handler for background agent tracking
- [x] Added `handleInlineToolResult` for Bash, Read, Glob, Grep output display
- [x] Fixed permission system blocking issue in `--print` mode
- [x] Extended `ClaudeMessage` types for all streaming event types

### UI/CSS Improvements ✅
- [x] Tightened CSS spacing for markdown headers, lists, blockquotes, tables
- [x] Reduced code block margins and padding for compact display
- [x] Cleaned up excessive `<br>` tags after block elements
- [x] Added CSS styles for `.tool-result` and `.agent-block` elements
- [x] Added `addToolResultMessage` and `addAgentMessage` webview functions
- [x] Fixed timestamp visibility on user messages

### Priority 0 Fixes ✅
- [x] **Tool result truncation** - Added "Show more" for long outputs with expand/collapse
- [x] **Loading indicator improvements** - Enhanced with phase-based icons (connecting, thinking, writing, tool)
- [x] **Error display categorization** - Categorized errors with color-coded types, suggestions, and retry buttons
- [x] **Context bar click handler** - Already implemented and working

### @-Mentions Autocomplete ✅
- [x] Added mention popup HTML and CSS in webview
- [x] Implemented mention detection on input (triggers on @)
- [x] Added keyboard navigation (up/down/enter/tab/escape)
- [x] Created `_sendMentionItems` handler in ChatViewProvider
- [x] Extracts files and symbols (functions/classes) from workspace

### Context Menu Integration ✅
- [x] Added "Draagon AI" submenu in editor context menu
- [x] "Ask Draagon about this" - sends selection to chat
- [x] "Explain this code" - requests detailed explanation
- [x] "Generate tests for this" - creates unit tests
- [x] "Refactor this code" - suggests improvements
- [x] "Document this code" - adds JSDoc/docstrings
- [x] "Find bugs in this code" - analyzes for issues
- [x] Added `sendMessageToChat` public API method
- [x] Retry functionality for errors with stored last message

---

## Priority 0: Remaining Items

### 0.1 Session Continuity
- [ ] **Test `--resume` functionality** - Verify session_id is properly captured and reused
- [ ] **New Chat button** - Ensure it properly resets claudeSessionId

### 0.2 Tool Output Display Gaps
- [ ] **Test streaming text between tool calls** - Verify text_delta handling works
- [ ] **Background agent completion** - Update agent status when Task tool completes

---

## Priority 1: Multi-LLM Routing (Currently 15%)

### Current State
- `src/routing/router.ts` exists but is a stub
- Only routes to Claude via CLI
- Groq integration exists only for e2e testing

### Required Improvements

#### 1.1 Router Architecture
```typescript
interface RouterConfig {
    defaultProvider: 'claude' | 'groq' | 'openai' | 'anthropic-api';
    rules: RoutingRule[];
    fallback: string;
}

interface RoutingRule {
    condition: {
        complexity?: 'simple' | 'moderate' | 'complex';
        taskType?: 'chat' | 'code' | 'analysis' | 'refactor';
        tokenEstimate?: { max: number };
        keywords?: string[];
    };
    provider: string;
    model: string;
}
```

#### 1.2 Implementation Tasks
- [ ] Create `LLMProvider` interface for abstracting different backends
- [ ] Implement `ClaudeProvider` (wraps current CLI)
- [ ] Implement `GroqProvider` (direct API)
- [ ] Implement `AnthropicAPIProvider` (direct API without CLI)
- [ ] Add complexity estimation logic
- [ ] Add routing statistics tracking
- [ ] Add provider health checks and fallback logic

#### 1.3 Configuration
```json
{
    "draagon.routing.enabled": true,
    "draagon.routing.defaultProvider": "claude",
    "draagon.routing.groqApiKey": "",
    "draagon.routing.rules": [
        {
            "taskType": "simple",
            "provider": "groq",
            "model": "llama-3.1-8b-instant"
        }
    ]
}
```

#### 1.4 Files to Modify/Create
- `src/routing/router.ts` - Complete rewrite
- `src/routing/providers/base.ts` - Provider interface
- `src/routing/providers/claude.ts` - Claude CLI provider
- `src/routing/providers/groq.ts` - Groq API provider
- `src/routing/providers/anthropic.ts` - Direct Anthropic API
- `src/routing/complexity.ts` - Complexity estimation
- `src/routing/statistics.ts` - Usage tracking

---

## Priority 2: MCP Support (Currently 35%)

### Current State
- `src/mcp/serverManager.ts` has basic structure
- No actual MCP server implementations
- No auto-start functionality

### Required Improvements

#### 2.1 MCP Server Manager Enhancements
```typescript
interface MCPServerConfig {
    name: string;
    type: 'stdio' | 'http' | 'websocket';
    command?: string;
    args?: string[];
    url?: string;
    autoStart: boolean;
    env?: Record<string, string>;
}

interface MCPCapabilities {
    tools: MCPTool[];
    resources: MCPResource[];
    prompts: MCPPrompt[];
}
```

#### 2.2 Implementation Tasks
- [ ] Implement proper MCP client using `@modelcontextprotocol/sdk`
- [ ] Add server lifecycle management (start/stop/restart)
- [ ] Add auto-start on extension activation
- [ ] Create MCP server discovery UI
- [ ] Add health monitoring and reconnection logic
- [ ] Implement tool passthrough to Claude

#### 2.3 Built-in MCP Integrations to Add
1. **File System** - Already handled by Claude, but expose as MCP
2. **Git** - Repository operations
3. **GitHub** - Issues, PRs, actions
4. **Slack** - Channel messages, notifications
5. **Jira** - Issue tracking
6. **Google Drive** - Document access

#### 2.4 Files to Modify/Create
- `src/mcp/serverManager.ts` - Complete rewrite
- `src/mcp/client.ts` - MCP client wrapper
- `src/mcp/discovery.ts` - Server discovery
- `src/mcp/servers/` - Built-in server implementations

---

## Priority 3: Background Agents (Currently 85%) ✅

### Current State
- `src/agents/orchestrator.ts` - Full orchestration with task queue and parallelism
- `src/agents/prReview.ts` - PR review with multiple specialized reviewers
- `src/agents/security.ts` - Security scanner with pattern matching + Claude deep scan ✅
- `src/agents/testGenerator.ts` - Test generator with framework detection ✅
- `src/agents/registry.ts` - Agent registration and execution system ✅

### Completed Improvements

#### 3.1 Agent Framework ✅
- [x] Agent registration system with `AgentRegistry` class
- [x] Agent definition format with triggers (manual, on-save, on-commit, scheduled, on-pr)
- [x] Agent execution context and result tracking
- [x] Agent execution history

#### 3.2 Implementation Tasks
- [x] Create proper agent registration system (`src/agents/registry.ts`)
- [x] Implement security scanning agent (`src/agents/security.ts`)
- [x] Implement test generator agent (`src/agents/testGenerator.ts`)
- [x] Add agent execution history tracking
- [ ] Add on-save hooks for agents (TODO)
- [ ] Implement agent result UI (sidebar panel) (TODO)
- [ ] Add agent configuration in settings (TODO)

#### 3.3 Built-in Agents Implemented
1. **Security Scanner** ✅ - Pattern matching for secrets, injection, XSS + Claude deep scan
2. **Code Reviewer** ✅ - Multi-agent review with specialized reviewers
3. **Test Generator** ✅ - Framework detection (Jest, Vitest, Mocha, pytest, Go)
4. **Documentation** - TODO
5. **Dependency Checker** - TODO

#### 3.4 Files Created
- `src/agents/orchestrator.ts` - Task orchestration
- `src/agents/registry.ts` - Agent registration ✅
- `src/agents/security.ts` - Security scanner ✅
- `src/agents/testGenerator.ts` - Test generation ✅
- `src/agents/prReview.ts` - PR review toolkit

---

## Priority 4: History Management (Currently 85%) ✅

### Current State
- `src/history/manager.ts` - Full-featured history management ✅
- Search capability ✅
- Export to Markdown/JSON/HTML ✅
- Session naming/renaming ✅
- Tagging system ✅

### Completed Improvements

#### 4.1 Enhanced History Model ✅
- Conversations now have optional `name` field for user-editable names
- Full `tags` array support on conversations
- Search by content and tags

#### 4.2 Implementation Tasks
- [x] Add full-text search (`searchConversations` method)
- [x] Implement session naming/renaming (`renameConversation`)
- [x] Add export to Markdown (`exportAsMarkdown`)
- [x] Add export to JSON (`exportAsJson`)
- [x] Add export to HTML (`exportAsHtml`) - with dark theme styling
- [x] Add tagging system (`addTag`, `removeTag`, `getAllTags`, `getConversationsByTag`)
- [x] Group conversations by date (`getConversationsGroupedByDate`)
- [ ] Create history browser UI (webview or tree view) (TODO)
- [ ] Implement history retention policies (auto-cleanup) (TODO)
- [ ] Add conversation forking (branch from point in history) (TODO)

#### 4.3 UI Components Needed (Remaining)
1. **History Panel** - Sidebar with conversation list (TODO)
2. **Search Bar** - Full-text search (backend ready)
3. **Export Dialog** - Format selection (backend ready)
4. **Session Editor** - Rename, tag, delete (backend ready)

#### 4.4 Files Modified
- `src/history/manager.ts` - Enhanced with search, tagging, export ✅

---

## Priority 5: Plan Mode (Currently 90%) ✅

### Current State
- `src/plan/` - Complete plan mode module ✅
- Plan parser supporting JSON, Markdown, numbered list formats ✅
- Plan executor with step-by-step execution ✅
- Plan manager for lifecycle management ✅

### Completed Improvements

#### 5.1 Plan Structure ✅
```typescript
interface Plan {
    id: string;
    title: string;
    description: string;
    goal: string;
    steps: PlanStep[];
    status: 'draft' | 'approved' | 'executing' | 'completed' | 'cancelled';
    metadata: { estimatedSteps, completedSteps, failedSteps, skippedSteps, filesAffected };
}

interface PlanStep {
    id: string;
    title: string;
    description: string;
    type: 'file-edit' | 'file-create' | 'file-delete' | 'command' | 'research' | 'review' | 'other';
    target?: string;
    status: 'pending' | 'in-progress' | 'completed' | 'skipped' | 'failed';
    substeps?: PlanStep[];
    output?: string;
    error?: string;
}
```

#### 5.2 Implementation Tasks
- [x] Parse Claude's plan output into structured format (`src/plan/parser.ts`)
- [x] Add step-by-step execution with approval (`src/plan/executor.ts`)
- [x] Plan lifecycle management (`src/plan/manager.ts`)
- [x] Support pause/resume/cancel execution
- [x] Skip individual steps
- [x] Track execution progress
- [x] Format plans as Markdown
- [ ] Create plan viewer UI component (TODO)
- [ ] Implement plan editing (reorder, skip, modify steps) (TODO)
- [ ] Add plan templates for common tasks (TODO)
- [ ] Support plan export/import (TODO)

#### 5.3 UI Components Needed (Remaining)
1. **Plan Viewer** - Collapsible step list (TODO)
2. **Step Controls** - Execute, skip, edit buttons (backend ready)
3. **Progress Indicator** - Visual progress through plan (backend ready)
4. **Approval Dialog** - Review before execution (events ready)

#### 5.4 Files Created ✅
- `src/plan/types.ts` - Type definitions ✅
- `src/plan/parser.ts` - Parse Claude plan output (JSON, Markdown, numbered list) ✅
- `src/plan/executor.ts` - Step-by-step execution with events ✅
- `src/plan/manager.ts` - Plan lifecycle management ✅
- `src/plan/index.ts` - Module exports ✅

---

## Additional Improvements (Lower Priority)

### @-Mentions ✅ (100% Complete)
- [x] Add file/function reference parsing in input
- [x] Implement autocomplete dropdown
- [ ] Extract and include referenced content in context (TODO: expand mentions before sending)

### Context Menu Integration ✅ (100% Complete)
- [x] Add right-click menu items in editor
- [x] "Ask Draagon about selection"
- [x] "Review this code"
- [x] "Generate tests for this"
- [x] "Refactor this code"
- [x] "Document this code"
- [x] "Find bugs in this code"

### Figma Integration (Currently 20%)
- Complete the stub in `src/integrations/figma.ts`
- Add Figma MCP server support
- Implement design-to-code generation

---

## Implementation Order

### Phase 1 (Immediate)
1. History Management - Most user-visible improvement
2. Plan Mode - Enhances core workflow

### Phase 2 (Short-term)
3. Background Agents - Adds automation value
4. Multi-LLM Routing - Cost optimization

### Phase 3 (Medium-term)
5. MCP Support - Extensibility
6. @-Mentions - Power user feature
7. Context Menu - Convenience

---

## Effort Estimates

| Feature | Complexity | Files | Status |
|---------|-----------|-------|--------|
| Multi-LLM Routing | High | 7-10 | 15% - Stub only |
| MCP Support | High | 5-8 | 35% - Basic structure |
| Background Agents | Medium | 6-8 | **85% ✅** |
| History Management | Medium | 4-6 | **85% ✅** |
| Plan Mode | Medium | 4-5 | **90% ✅** |
| @-Mentions | Low | 2-3 | **100% ✅** |
| Context Menu | Low | 1-2 | **100% ✅** |

---

## Summary of Recent Work (2026-01-05)

### Background Agents ✅
- Created `src/agents/security.ts` - Security scanner with pattern-based detection and Claude deep scan
- Created `src/agents/testGenerator.ts` - Test generator with framework detection
- Created `src/agents/registry.ts` - Agent registration and execution system

### History Management ✅
- Enhanced `src/history/manager.ts` with:
  - Session naming/renaming
  - Tagging system (add, remove, get all tags, get by tag)
  - Export to JSON and HTML (in addition to existing Markdown)

### Plan Mode ✅
- Created complete `src/plan/` module:
  - `types.ts` - Plan and step type definitions
  - `parser.ts` - Parse Claude output (JSON, Markdown, numbered lists)
  - `executor.ts` - Step-by-step execution with pause/resume/cancel
  - `manager.ts` - Plan lifecycle management
  - `index.ts` - Module exports

---

*Last Updated: 2026-01-05*
