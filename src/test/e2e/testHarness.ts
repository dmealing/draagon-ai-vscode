/**
 * E2E Test Harness for testing the extension with:
 * 1. Groq simulating a user → Real Claude Code CLI → Evaluate results
 * 2. Simulated Claude responses → Real webview rendering → Verify output
 */

import Groq from 'groq-sdk';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface E2ETestCase {
    name: string;
    scenario: string;           // Description for Groq to generate prompt
    expectedBehavior: string;   // What should happen
    workspaceSetup?: () => Promise<void>;  // Optional setup
    workspaceCleanup?: () => Promise<void>; // Optional cleanup
    maxTurns: number;
    timeoutMs: number;
}

export interface ClaudeMessage {
    type: string;
    message?: {
        content?: Array<{
            type: string;
            text?: string;
            thinking?: string;
            name?: string;
            input?: unknown;
        }>;
    };
    subtype?: string;
    tool_use_id?: string;
    result?: unknown;
}

export interface E2ETestResult {
    testCase: E2ETestCase;
    generatedPrompt: string;
    claudeResponses: ClaudeMessage[];
    evaluation: {
        passed: boolean;
        score: number;
        reason: string;
    };
    durationMs: number;
    error?: string;
}

// ============================================================================
// E2E Test Harness - Real Claude Code
// ============================================================================

export class E2ERealClaudeHarness {
    private groq: Groq;
    private workspaceDir: string;

    constructor(options: {
        groqApiKey?: string;
        workspaceDir?: string;
    } = {}) {
        this.groq = new Groq({
            apiKey: options.groqApiKey || process.env.GROQ_API_KEY,
        });
        this.workspaceDir = options.workspaceDir ||
            path.join(__dirname, '..', '..', '..', 'test-workspace');
    }

    /**
     * Run a single e2e test case
     */
    async runTest(testCase: E2ETestCase): Promise<E2ETestResult> {
        const startTime = Date.now();

        try {
            // Setup workspace if needed
            await this.ensureWorkspace();
            if (testCase.workspaceSetup) {
                await testCase.workspaceSetup();
            }

            // Generate user prompt with Groq
            const generatedPrompt = await this.generateUserPrompt(testCase.scenario);
            console.log(`[E2E] Generated prompt: ${generatedPrompt.substring(0, 100)}...`);

            // Send to Claude Code CLI
            const claudeResponses = await this.runClaudeCode(
                generatedPrompt,
                testCase.timeoutMs
            );
            console.log(`[E2E] Received ${claudeResponses.length} messages from Claude`);

            // Evaluate results with Groq
            const evaluation = await this.evaluateResults(
                testCase.expectedBehavior,
                generatedPrompt,
                claudeResponses
            );

            // Cleanup
            if (testCase.workspaceCleanup) {
                await testCase.workspaceCleanup();
            }

            return {
                testCase,
                generatedPrompt,
                claudeResponses,
                evaluation,
                durationMs: Date.now() - startTime
            };

        } catch (error) {
            return {
                testCase,
                generatedPrompt: '',
                claudeResponses: [],
                evaluation: { passed: false, score: 0, reason: 'Test error' },
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Generate a realistic user prompt using Groq
     */
    private async generateUserPrompt(scenario: string): Promise<string> {
        const completion = await this.groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `You are simulating a software developer using Claude Code CLI.
Generate a single, realistic prompt that a developer would type.
The prompt should be:
- Natural and conversational
- Specific enough to be actionable
- Related to the test scenario provided
- No more than 2-3 sentences

Just output the prompt text, nothing else.`
                },
                {
                    role: 'user',
                    content: `Scenario: ${scenario}`
                }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.7,
            max_tokens: 200,
        });

        return completion.choices[0]?.message?.content?.trim() || scenario;
    }

    /**
     * Run Claude Code CLI and collect responses
     */
    private async runClaudeCode(
        prompt: string,
        timeoutMs: number
    ): Promise<ClaudeMessage[]> {
        return new Promise((resolve, reject) => {
            const messages: ClaudeMessage[] = [];
            let buffer = '';

            const claude = spawn('claude', [
                '--output-format', 'stream-json',
                '--print', prompt
            ], {
                cwd: this.workspaceDir,
                env: { ...process.env, FORCE_COLOR: '0' }
            });

            const timeout = setTimeout(() => {
                claude.kill('SIGTERM');
                resolve(messages);
            }, timeoutMs);

            claude.stdout?.on('data', (data: Buffer) => {
                buffer += data.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const msg = JSON.parse(line) as ClaudeMessage;
                            messages.push(msg);
                        } catch {
                            // Not JSON, ignore
                        }
                    }
                }
            });

            claude.stderr?.on('data', (data: Buffer) => {
                console.error('[Claude stderr]:', data.toString());
            });

