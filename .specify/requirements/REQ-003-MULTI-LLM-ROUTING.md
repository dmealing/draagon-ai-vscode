# REQ-003: Multi-LLM Request Routing

**Priority:** High
**Estimated Effort:** 3-4 days
**Dependencies:** REQ-001 (Core Extension)
**Blocks:** None

---

## 1. Overview

### 1.1 Vision
Intelligently route requests to the most appropriate LLM based on complexity, cost, and capability requirements.

### 1.2 Problem
Claude Code is powerful but expensive and sometimes slow. Simple queries don't need full Claude capabilities. Complex reasoning might benefit from Draagon's memory and learning.

### 1.3 Tiers

| Tier | Provider | Use Case | Latency | Cost |
|------|----------|----------|---------|------|
| FAST | Groq Llama-8B | Simple questions, conversions | ~100ms | $0.05/M |
| STANDARD | Claude Code CLI | Code tasks, file operations | ~2-5s | $3/M |
| DEEP | Draagon AgentLoop | Complex reasoning, memory-required | ~3-10s | $3/M + memory |

### 1.4 Success Metrics
- 60%+ of simple queries routed to FAST tier
- No capability loss for routed queries
- User can override routing
- Cost reduction visible in metrics

---

## 2. Requirements

### 2.1 Complexity Assessment

**ID:** REQ-003-01

#### Description
Assess incoming request complexity to determine routing.

#### Complexity Signals

| Signal | FAST | STANDARD | DEEP |
|--------|------|----------|------|
| Message length | < 100 chars | 100-500 | > 500 |
| Code references | None | @file mentions | Multiple files |
| Keywords | "what is", "convert" | "fix", "add", "change" | "design", "architect" |
| Question type | Factual | Procedural | Reasoning |
| Memory needed | No | No | Yes |
| Tool required | No | Yes | Maybe |

#### Implementation
```typescript
interface ComplexityResult {
  tier: 'fast' | 'standard' | 'deep';
  confidence: number;
  signals: string[];
}

function assessComplexity(message: string, context: Context): ComplexityResult {
  const signals: string[] = [];
  let score = 0;

  // Length check
  if (message.length < 100) {
    signals.push('short_message');
    score -= 1;
  } else if (message.length > 500) {
    signals.push('long_message');
    score += 2;
  }

  // File references
  if (message.includes('@')) {
    signals.push('file_reference');
    score += 2;
  }

  // Code task keywords
  if (/\b(fix|add|change|update|refactor|implement)\b/i.test(message)) {
    signals.push('code_task');
    score += 2;
  }

  // Simple query keywords
  if (/\b(what is|convert|how many|calculate)\b/i.test(message)) {
    signals.push('simple_query');
    score -= 2;
  }

  // Memory keywords
  if (/\b(remember|last time|previously|you said)\b/i.test(message)) {
    signals.push('memory_needed');
    score += 3;
  }

  // Determine tier
  let tier: 'fast' | 'standard' | 'deep';
  if (score <= -1) tier = 'fast';
  else if (score >= 3) tier = 'deep';
  else tier = 'standard';

  return { tier, confidence: Math.abs(score) / 5, signals };
}
```

#### Acceptance Criteria
- [ ] Complexity assessed before routing
- [ ] Multiple signals considered
- [ ] Confidence score calculated
- [ ] Edge cases handled gracefully

---

### 2.2 Groq Fast-Path Provider

**ID:** REQ-003-02

#### Description
Direct Groq API integration for fast, cheap queries.

#### Configuration
```json
{
  "draagon.groq.apiKey": "gsk_xxx",
  "draagon.groq.model": "llama-3.1-8b-instant",
  "draagon.groq.maxTokens": 1000
}
```

#### Implementation
```typescript
class GroqProvider {
  private client: Groq;

  async query(message: string, context?: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: this.systemPrompt },
        ...(context ? [{ role: 'user', content: context }] : []),
        { role: 'user', content: message }
      ],
      max_tokens: 1000,
      temperature: 0.1
    });

    return response.choices[0].message.content;
  }
}
```

#### System Prompt
```
You are a helpful coding assistant. Answer concisely and accurately.
For complex tasks requiring file access or code changes, respond:
"This requires Claude Code for full capabilities."
```

#### Acceptance Criteria
- [ ] Groq API integration works
- [ ] Responses stream to UI
- [ ] Errors handled gracefully
- [ ] Self-aware of limitations

---

### 2.3 Draagon AgentLoop Provider

**ID:** REQ-003-03

#### Description
Integration with Draagon AI's AgentLoop for memory-enhanced reasoning.

#### Integration Approach
Python subprocess running draagon-ai AgentLoop.

#### Implementation
```typescript
class DraagonProvider {
  private process: ChildProcess;

  async query(request: DraagonRequest): Promise<DraagonResponse> {
    return new Promise((resolve, reject) => {
      const proc = spawn('python', ['-m', 'draagon_ai.cli', 'query'], {
        env: { ...process.env, DRAAGON_CONFIG: this.configPath }
      });

      proc.stdin.write(JSON.stringify(request) + '\n');
      proc.stdin.end();

      let output = '';
      proc.stdout.on('data', (data) => output += data);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(JSON.parse(output));
        } else {
          reject(new Error(`Draagon exited with code ${code}`));
        }
      });
    });
  }
}

interface DraagonRequest {
  query: string;
  persona?: string;
  use_memory?: boolean;
  learn?: boolean;
  context?: any;
}
```

