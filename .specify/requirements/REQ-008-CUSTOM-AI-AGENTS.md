# REQ-008: Custom AI Agents (Groq-Powered)

**Priority:** Medium
**Estimated Effort:** 1 week
**Dependencies:** REQ-001 (Core Extension), REQ-003 (Multi-LLM Routing)
**Blocks:** None

---

## 1. Overview

### 1.1 Vision
Enable custom AI agents powered by Groq for specific tasks like code review, security scanning, documentation generation, running independently or alongside Claude.

### 1.2 Problem
Claude is great for interactive coding, but specialized tasks could benefit from:
- Faster, cheaper processing (Groq)
- Custom prompts optimized for specific tasks
- Background processing without interrupting main chat

### 1.3 Use Cases
| Agent | Purpose | Trigger |
|-------|---------|---------|
| Code Reviewer | Review code changes | Manual, on commit |
| Security Scanner | Find vulnerabilities | On file save, manual |
| Doc Generator | Generate documentation | Manual |
| Test Writer | Generate test cases | Manual |
| Refactor Suggester | Suggest improvements | On file open |

---

## 2. Requirements

### 2.1 Agent Definition

**ID:** REQ-008-01

#### Agent Schema
```typescript
interface CustomAgent {
  id: string;
  name: string;
  description: string;
  icon: string;
  provider: 'groq' | 'draagon' | 'openai';
  model: string;
  systemPrompt: string;
  triggers: AgentTrigger[];
  outputFormat: 'chat' | 'panel' | 'notification';
}

interface AgentTrigger {
  type: 'manual' | 'on_save' | 'on_commit' | 'scheduled';
  pattern?: string;  // File glob for on_save
  schedule?: string; // Cron for scheduled
}
```

#### Built-in Agents
```yaml
agents:
  - id: code-reviewer
    name: Code Reviewer
    icon: 👀
    provider: groq
    model: llama-3.3-70b-versatile
    systemPrompt: |
      You are an expert code reviewer. Analyze the provided code for:
      - Bugs and potential issues
      - Performance problems
      - Security vulnerabilities
      - Code style and best practices

      Be concise but thorough. Format as bullet points.
    triggers:
      - type: manual
    outputFormat: panel

  - id: security-scanner
    name: Security Scanner
    icon: 🔒
    provider: groq
    model: llama-3.3-70b-versatile
    systemPrompt: |
      You are a security expert. Analyze the code for:
      - SQL injection vulnerabilities
      - XSS vulnerabilities
      - Authentication/authorization issues
      - Sensitive data exposure
      - Dependency vulnerabilities

      Rate severity: Critical, High, Medium, Low.
    triggers:
      - type: manual
      - type: on_save
        pattern: "**/*.{ts,js,py}"
    outputFormat: panel
```

#### Acceptance Criteria
- [ ] Agent schema defined
- [ ] Built-in agents configured
- [ ] Custom agents loadable from settings

---

### 2.2 Agent Execution

**ID:** REQ-008-02

#### Execution Flow
```typescript
class AgentExecutor {
  async execute(agent: CustomAgent, context: AgentContext): Promise<AgentResult> {
    const provider = this.getProvider(agent.provider);

    const prompt = this.buildPrompt(agent, context);

    const response = await provider.query(prompt, {
      model: agent.model,
      maxTokens: 2000
    });

    return {
      agentId: agent.id,
      content: response,
      timestamp: new Date()
    };
  }

  private buildPrompt(agent: CustomAgent, context: AgentContext): string {
    return `${agent.systemPrompt}

## Context
File: ${context.filePath}
Language: ${context.language}