            claude.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });

            claude.on('exit', () => {
                clearTimeout(timeout);
                // Flush remaining buffer
                if (buffer.trim()) {
                    try {
                        messages.push(JSON.parse(buffer));
                    } catch {
                        // Ignore
                    }
                }
                resolve(messages);
            });
        });
    }

    /**
     * Evaluate Claude's responses using Groq
     */
    private async evaluateResults(
        expectedBehavior: string,
        prompt: string,
        responses: ClaudeMessage[]
    ): Promise<{ passed: boolean; score: number; reason: string }> {
        // Extract text content from responses
        const responseText = responses
            .filter(r => r.type === 'assistant' && r.message?.content)
            .map(r => r.message!.content!
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join('\n')
            )
            .join('\n\n');

        // Extract tool uses
        const toolUses = responses
            .filter(r => r.type === 'assistant' && r.message?.content)
            .flatMap(r => r.message!.content!
                .filter(c => c.type === 'tool_use')
                .map(c => `${c.name}: ${JSON.stringify(c.input).substring(0, 100)}`)
            );

        const completion = await this.groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `You are evaluating whether an AI assistant completed a task correctly.
Score the response from 0-100:
- 90-100: Perfect completion, all requirements met
- 70-89: Good completion, minor issues
- 50-69: Partial completion, some requirements missed
- 30-49: Poor completion, major issues
- 0-29: Failed or incorrect

Output ONLY a JSON object: {"score": <number>, "reason": "<one sentence explanation>"}`
                },
                {
                    role: 'user',
                    content: `User prompt: ${prompt}

Expected behavior: ${expectedBehavior}

Claude's response:
${responseText.substring(0, 2000)}

Tools used: ${toolUses.join(', ') || 'None'}`
                }
            ],
            model: 'llama-3.1-70b-versatile',  // Larger model for evaluation
            temperature: 0.3,
            max_tokens: 100,
        });

        try {
            const content = completion.choices[0]?.message?.content || '';
            // Extract JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    passed: parsed.score >= 70,
                    score: parsed.score,
                    reason: parsed.reason
                };
            }
        } catch {
            // Parse error
        }

        return {
            passed: false,
            score: 0,
            reason: 'Failed to evaluate response'
        };
    }

    /**
     * Ensure test workspace exists
     */
    private async ensureWorkspace(): Promise<void> {
        if (!fs.existsSync(this.workspaceDir)) {
            fs.mkdirSync(this.workspaceDir, { recursive: true });
        }
    }
}

// ============================================================================
// E2E Test Harness - Simulated Claude (for webview testing)
// ============================================================================

export interface SimulatedClaudeResponse {
    type: 'text' | 'code' | 'tool_use' | 'thinking' | 'diff';
    content: string;
    language?: string;
    filePath?: string;
}

export class E2ESimulatedClaudeHarness {
    private groq: Groq;

    constructor(groqApiKey?: string) {
        this.groq = new Groq({
            apiKey: groqApiKey || process.env.GROQ_API_KEY,
        });
    }