#### Acceptance Criteria
- [ ] AgentLoop spawns and responds
- [ ] Memory queries work
- [ ] Learning triggers correctly
- [ ] Errors handled gracefully

---

### 2.4 Request Router

**ID:** REQ-003-04

#### Description
Central router that directs requests to appropriate provider.

#### Implementation
```typescript
class RequestRouter {
  private groq: GroqProvider;
  private claude: ClaudeCodeProvider;
  private draagon: DraagonProvider;

  async route(message: string, context: Context): Promise<Response> {
    const complexity = assessComplexity(message, context);

    // Log routing decision
    this.logRouting(message, complexity);

    switch (complexity.tier) {
      case 'fast':
        return this.handleFastPath(message, context, complexity);

      case 'standard':
        return this.claude.query(message);

      case 'deep':
        return this.draagon.query({
          query: message,
          use_memory: true,
          learn: true,
          context: context
        });
    }
  }

  private async handleFastPath(
    message: string,
    context: Context,
    complexity: ComplexityResult
  ): Promise<Response> {
    try {
      const response = await this.groq.query(message);

      // Check if Groq deferred to Claude
      if (response.includes('requires Claude Code')) {
        return this.claude.query(message);
      }

      return { content: response, provider: 'groq' };
    } catch (error) {
      // Fallback to Claude on error
      return this.claude.query(message);
    }
  }
}
```

#### Acceptance Criteria
- [ ] Routes based on complexity
- [ ] Falls back on errors
- [ ] Handles Groq deferral
- [ ] Logs all routing decisions

---

### 2.5 User Override

**ID:** REQ-003-05

#### Description
Allow user to force specific provider.

#### UI Components
- Provider indicator showing current route
- Dropdown to force provider
- "Auto" option to use router

#### Syntax Options
```
// Force Claude
/claude How do I fix this?

// Force Groq
/fast What is 2+2?

// Force Draagon
/think What's the best architecture for this?

// Auto (default)
What time is it?
```

#### Acceptance Criteria
- [ ] Prefix commands work
- [ ] UI shows current provider
- [ ] Override persists for session (optional)

---

### 2.6 Routing Metrics

**ID:** REQ-003-06

#### Description
Track routing decisions and costs.

#### Metrics
```typescript
interface RoutingMetrics {
  totalRequests: number;
  byProvider: {
    groq: { count: number; tokens: number; cost: number };
    claude: { count: number; tokens: number; cost: number };
    draagon: { count: number; tokens: number; cost: number };
  };
  savings: number;  // Estimated vs all-Claude
}
```

#### Display
- Show in settings or status bar
- "Saved $X.XX this session"

#### Acceptance Criteria
- [ ] Metrics tracked per session
- [ ] Cost estimates calculated
- [ ] Savings displayed to user

---

## 3. Routing Decision Tree

```
                    ┌─────────────────┐
                    │  User Message   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Force override? │
                    └────────┬────────┘
                        yes/ \no
                           /   \
              ┌───────────┘     └───────────┐
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │ Use specified   │           │ Assess          │
    │ provider        │           │ complexity      │
    └─────────────────┘           └────────┬────────┘
                                           │
                         ┌─────────────────┼─────────────────┐
                         │                 │                 │
                    ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
                    │  FAST   │       │STANDARD │       │  DEEP   │
                    │ (Groq)  │       │(Claude) │       │(Draagon)│
                    └────┬────┘       └────┬────┘       └────┬────┘
                         │                 │                 │
                         ▼                 ▼                 ▼
                    ┌─────────┐       ┌─────────┐       ┌─────────┐
                    │ Simple  │       │ Code    │       │ Memory  │
                    │ answer  │       │ changes │       │ learning│
                    └─────────┘       └─────────┘       └─────────┘
```

---

## 4. Testing

### 4.1 Routing Test Cases

| Input | Expected Tier | Reason |
|-------|---------------|--------|
| "What is 2+2?" | FAST | Simple math |
| "Convert 5 miles to km" | FAST | Simple conversion |
| "Fix the bug in auth.ts" | STANDARD | Code task |
| "@src/api.ts add error handling" | STANDARD | File reference |
| "What did we discuss yesterday?" | DEEP | Memory needed |
| "Design the authentication system" | DEEP | Complex reasoning |

### 4.2 Fallback Tests

| Scenario | Expected |
|----------|----------|
| Groq API fails | Fallback to Claude |
| Groq says "requires Claude" | Route to Claude |
| Draagon fails | Fallback to Claude |
| All fail | Error message to user |

---

## 5. Acceptance Checklist

- [ ] Complexity assessment works accurately
- [ ] Groq fast-path functional
- [ ] Draagon integration works
- [ ] Router makes correct decisions
- [ ] User can override routing
- [ ] Fallbacks work correctly
- [ ] Metrics tracked and displayed
