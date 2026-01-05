/**
 * E2E Test Scenarios
 *
 * These define various test cases for the e2e harness.
 */

import { E2ETestCase } from './testHarness';
import * as fs from 'fs';
import * as path from 'path';

const TEST_WORKSPACE = path.join(__dirname, '..', '..', '..', 'test-workspace');

/**
 * Real Claude E2E Scenarios
 * These test the full flow: Groq generates prompt → Claude responds → Groq evaluates
 */
export const REAL_CLAUDE_SCENARIOS: E2ETestCase[] = [
    {
        name: 'simple_explanation',
        scenario: 'Ask Claude to explain a programming concept (like closures or promises)',
        expectedBehavior: 'Claude provides a clear explanation with examples',
        maxTurns: 1,
        timeoutMs: 60000
    },
    {
        name: 'read_file',
        scenario: 'Ask Claude to read and summarize a specific file',
        expectedBehavior: 'Claude uses the Read tool and provides a summary',
        workspaceSetup: async () => {
            if (!fs.existsSync(TEST_WORKSPACE)) {
                fs.mkdirSync(TEST_WORKSPACE, { recursive: true });
            }
            fs.writeFileSync(
                path.join(TEST_WORKSPACE, 'sample.ts'),
                `/**
 * A sample TypeScript file for testing
 */
export function greet(name: string): string {
    return \`Hello, \${name}!\`;
}

export function add(a: number, b: number): number {
    return a + b;
}
`
            );
        },
        workspaceCleanup: async () => {
            const file = path.join(TEST_WORKSPACE, 'sample.ts');
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        },
        maxTurns: 2,
        timeoutMs: 60000
    },
    {
        name: 'code_generation',
        scenario: 'Ask Claude to write a simple utility function',
        expectedBehavior: 'Claude provides working code with explanation',
        maxTurns: 1,
        timeoutMs: 60000
    },
    {
        name: 'error_explanation',
        scenario: 'Show Claude an error message and ask for help debugging',
        expectedBehavior: 'Claude explains the error and suggests fixes',
        maxTurns: 1,
        timeoutMs: 60000
    },
    {
        name: 'multi_turn_conversation',
        scenario: 'Start a conversation and ask follow-up questions',
        expectedBehavior: 'Claude maintains context across turns',
        maxTurns: 3,
        timeoutMs: 120000
    }
];

/**
 * Simulated Claude Scenarios
 * These test the webview rendering without hitting real Claude API
 */
export interface SimulatedScenario {
    name: string;
    description: string;
    promptType: 'explanation' | 'code' | 'error' | 'thinking' | 'diff' | 'mixed';
    expectedElements: string[];  // CSS selectors or content checks
}

export const SIMULATED_SCENARIOS: SimulatedScenario[] = [
    {
        name: 'markdown_explanation',
        description: 'Test markdown rendering (headers, bold, italic, lists)',
        promptType: 'explanation',
        expectedElements: [
            'h2',                // ## headers
            'strong',            // **bold**
            'em',                // *italic*
            'li',                // - bullet points
            'br'                 // Line breaks
        ]
    },
    {
        name: 'code_block_rendering',
        description: 'Test code block rendering with syntax highlighting',
        promptType: 'code',
        expectedElements: [
            'h2',                // ## header
            '.code-block',       // Code block container
            '.code-lang',        // Language label
            'pre', 'code',       // Code elements
            '.inline-code'       // `inline` code
        ]
    },
    {
        name: 'error_message',
        description: 'Test error message display',
        promptType: 'error',
        expectedElements: [
            'h2',                // ## header
            '.code-block',       // Error in code block
            'strong',            // **bold** emphasis
            'li'                 // - bullet fixes
        ]
    },
    {
        name: 'thinking_display',
        description: 'Test thinking/reasoning display',
        promptType: 'thinking',
        expectedElements: [
            'h2'                 // ## header after thinking
        ]
    },
    {
        name: 'diff_display',
        description: 'Test diff rendering',
        promptType: 'diff',
        expectedElements: [
            'h2',                // ## header
            '.code-block',       // Diff in code block
            'strong'             // **bold** for +/-
        ]
    },
    {
        name: 'mixed_content',
        description: 'Test complex mixed content rendering',
        promptType: 'mixed',
        expectedElements: [
            'h2',                // ## header
            'strong',            // **bold**
            'em',                // *italic*
            '.code-block',       // Code blocks
            '.inline-code',      // `inline code`
            'li'                 // - bullet points
        ]
    }
];

/**
 * XSS Attack Scenarios
 * These verify the webview properly escapes malicious content
 */
export const XSS_SCENARIOS = [
    {
        name: 'script_injection',
        maliciousContent: '<script>alert("xss")</script>',
        shouldNotContain: ['<script>']
    },
    {
        name: 'img_onerror',
        maliciousContent: '<img src="x" onerror="alert(\'xss\')">',
        shouldNotContain: ['<img ']
    },
    {
        name: 'event_handler',
        maliciousContent: '<div onmouseover="alert(\'xss\')">hover</div>',
        shouldNotContain: ['<div ']
    },
    {
        name: 'javascript_url',
        maliciousContent: '[click](javascript:alert("xss"))',
        shouldNotContain: ['href="javascript:']
    },
    {
        name: 'nested_html',
        maliciousContent: '<<script>script>alert("xss")<</script>/script>',
        shouldNotContain: ['<script>']
    }
];