    /**
     * Generate a Claude-like response for a given prompt type
     */
    async generateClaudeResponse(
        promptType: 'explanation' | 'code' | 'error' | 'thinking' | 'diff' | 'mixed'
    ): Promise<SimulatedClaudeResponse[]> {
        const prompts: Record<string, string> = {
            explanation: `Generate a response explaining JavaScript closures. You MUST format it EXACTLY like this:

## Understanding Closures

A closure is a function that **remembers** its lexical scope.

Here are the *key points*:

- First bullet point about closures
- Second bullet point about scope
- Third bullet point about memory

In conclusion, closures are powerful.

Use ## for the header (not # or ###), use **bold** and *italic*, and use - for bullet points.`,

            code: `Generate a response showing a TypeScript utility function. You MUST format it EXACTLY like this:

## Helper Function

Here's a useful utility:

\`\`\`typescript
function debounce<T extends (...args: any[]) => void>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}
\`\`\`

Use the \`debounce\` function to limit calls.

Use ## for headers, \`\`\`typescript for code blocks, and \`backticks\` for inline code.`,

            error: `Generate a response explaining a TypeScript error. You MUST format it EXACTLY like this:

## Error Explanation

The error occurs because of a **type mismatch**.

\`\`\`
TypeError: Cannot read property 'map' of undefined
    at processData (app.ts:42)
\`\`\`

**How to fix it:**

- Check if the array exists before calling map
- Use optional chaining: \`data?.map()\`

Use ## for headers, code blocks for errors, and **bold** for emphasis.`,

            thinking: `Generate a response with thinking. Format EXACTLY like this:

<thinking>
Let me analyze this step by step:
1. First consideration
2. Second consideration
3. Conclusion from reasoning
</thinking>

## My Answer

Based on my analysis, here's the solution...

Use <thinking> tags, then ## header for the answer.`,

            diff: `Generate a response showing a code change. Format EXACTLY like this:

## Code Change

I'll update the function to handle edge cases:

\`\`\`diff
 function processData(data: string[]) {
-    return data.map(item => item.trim());
+    if (!data || data.length === 0) {
+        return [];
+    }
+    return data.map(item => item?.trim() ?? '');
 }
\`\`\`

Lines with **+** are additions, lines with **-** are removals.

Use ## header, \`\`\`diff code block, and **bold**.`,

            mixed: `Generate a complex response. You MUST format it EXACTLY like this:

## Overview

This is an *introduction* with **emphasis**.

Here's the code:

\`\`\`typescript
const example = "hello";
\`\`\`

**Key points:**

- First point with \`inline code\`
- Second point about *something*
- Third point that is **important**

Use ## header, *italic*, **bold**, \`\`\`typescript blocks, \`inline code\`, and - bullets.`
        };

        const completion = await this.groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `You are simulating Claude's markdown responses for testing a VS Code extension.
CRITICAL: Follow the EXACT format shown in the user's message. Do not deviate.
- Use ## for h2 headers (not # or ###)
- Use **text** for bold
- Use *text* for italic
- Use - for bullet points
- Use \`\`\`language for code blocks
- Use \`text\` for inline code
Output the markdown directly, no wrapping.`
                },
                {
                    role: 'user',
                    content: prompts[promptType]
                }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.7,
            max_tokens: 1500,
        });

        const content = completion.choices[0]?.message?.content || '';

        // Parse into structured response
        return this.parseResponse(content, promptType);
    }

    /**
     * Parse Groq's output into structured responses
     */
    private parseResponse(
        content: string,
        type: string
    ): SimulatedClaudeResponse[] {
        const responses: SimulatedClaudeResponse[] = [];

        if (type === 'thinking' && content.includes('<thinking>')) {
            const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/);
            if (thinkingMatch) {
                responses.push({
                    type: 'thinking',
                    content: thinkingMatch[1].trim()
                });
                content = content.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
            }
        }

        // Extract code blocks
        const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
        let match;
        let lastIndex = 0;

        while ((match = codeBlockRegex.exec(content)) !== null) {
            // Text before code block
            const textBefore = content.substring(lastIndex, match.index).trim();
            if (textBefore) {
                responses.push({ type: 'text', content: textBefore });
            }

            // Code block
            responses.push({
                type: 'code',
                content: match[2].trim(),
                language: match[1] || 'text'
            });

            lastIndex = match.index + match[0].length;
        }

        // Remaining text
        const remaining = content.substring(lastIndex).trim();
        if (remaining) {
            responses.push({ type: 'text', content: remaining });
        }

        // If no structured content found, return as single text
        if (responses.length === 0) {
            responses.push({ type: 'text', content });
        }

        return responses;
    }

    /**
     * Convert simulated response to Claude stream-json format
     */
    toClaudeMessage(responses: SimulatedClaudeResponse[]): ClaudeMessage {
        const content = responses.map(r => {
            if (r.type === 'thinking') {
                return { type: 'thinking', thinking: r.content };
            }
            if (r.type === 'code') {
                return { type: 'text', text: `\`\`\`${r.language || ''}\n${r.content}\n\`\`\`` };
            }
            return { type: 'text', text: r.content };
        });

        return {
            type: 'assistant',
            message: { content }
        };
    }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.includes('--real')) {
        // Run real Claude e2e test
        console.log('Running real Claude e2e test...\n');

        const harness = new E2ERealClaudeHarness();
        const testCase: E2ETestCase = {
            name: 'simple_explanation',
            scenario: 'Ask for an explanation of how async/await works in JavaScript',
            expectedBehavior: 'Claude should provide a clear explanation with code examples',
            maxTurns: 1,
            timeoutMs: 60000
        };

        harness.runTest(testCase).then(result => {
            console.log('\n=== E2E Test Result ===');
            console.log(`Test: ${result.testCase.name}`);
            console.log(`Prompt: ${result.generatedPrompt}`);
            console.log(`Duration: ${result.durationMs}ms`);
            console.log(`Passed: ${result.evaluation.passed}`);
            console.log(`Score: ${result.evaluation.score}`);
            console.log(`Reason: ${result.evaluation.reason}`);
            if (result.error) {
                console.log(`Error: ${result.error}`);
            }
        });

    } else if (args.includes('--simulated')) {
        // Generate simulated Claude response
        console.log('Generating simulated Claude response...\n');

        const harness = new E2ESimulatedClaudeHarness();
        const types = ['explanation', 'code', 'error', 'thinking', 'diff', 'mixed'] as const;
        const type = args[1] as typeof types[number] || 'mixed';

        harness.generateClaudeResponse(type).then(responses => {
            console.log('=== Simulated Response ===');
            for (const r of responses) {
                console.log(`[${r.type}${r.language ? `:${r.language}` : ''}]`);
                console.log(r.content);
                console.log('---');
            }

            console.log('\n=== As Claude Message ===');
            console.log(JSON.stringify(harness.toClaudeMessage(responses), null, 2));
        });

    } else {
        console.log(`E2E Test Harness

Usage:
  npx ts-node src/test/e2e/testHarness.ts --real        Run real Claude e2e test
  npx ts-node src/test/e2e/testHarness.ts --simulated   Generate simulated response
  npx ts-node src/test/e2e/testHarness.ts --simulated code   Generate code response

Requires:
  - GROQ_API_KEY environment variable
  - Claude CLI installed (for --real)`);
    }
}
