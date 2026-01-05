# End-to-End Testing Strategy

## Overview

This document outlines the e2e testing strategy for the Draagon AI VS Code extension, including using Groq as a user simulator to test the full Claude Code integration loop.

## Current Test Coverage

### Unit Tests (148+ tests)

Located in `src/test/suite/`:

| Test File | Coverage |
|-----------|----------|
| `extension.test.ts` | Extension activation, command registration |
| `providers.test.ts` | WebviewProvider, tree views |
| `routing.test.ts` | LLM routing logic (deferred feature) |
| `sessions.test.ts` | Session management |
| `integrations.test.ts` | Component integration |
| `rendering.test.ts` | Markdown/code rendering |
| `chat.test.ts` | Chat message handling |
| `claude-code.test.ts` | Claude process parsing |
| `promptIntegration.test.ts` | Prompt handling |

### Fixture Generation

- `src/test/fixtures/generateFixtures.ts` - Uses Groq to generate Claude-like responses
- `src/test/fixtures/validateFixtures.ts` - Validates fixture format and content
- XSS test vectors included for security testing

## E2E Test Strategy with Groq as User Simulator

### Concept

Use Groq (fast, cheap LLM) to generate realistic user prompts and evaluate Claude's responses, creating an automated conversation loop:

```
┌─────────────────────────────────────────────────────────────────┐
│                        E2E Test Loop                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    prompt     ┌─────────────────────────┐ │
│  │  Groq (User     │ ───────────▶  │  Claude Code CLI        │ │
│  │  Simulator)     │               │  (via extension)        │ │
│  └─────────────────┘               └─────────────────────────┘ │
│         ▲                                      │               │
│         │                                      │               │
│         │       response + tool results        │               │
│         └──────────────────────────────────────┘               │
│                                                                  │
│  Groq evaluates:                                                │
│  - Did Claude complete the task?                                │
│  - Are code changes valid?                                      │
│  - Did errors get handled correctly?                            │
│  - Is the conversation coherent?                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Approach

#### 1. Test Harness (`src/test/e2e/testHarness.ts`)

```typescript
import Groq from 'groq-sdk';
import { ClaudeProcess } from '../../claude/process';

export interface E2ETestCase {
    name: string;
    scenario: string;         // Groq generates prompts for this scenario
    expectedOutcome: string;  // What should happen
    maxTurns: number;        // Limit conversation length
    timeout: number;         // Test timeout in ms
}

export class E2ETestHarness {
    private groq: Groq;
    private claudeProcess?: ClaudeProcess;

    async runTest(testCase: E2ETestCase): Promise<E2ETestResult> {
        // 1. Ask Groq to generate initial user prompt
        const initialPrompt = await this.generateUserPrompt(testCase.scenario);

        // 2. Send to Claude Code
        const responses = await this.sendToClaudeAndCollect(initialPrompt);

        // 3. Evaluate results with Groq
        const evaluation = await this.evaluateResults(
            testCase.expectedOutcome,
            responses
        );

        return { testCase, responses, evaluation };
    }

    private async generateUserPrompt(scenario: string): Promise<string> {
        const completion = await this.groq.chat.completions.create({
            messages: [{
                role: 'system',
                content: `You are simulating a developer using Claude Code.
                         Generate a realistic prompt for this scenario.
                         Be specific and actionable.`
            }, {
                role: 'user',
                content: scenario
            }],
            model: 'llama-3.1-8b-instant',
            temperature: 0.7
        });
        return completion.choices[0]?.message?.content || '';
    }

