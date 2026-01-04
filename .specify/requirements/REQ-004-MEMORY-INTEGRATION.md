# REQ-004: Draagon Memory MCP Integration

**Priority:** High
**Estimated Effort:** 2-3 days
**Dependencies:** REQ-001 (Core Extension), REQ-005 (Memory MCP Server)
**Blocks:** None

---

## 1. Overview

### 1.1 Vision
Connect the VS Code extension to Draagon's Memory MCP Server, enabling shared knowledge across all Draagon-powered applications.

### 1.2 Problem
Without memory integration:
- Claude Code learns things that Roxy doesn't know
- Each session starts fresh
- No personalization or learning over time

### 1.3 Value Proposition
- "Claude learned my coding preferences" → Roxy knows them too
- "I told Roxy my birthday" → Claude Code can reference it
- Memories reinforce based on success/failure
- Cross-application context

### 1.4 Success Metrics
- Memories stored from Claude interactions
- Memories retrieved for relevant queries
- Cross-app memory sharing verified

---

## 2. Requirements

### 2.1 MCP Client Connection

**ID:** REQ-004-01

#### Description
Connect to Draagon Memory MCP Server.

#### Configuration
```json
{
  "draagon.memory.enabled": true,
  "draagon.memory.serverCommand": "python -m draagon_ai.mcp.server",
  "draagon.memory.serverArgs": ["--config", "~/.draagon/config.yaml"],
  "draagon.memory.apiKey": "xxx"
}
```

#### Connection Options
1. **Subprocess** - Extension spawns MCP server
2. **External** - Connect to running server via stdio/socket

#### Implementation
```typescript
class MemoryMCPClient {
  private process: ChildProcess;
  private requestId: number = 0;
  private pending: Map<number, { resolve: Function; reject: Function }>;

  async connect(): Promise<void> {
    this.process = spawn('python', ['-m', 'draagon_ai.mcp.server']);

    // Handle JSON-RPC responses
    this.process.stdout.on('data', (data) => {
      const response = JSON.parse(data.toString());
      const pending = this.pending.get(response.id);
      if (pending) {
        if (response.error) {
          pending.reject(response.error);
        } else {
          pending.resolve(response.result);
        }
        this.pending.delete(response.id);
      }
    });

    // Initialize
    await this.call('initialize', { clientInfo: { name: 'draagon-vscode' } });
  }

  async call(method: string, params?: any): Promise<any> {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      }) + '\n');
    });
  }
}
```

#### Acceptance Criteria
- [ ] MCP server spawns successfully
- [ ] JSON-RPC communication works
- [ ] Connection errors handled gracefully
- [ ] Reconnection on failure

---

### 2.2 Memory Storage on Learning

**ID:** REQ-004-02

#### Description
Store memories when Claude learns something valuable.

#### Triggers
| Event | Memory Type | Example |
|-------|-------------|---------|
| User states preference | preference | "I prefer tabs over spaces" |
| User corrects Claude | fact | "Actually, the API is on port 8080" |
| Successful file creation | skill | "Created auth middleware pattern" |
| Project context | fact | "This project uses TypeScript + React" |

#### Implementation
```typescript
async function onClaudeToolResult(result: ToolResult): Promise<void> {
  // Store successful file operations
  if (result.tool === 'Write' && result.success) {
    await memoryClient.call('tools/call', {
      name: 'memory.store',
      arguments: {
        content: `Created ${result.file_path}: ${result.description}`,
        memory_type: 'skill',
        scope: 'shared',
        entities: [result.file_path, getProjectName()]
      }
    });
  }
}

async function onUserMessage(message: string): Promise<void> {
  // Detect preference statements
  if (isPreferenceStatement(message)) {
    await memoryClient.call('tools/call', {
      name: 'memory.store',
      arguments: {
        content: message,
        memory_type: 'preference',
        scope: 'shared'
      }
    });
  }
}
```

#### Acceptance Criteria
- [ ] Preferences detected and stored
- [ ] Corrections stored as facts
- [ ] File operations logged as skills
- [ ] Duplicates avoided

---

### 2.3 Memory Retrieval for Context

**ID:** REQ-004-03

#### Description
Retrieve relevant memories before sending to Claude.

#### When to Retrieve
- On new conversation start
- On project change
- On explicit memory reference ("remember when...")

#### Implementation
```typescript
async function getRelevantMemories(query: string): Promise<Memory[]> {
  const result = await memoryClient.call('tools/call', {
    name: 'memory.search',
    arguments: {
      query: query,
      limit: 5,
      memory_types: ['fact', 'preference', 'skill']
    }
  });

  return result.memories;
}

async function buildContext(userMessage: string): Promise<string> {
  const memories = await getRelevantMemories(userMessage);

  if (memories.length === 0) return '';

  return `
