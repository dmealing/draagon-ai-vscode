# Improvement Roadmap

This document outlines the areas needing improvement in the draagon-ai-vscode extension, with implementation details and priorities.

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

## Priority 3: Background Agents (Currently 45%)

### Current State
- `src/agents/orchestrator.ts` exists with basic structure
- `src/agents/prReview.ts` has PR review logic
- No security scanning
- No custom agent support

### Required Improvements

#### 3.1 Agent Framework
```typescript
interface Agent {
    id: string;
    name: string;
    description: string;
    triggers: AgentTrigger[];
    execute(context: AgentContext): Promise<AgentResult>;
}

interface AgentTrigger {
    type: 'manual' | 'onSave' | 'onCommit' | 'scheduled' | 'onPR';
    config?: Record<string, unknown>;
}

interface AgentContext {
    workspaceRoot: string;
    files?: string[];
    diff?: string;
    userPrompt?: string;
}
```

#### 3.2 Implementation Tasks
- [ ] Create proper agent registration system
- [ ] Implement security scanning agent (use Claude for analysis)
- [ ] Add on-save hooks for agents
- [ ] Implement agent result UI (sidebar panel)
- [ ] Add agent configuration in settings
- [ ] Create custom agent definition format
- [ ] Add agent execution history

#### 3.3 Built-in Agents to Implement
1. **Security Scanner** - Scan for vulnerabilities, secrets, OWASP issues
2. **Code Reviewer** - Style, patterns, best practices (enhance existing)
3. **Test Generator** - Generate tests for changed code
4. **Documentation** - Generate/update docs for changes
5. **Dependency Checker** - Check for outdated/vulnerable deps

#### 3.4 Files to Modify/Create
- `src/agents/orchestrator.ts` - Enhance
- `src/agents/registry.ts` - Agent registration
- `src/agents/security.ts` - Security scanner
- `src/agents/testGenerator.ts` - Test generation
- `src/agents/docGenerator.ts` - Documentation
- `src/agents/hooks.ts` - File save hooks

---

## Priority 4: History Management (Currently 45%)

### Current State
- `src/history/manager.ts` exists with basic functionality
- No search capability
- No export functionality
- No session naming

### Required Improvements

#### 4.1 Enhanced History Model
```typescript
interface ConversationHistory {
    id: string;
    name: string;  // User-editable name
    createdAt: Date;
    updatedAt: Date;
    messages: HistoryMessage[];
    metadata: {
        tokenCount: number;
        costUsd: number;
        model: string;
        workspaceRoot: string;
    };
    tags: string[];
}

interface HistorySearchOptions {
    query: string;
    dateRange?: { start: Date; end: Date };
    tags?: string[];
    limit?: number;
}
```

#### 4.2 Implementation Tasks
- [ ] Add full-text search using simple indexing
- [ ] Implement session naming/renaming
- [ ] Add export to Markdown/JSON/HTML
- [ ] Create history browser UI (webview or tree view)
- [ ] Add tagging system
- [ ] Implement history retention policies (auto-cleanup)
- [ ] Add conversation forking (branch from point in history)

#### 4.3 UI Components Needed
1. **History Panel** - Sidebar with conversation list
2. **Search Bar** - Full-text search
3. **Export Dialog** - Format selection
4. **Session Editor** - Rename, tag, delete

#### 4.4 Files to Modify/Create
- `src/history/manager.ts` - Enhance with search
- `src/history/search.ts` - Search indexing
- `src/history/export.ts` - Export functionality
- `src/providers/historyViewProvider.ts` - History UI
- `src/ui/webview/historyPanel.ts` - History browser

---

## Priority 5: Plan Mode (Currently 55%)

### Current State
- Basic plan mode toggle exists
- Uses Claude's plan mode via `--permission-mode plan`
- No structured plan display
- No plan editing

### Required Improvements

#### 5.1 Plan Structure
```typescript
interface Plan {
    id: string;
    title: string;
    description: string;
    steps: PlanStep[];
    status: 'draft' | 'approved' | 'executing' | 'completed';
    estimatedEffort?: string;
}

interface PlanStep {
    id: string;
    title: string;
    description: string;
    type: 'file-edit' | 'file-create' | 'command' | 'research';
    target?: string;  // File path or command
    status: 'pending' | 'in-progress' | 'completed' | 'skipped';
    substeps?: PlanStep[];
}
```

#### 5.2 Implementation Tasks
- [ ] Parse Claude's plan output into structured format
- [ ] Create plan viewer UI component
- [ ] Add step-by-step execution with approval
- [ ] Implement plan editing (reorder, skip, modify steps)
- [ ] Add plan templates for common tasks
- [ ] Support plan export/import
- [ ] Add plan history

#### 5.3 UI Components Needed
1. **Plan Viewer** - Collapsible step list
2. **Step Controls** - Execute, skip, edit buttons
3. **Progress Indicator** - Visual progress through plan
4. **Approval Dialog** - Review before execution

#### 5.4 Files to Modify/Create
- `src/plan/parser.ts` - Parse Claude plan output
- `src/plan/executor.ts` - Step-by-step execution
- `src/plan/editor.ts` - Plan modification
- `src/ui/webview/planViewer.ts` - Plan UI

---

## Additional Improvements (Lower Priority)

### @-Mentions (Currently 0%)
- Add file/function reference parsing in input
- Implement autocomplete dropdown
- Extract and include referenced content in context

### Context Menu Integration (Currently 0%)
- Add right-click menu items in editor
- "Ask Draagon about selection"
- "Review this code"
- "Generate tests for this"

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

| Feature | Complexity | Files | Estimated Work |
|---------|-----------|-------|----------------|
| Multi-LLM Routing | High | 7-10 | Major |
| MCP Support | High | 5-8 | Major |
| Background Agents | Medium | 6-8 | Medium |
| History Management | Medium | 4-6 | Medium |
| Plan Mode | Medium | 4-5 | Medium |
| @-Mentions | Low | 2-3 | Small |
| Context Menu | Low | 1-2 | Small |

---

*Last Updated: 2025-01-05*