    private async evaluateResults(
        expectedOutcome: string,
        responses: ClaudeResponse[]
    ): Promise<E2EEvaluation> {
        const completion = await this.groq.chat.completions.create({
            messages: [{
                role: 'system',
                content: `You are evaluating whether Claude Code completed a task.
                         Score from 0-100 and explain your reasoning.`
            }, {
                role: 'user',
                content: `Expected: ${expectedOutcome}\n\nActual responses: ${JSON.stringify(responses)}`
            }],
            model: 'llama-3.1-70b-versatile', // Larger model for evaluation
            temperature: 0.3
        });

        // Parse evaluation response
        return this.parseEvaluation(completion);
    }
}
```

#### 2. Test Scenarios

```typescript
// src/test/e2e/scenarios.ts
export const E2E_SCENARIOS: E2ETestCase[] = [
    {
        name: 'simple_file_read',
        scenario: 'Ask Claude to read and summarize a TypeScript file',
        expectedOutcome: 'Claude reads the file and provides a summary',
        maxTurns: 2,
        timeout: 30000
    },
    {
        name: 'code_edit',
        scenario: 'Ask Claude to fix a bug in a function (add null check)',
        expectedOutcome: 'Claude uses Edit tool, file is modified correctly',
        maxTurns: 3,
        timeout: 60000
    },
    {
        name: 'multi_file_refactor',
        scenario: 'Ask Claude to rename a function across multiple files',
        expectedOutcome: 'Claude identifies all usages and updates them',
        maxTurns: 5,
        timeout: 120000
    },
    {
        name: 'error_recovery',
        scenario: 'Give Claude a task that will fail initially, see if it recovers',
        expectedOutcome: 'Claude handles the error and tries alternative approach',
        maxTurns: 4,
        timeout: 90000
    },
    {
        name: 'thinking_mode',
        scenario: 'Ask Claude to solve a complex algorithm problem with /ultrathink',
        expectedOutcome: 'Claude shows extended thinking, provides correct solution',
        maxTurns: 2,
        timeout: 120000
    },
    {
        name: 'permission_handling',
        scenario: 'Trigger a permission request (Bash command)',
        expectedOutcome: 'Permission dialog shown, user can approve/deny',
        maxTurns: 2,
        timeout: 30000
    }
];
```

#### 3. Test Runner

```typescript
// src/test/e2e/runner.ts
import * as vscode from 'vscode';
import { E2ETestHarness } from './testHarness';
import { E2E_SCENARIOS } from './scenarios';

suite('E2E Tests with Groq Simulator', () => {
    let harness: E2ETestHarness;

    suiteSetup(async () => {
        harness = new E2ETestHarness({
            groqApiKey: process.env.GROQ_API_KEY,
            workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        });
    });

    for (const scenario of E2E_SCENARIOS) {
        test(scenario.name, async function() {
            this.timeout(scenario.timeout);

            const result = await harness.runTest(scenario);

            assert.ok(
                result.evaluation.score >= 70,
                `Expected score >= 70, got ${result.evaluation.score}: ${result.evaluation.reason}`
            );
        });
    }
});
```

### Key Considerations

#### 1. Cost Control
- Use `llama-3.1-8b-instant` for prompt generation (cheapest)
- Use `llama-3.1-70b-versatile` only for evaluation (more expensive)
- Cache test fixtures when possible
- Limit max turns per test

#### 2. Determinism
- Set low temperature for evaluation (0.3)
- Use seed parameter when available
- Compare against baseline results
- Allow for variance in non-critical details

#### 3. Environment Isolation
- Use dedicated test workspace
- Clean up created files after tests
- Restore git state between tests
- Mock external services

#### 4. CI/CD Integration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on:
  schedule:
    - cron: '0 2 * * *'  # Nightly
  workflow_dispatch:

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Run E2E Tests
        env:
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: npm run test:e2e
```

## Limitations

1. **Not True E2E** - Still mocking VS Code extension host
2. **LLM Variability** - Both Groq and Claude can produce different outputs
3. **Cost** - Real Claude API calls are expensive
4. **Flakiness** - Network issues, rate limits, timeouts

## Recommended Testing Pyramid

```
              /\
             /  \
            / E2E \        <- Groq + Claude (few, expensive)
           /______\
          /        \
         / Integration\    <- Mock Claude, real extension (moderate)
        /______________\
       /                \
      /    Unit Tests    \  <- Pure logic, no external deps (many, fast)
     /____________________\
```

## Next Steps

1. [ ] Implement `E2ETestHarness` class
2. [ ] Create initial test scenarios
3. [ ] Add CI/CD pipeline for nightly runs
4. [ ] Build result reporting dashboard
5. [ ] Add baseline comparison for regression detection

---

**Note:** This e2e strategy is designed for future implementation. Current tests focus on unit and integration levels with mocked Claude responses.
