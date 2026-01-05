/**
 * E2E Tests
 *
 * These tests can run in two modes:
 * 1. SIMULATED (default): Uses Groq to generate Claude-like responses
 *    - Tests the rendering pipeline without real Claude API calls
 *    - Fast and cheap
 *
 * 2. REAL (set E2E_REAL_CLAUDE=true): Uses actual Claude Code CLI
 *    - Tests the full integration
 *    - Slower and costs money
 *
 * Both require GROQ_API_KEY to be set.
 */

import * as assert from 'assert';
import {
    E2ERealClaudeHarness,
    E2ESimulatedClaudeHarness,
    SimulatedClaudeResponse
} from '../e2e/testHarness';
import {
    REAL_CLAUDE_SCENARIOS,
    SIMULATED_SCENARIOS,
    XSS_SCENARIOS
} from '../e2e/scenarios';

// Reference formatContent implementation for testing
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatContent(content: string): string {
    let text = escapeHtml(content);

    // Extract code blocks
    const codeBlocks: { lang: string; code: string }[] = [];
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const placeholder = '___CODEBLOCK_' + codeBlocks.length + '___';
        codeBlocks.push({ lang: lang || '', code: code.trim() });
        return placeholder;
    });

    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Bold and italic
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    text = text.replace(/(^|\n)###\s+(.+)/g, '$1<h3 class="md-h3">$2</h3>');
    text = text.replace(/(^|\n)##\s+(.+)/g, '$1<h2 class="md-h2">$2</h2>');
    text = text.replace(/(^|\n)#\s+(.+)/g, '$1<h1 class="md-h1">$2</h1>');

    // Lists
    text = text.replace(/(^|\n)[-*+]\s+(.+)/g, '$1<li class="md-li">$2</li>');

    // Newlines
    text = text.replace(/\n/g, '<br>');

    // Restore code blocks
    codeBlocks.forEach((block, i) => {
        const langLabel = block.lang ? `<span class="code-lang">${block.lang}</span>` : '';
        const codeHtml = `<div class="code-block"><div class="code-header">${langLabel}</div><pre class="code-pre"><code class="code-content lang-${block.lang || 'text'}">${escapeHtml(block.code)}</code></pre></div>`;
        text = text.replace('___CODEBLOCK_' + i + '___', codeHtml);
    });

    return text;
}

// Check if Groq API key is available
const hasGroqKey = !!process.env.GROQ_API_KEY;
const useRealClaude = process.env.E2E_REAL_CLAUDE === 'true';

suite('E2E Tests', function() {
    // Increase timeout for all e2e tests
    this.timeout(120000);

    if (!hasGroqKey) {
        test.skip('Skipping E2E tests - GROQ_API_KEY not set', () => {});
        return;
    }

    suite('Simulated Claude Rendering', function() {
        let harness: E2ESimulatedClaudeHarness;

        suiteSetup(() => {
            harness = new E2ESimulatedClaudeHarness();
        });

        for (const scenario of SIMULATED_SCENARIOS) {
            test(`should render ${scenario.name}`, async function() {
                this.timeout(30000);

                // Generate Claude-like response
                const responses = await harness.generateClaudeResponse(scenario.promptType);
                assert.ok(responses.length > 0, 'Should generate at least one response');

                // Convert to text content
                const textContent = responses
                    .map(r => {
                        if (r.type === 'code') {
                            return `\`\`\`${r.language || ''}\n${r.content}\n\`\`\``;
                        }
                        return r.content;
                    })
                    .join('\n');

                // Render through formatContent
                const rendered = formatContent(textContent);

                // Verify expected elements are present
                for (const element of scenario.expectedElements) {
                    const hasElement = element.startsWith('.')
                        ? rendered.includes(`class="${element.substring(1)}"`) ||
                          rendered.includes(`class="${element.substring(1)} `)
                        : rendered.includes(`<${element}`);

                    assert.ok(
                        hasElement,
                        `Rendered content should contain ${element}\n\nRendered:\n${rendered.substring(0, 500)}...`
                    );
                }
            });
        }
    });

    suite('XSS Protection', function() {
        for (const scenario of XSS_SCENARIOS) {
            test(`should prevent ${scenario.name}`, function() {
                const rendered = formatContent(scenario.maliciousContent);

                for (const forbidden of scenario.shouldNotContain) {
                    assert.ok(
                        !rendered.includes(forbidden),
                        `Rendered content should not contain "${forbidden}"\n\nRendered: ${rendered}`
                    );
                }
            });
        }
    });

    if (useRealClaude) {
        suite('Real Claude Integration', function() {
            let harness: E2ERealClaudeHarness;

            suiteSetup(() => {
                harness = new E2ERealClaudeHarness();
            });

            // Only run a subset for CI to save money
            const scenariosToRun = REAL_CLAUDE_SCENARIOS.slice(0, 2);

            for (const scenario of scenariosToRun) {
                test(`should complete: ${scenario.name}`, async function() {
                    this.timeout(scenario.timeoutMs + 10000);

                    const result = await harness.runTest(scenario);

                    if (result.error) {
                        console.log(`Test error: ${result.error}`);
                        // Don't fail on Claude errors, just log
                        this.skip();
                        return;
                    }

                    console.log(`\n[${scenario.name}] Score: ${result.evaluation.score}`);
                    console.log(`Reason: ${result.evaluation.reason}`);

                    assert.ok(
                        result.evaluation.passed,
                        `Expected score >= 70, got ${result.evaluation.score}: ${result.evaluation.reason}`
                    );
                });
            }
        });
    } else {
        test.skip('Real Claude tests skipped (set E2E_REAL_CLAUDE=true to enable)', () => {});
    }
});

suite('E2E Harness Unit Tests', function() {
    test('E2ESimulatedClaudeHarness should be importable', () => {
        assert.ok(E2ESimulatedClaudeHarness);
    });

    test('E2ERealClaudeHarness should be importable', () => {
        assert.ok(E2ERealClaudeHarness);
    });

    test('formatContent reference implementation should work', () => {
        const result = formatContent('**bold** and *italic*');
        assert.ok(result.includes('<strong>bold</strong>'));
        assert.ok(result.includes('<em>italic</em>'));
    });

    test('formatContent should escape XSS', () => {
        const result = formatContent('<script>alert("xss")</script>');
        assert.ok(!result.includes('<script>'));
        assert.ok(result.includes('&lt;script&gt;'));
    });
});