## Code
\`\`\`${context.language}
${context.code}
\`\`\`

Provide your analysis:`;
  }
}
```

#### Context Types
```typescript
interface AgentContext {
  type: 'file' | 'selection' | 'diff' | 'project';
  filePath?: string;
  code?: string;
  language?: string;
  diff?: string;
}
```

#### Acceptance Criteria
- [ ] Agents execute with proper context
- [ ] Provider selection works
- [ ] Responses captured correctly

---

### 2.3 Agent UI

**ID:** REQ-008-03

#### Trigger Points
- Command palette: "Draagon: Run Code Review"
- Context menu: Right-click → "Run Security Scan"
- Keyboard shortcuts: Configurable
- Activity bar: Agent panel

#### Output Display
| Format | Display |
|--------|---------|
| chat | Inline in main chat |
| panel | Dedicated output panel |
| notification | VS Code notification |

#### Agent Panel Mockup
```
┌─────────────────────────────────────────────────┐
│ 🤖 AI Agents                                    │
├─────────────────────────────────────────────────┤
│                                                 │
│ 👀 Code Reviewer                    [Run]       │
│    Analyze code for issues                      │
│                                                 │
│ 🔒 Security Scanner                 [Run]       │
│    Find security vulnerabilities                │
│                                                 │
│ 📝 Doc Generator                    [Run]       │
│    Generate documentation                       │
│                                                 │
│ 🧪 Test Writer                      [Run]       │
│    Generate test cases                          │
│                                                 │
└─────────────────────────────────────────────────┘
```

#### Acceptance Criteria
- [ ] Agents accessible from command palette
- [ ] Context menu integration
- [ ] Agent panel in activity bar
- [ ] Output displays correctly

---

### 2.4 Agent Results

**ID:** REQ-008-04

#### Result Display (Panel Mode)
```
┌─────────────────────────────────────────────────┐
│ 👀 Code Review: src/auth.ts                     │
│ Completed in 1.2s                               │
├─────────────────────────────────────────────────┤
│                                                 │
│ ## Issues Found                                 │
│                                                 │
│ 🔴 **Critical**: SQL injection on line 45      │
│    User input not sanitized before query        │
│                                                 │
│ 🟡 **Medium**: Missing error handling (line 23)│
│    Async operation should have try/catch        │
│                                                 │
│ 🟢 **Low**: Consider using const (line 12)     │
│    Variable is never reassigned                 │
│                                                 │
│ [Apply Suggestions] [Dismiss] [Save Report]     │
└─────────────────────────────────────────────────┘
```

#### Actions
- Apply suggestions (where possible)
- Jump to line
- Dismiss/acknowledge
- Save report

#### Acceptance Criteria
- [ ] Results formatted clearly
- [ ] Severity levels colored
- [ ] Line numbers clickable
- [ ] Actions functional

---

### 2.5 Automatic Triggers

**ID:** REQ-008-05

#### On-Save Trigger
```typescript
vscode.workspace.onDidSaveTextDocument(async (doc) => {
  const agents = getAgentsForTrigger('on_save');

  for (const agent of agents) {
    if (matchesPattern(doc.uri.fsPath, agent.triggers[0].pattern)) {
      // Run in background, show notification on completion
      await runAgentInBackground(agent, {
        type: 'file',
        filePath: doc.uri.fsPath,
        code: doc.getText(),
        language: doc.languageId
      });
    }
  }
});
```

#### Rate Limiting
- Debounce rapid saves
- Queue if already running
- Max concurrent agents

#### Acceptance Criteria
- [ ] On-save triggers work
- [ ] File patterns match correctly
- [ ] Rate limiting prevents spam

---

### 2.6 Custom Agent Creation

**ID:** REQ-008-06

#### User-Defined Agents
Settings or JSON file:
```json
{
  "draagon.agents.custom": [
    {
      "id": "my-reviewer",
      "name": "My Custom Reviewer",
      "icon": "🎯",
      "provider": "groq",
      "model": "llama-3.1-8b-instant",
      "systemPrompt": "Review this code focusing on...",
      "triggers": [{"type": "manual"}],
      "outputFormat": "chat"
    }
  ]
}
```

#### Acceptance Criteria
- [ ] Custom agents loadable from settings
- [ ] Validation on agent schema
- [ ] Custom agents appear in UI

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent System                                  │
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ Agent Panel  │     │ Trigger      │     │ Result       │    │
│  │ (UI)         │     │ Manager      │     │ Display      │    │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘    │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              │                                  │
│                    ┌─────────▼─────────┐                       │
│                    │  Agent Executor   │                       │
│                    └─────────┬─────────┘                       │
│                              │                                  │
│              ┌───────────────┼───────────────┐                 │
│              ▼               ▼               ▼                 │
│      ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│      │   Groq      │ │  Draagon    │ │  OpenAI     │          │
│      │  Provider   │ │  Provider   │ │  Provider   │          │
│      └─────────────┘ └─────────────┘ └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Testing

### 4.1 Test Cases

| Scenario | Expected |
|----------|----------|
| Run code reviewer manually | Results display in panel |
| On-save trigger fires | Agent runs in background |
| Custom agent loads | Appears in agent panel |
| Agent fails | Error shown, doesn't crash |

---

## 5. Acceptance Checklist

- [ ] Built-in agents work (reviewer, security)
- [ ] Manual trigger from command palette
- [ ] Context menu integration
- [ ] On-save automatic triggers
- [ ] Results display correctly
- [ ] Custom agents configurable
- [ ] Groq integration functional