<relevant_memories>
${memories.map(m => `- ${m.content}`).join('\n')}
</relevant_memories>

Consider the above memories when responding.
`;
}
```

#### Injection Point
Add to system prompt or prepend to user message.

#### Acceptance Criteria
- [ ] Memories retrieved on query
- [ ] Relevant memories selected
- [ ] Context injected appropriately
- [ ] Performance acceptable (<500ms)

---

### 2.4 Memory Browser Panel

**ID:** REQ-004-04

#### Description
UI panel to browse and manage memories.

#### Features
- List recent memories
- Search memories
- View memory details
- Delete memories
- Filter by type/scope

#### UI Mockup
```
┌─────────────────────────────────────────────────┐
│ 🧠 Memories                    [🔍] [⚙️]        │
├─────────────────────────────────────────────────┤
│ Filter: [All types ▼] [All scopes ▼]            │
├─────────────────────────────────────────────────┤
│                                                 │
│ 📌 Preference                      2 hours ago  │
│ Doug prefers TypeScript over JavaScript         │
│                                                 │
│ 💡 Skill                           Yesterday    │
│ Created auth middleware in src/middleware/      │
│                                                 │
│ 📝 Fact                            2 days ago   │
│ Project uses PostgreSQL on port 5432            │
│                                                 │
│ [Load more...]                                  │
└─────────────────────────────────────────────────┘
```

#### Implementation
- VS Code TreeView or WebView panel
- Lazy loading for performance
- Real-time updates on new memories

#### Acceptance Criteria
- [ ] Panel opens from activity bar
- [ ] Memories list with pagination
- [ ] Search functionality works
- [ ] Delete with confirmation
- [ ] Type/scope filters work

---

### 2.5 Belief Reconciliation

**ID:** REQ-004-05

#### Description
Handle conflicting information using Draagon's belief system.

#### Scenario
User previously said: "I use PostgreSQL"
User now says: "I switched to MongoDB"

#### Implementation
```typescript
async function reconcileBelief(observation: string): Promise<ReconcileResult> {
  const result = await memoryClient.call('tools/call', {
    name: 'beliefs.reconcile',
    arguments: {
      observation: observation,
      source: 'user',
      confidence: 0.9
    }
  });

  if (result.conflict) {
    // Optionally show conflict to user
    showConflictNotification(result.previous, result.new);
  }

  return result;
}
```

#### Acceptance Criteria
- [ ] Observations sent for reconciliation
- [ ] Conflicts detected
- [ ] User notified of conflicts (optional)
- [ ] Beliefs updated correctly

---

### 2.6 Cross-App Verification

**ID:** REQ-004-06

#### Description
Verify memories sync across applications.

#### Test Scenario
1. Tell Claude Code: "Remember I prefer dark themes"
2. Ask Roxy: "What are my preferences?"
3. Roxy should mention dark theme preference

#### Acceptance Criteria
- [ ] Memory stored from VS Code
- [ ] Memory retrievable from other MCP clients
- [ ] Scope isolation works correctly

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Draagon VS Code Extension                     │
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ Chat Panel   │     │Memory Browser│     │Claude Process│    │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘    │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              │                                  │
│                    ┌─────────▼─────────┐                       │
│                    │  MemoryMCPClient  │                       │
│                    └─────────┬─────────┘                       │
└──────────────────────────────┼──────────────────────────────────┘
                               │ JSON-RPC
                               ▼
                    ┌─────────────────────┐
                    │  Memory MCP Server  │
                    │   (draagon-ai)      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Qdrant / Memory   │
                    │     Store           │
                    └─────────────────────┘
                               ▲
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐
        │   Roxy    │    │  Mobile   │    │  Other    │
        │  (Voice)  │    │   App     │    │  Clients  │
        └───────────┘    └───────────┘    └───────────┘
```

---

## 4. Testing

### 4.1 Unit Tests
- MCP client connection
- Memory storage formatting
- Context building

### 4.2 Integration Tests
- Full memory store/retrieve cycle
- Belief reconciliation flow
- Cross-client memory access

### 4.3 Manual Tests
- Store memory from VS Code
- Retrieve from Roxy
- Verify sync timing

---

## 5. Acceptance Checklist

- [ ] MCP client connects to server
- [ ] Memories stored on relevant events
- [ ] Memories retrieved for context
- [ ] Memory browser panel functional
- [ ] Belief reconciliation works
- [ ] Cross-app memory sharing verified
