/**
 * Test fixture generator using Groq to simulate Claude Code responses
 *
 * This module generates realistic test fixtures that mimic how Claude Code
 * formats its responses, allowing us to test the webview rendering pipeline
 * without needing actual Claude API calls.
 */

import Groq from 'groq-sdk';
import * as fs from 'fs';
import * as path from 'path';

// Types for Claude-like responses
export interface ClaudeResponseFixture {
    id: string;
    description: string;
    type: 'text' | 'code' | 'tool_use' | 'thinking' | 'error' | 'mixed';
    input: string;
    expectedOutput: string;
    metadata?: {
        hasMarkdown?: boolean;
        hasCodeBlocks?: boolean;
        languages?: string[];
        hasToolUse?: boolean;
        hasThinking?: boolean;
        xssVectors?: boolean;
    };
}

// Prompts to generate different types of Claude-like responses
const FIXTURE_PROMPTS = {
    markdown_basic: `Generate a response that uses basic markdown formatting:
- Use **bold** and *italic* text
- Include a ## header
- Add a bulleted list with 3 items
- Add a numbered list with 3 items
- Include a > blockquote
Keep the response about explaining a simple coding concept.`,

    code_javascript: `Generate a response explaining a JavaScript function.
Include a code block with \`\`\`javascript that shows:
- A function with parameters
- Comments explaining the code
- Use of const/let, arrow functions
- A return statement
Keep it under 20 lines of code.`,

    code_python: `Generate a response explaining a Python function.
Include a code block with \`\`\`python that shows:
- A function with type hints
- A docstring
- Use of list comprehension
- Exception handling
Keep it under 20 lines of code.`,

    code_typescript: `Generate a response explaining a TypeScript interface and class.
Include a code block with \`\`\`typescript that shows:
- An interface definition
- A class implementing the interface
- Generic types
- Async/await usage
Keep it under 25 lines of code.`,

    code_mixed: `Generate a response that includes multiple code blocks:
1. A \`\`\`bash command example
2. A \`\`\`json configuration example
3. A \`\`\`typescript code example
Each should be 3-5 lines. Explain what each does.`,

    tool_use_read: `Simulate a response where you're reading a file.
Format it as if you just used a Read tool:
"I'll read the file to understand its contents."
Then show what the file contains with a code block.
Then explain what you found.`,

    tool_use_edit: `Simulate a response where you're editing a file.
Format it as if you just used an Edit tool:
"I'll update the function to fix the bug."
Show the change with a diff-like format or before/after code blocks.
Explain the change you made.`,

    thinking_extended: `Generate a response that includes extended thinking.
Start with a section marked <thinking> that shows step-by-step reasoning:
- Analyze the problem
- Consider alternatives
- Choose an approach
</thinking>
Then provide the actual answer with code.`,

    error_network: `Generate a response that describes a network error scenario.
Include text like "connection refused", "ECONNREFUSED", "timeout".
Explain what might have caused it and how to fix it.`,

    error_permission: `Generate a response about a permission error.
Include text like "permission denied", "403 Forbidden", "unauthorized".
Explain the access issue and how to resolve it.`,

    mixed_complex: `Generate a complex response that includes:
1. An introduction paragraph with **bold** text
2. A ## header
3. A numbered list explaining steps
4. A \`\`\`typescript code block (10 lines)
5. An inline \`code reference\`
6. A link format [like this](http://example.com)
7. A final summary paragraph`,
};

// XSS test vectors - these should be escaped by formatContent
export const XSS_TEST_VECTORS: ClaudeResponseFixture[] = [
    {
        id: 'xss_script_tag',
        description: 'Script tag injection',
        type: 'text',
        input: 'user message',
        expectedOutput: '<script>alert("xss")</script>',
        metadata: { xssVectors: true }
    },
    {
        id: 'xss_img_onerror',
        description: 'Image onerror injection',
        type: 'text',
        input: 'user message',
        expectedOutput: '<img src="x" onerror="alert(\'xss\')">',
        metadata: { xssVectors: true }
    },
    {
        id: 'xss_event_handler',
        description: 'Event handler injection',
        type: 'text',
        input: 'user message',
        expectedOutput: '<div onmouseover="alert(\'xss\')">hover me</div>',
        metadata: { xssVectors: true }
    },
    {
        id: 'xss_javascript_url',
        description: 'JavaScript URL injection',
        type: 'text',
        input: 'user message',
        expectedOutput: '<a href="javascript:alert(\'xss\')">click me</a>',
        metadata: { xssVectors: true }
    },
    {
        id: 'xss_in_code_block',
        description: 'XSS inside code block',
        type: 'code',
        input: 'user message',
        expectedOutput: '```html\n<script>alert("xss")</script>\n```',
        metadata: { xssVectors: true, hasCodeBlocks: true, languages: ['html'] }
    },
    {
        id: 'xss_markdown_link',
        description: 'XSS in markdown link',
        type: 'text',
        input: 'user message',
        expectedOutput: '[click me](javascript:alert(\'xss\'))',
        metadata: { xssVectors: true, hasMarkdown: true }
    },
    {
        id: 'xss_nested_html',
        description: 'Nested HTML entities',
        type: 'text',
        input: 'user message',
        expectedOutput: '&lt;script&gt;alert("still escaped")&lt;/script&gt;',
        metadata: { xssVectors: true }
    },
];

export class FixtureGenerator {
    private groq: Groq;
    private outputDir: string;

    constructor(apiKey?: string) {
        this.groq = new Groq({
            apiKey: apiKey || process.env.GROQ_API_KEY,
        });
        this.outputDir = path.join(__dirname, 'generated');
    }

    async generateFixture(
        promptKey: keyof typeof FIXTURE_PROMPTS,
        id: string
    ): Promise<ClaudeResponseFixture> {
        const prompt = FIXTURE_PROMPTS[promptKey];

        const completion = await this.groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `You are simulating Claude Code responses for testing purposes.
Generate responses that match how Claude Code formats its output:
- Use markdown formatting appropriately
- Use proper code block syntax with language tags
- Be concise but realistic
- Do NOT wrap the entire response in a code block`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            model: 'llama-3.1-8b-instant', // Fast and cheap for fixtures
            temperature: 0.7,
            max_tokens: 1024,
        });

        const output = completion.choices[0]?.message?.content || '';

        // Analyze the output to set metadata
        const hasCodeBlocks = /```\w*\n[\s\S]*?```/.test(output);
        const hasMarkdown = /(\*\*|__|##|^\s*[-*+]\s|\d+\.\s|>\s)/.test(output);
        const languages = [...output.matchAll(/```(\w+)/g)].map(m => m[1]);

        return {
            id,
            description: `Generated from ${promptKey}`,
            type: this.inferType(output),
            input: prompt,
            expectedOutput: output,
            metadata: {
                hasMarkdown,
                hasCodeBlocks,
                languages: languages.length > 0 ? languages : undefined,
            }
        };
    }

    private inferType(output: string): ClaudeResponseFixture['type'] {
        if (output.includes('<thinking>')) return 'thinking';
        if (/error|failed|exception/i.test(output)) return 'error';
        if (/```\w*\n/.test(output)) {
            if (/\*\*|##/.test(output)) return 'mixed';
            return 'code';
        }
        return 'text';
    }

    async generateAllFixtures(): Promise<ClaudeResponseFixture[]> {
        const fixtures: ClaudeResponseFixture[] = [];

        for (const [key, _] of Object.entries(FIXTURE_PROMPTS)) {
            console.log(`Generating fixture: ${key}`);
            try {
                const fixture = await this.generateFixture(
                    key as keyof typeof FIXTURE_PROMPTS,
                    `groq_${key}`
                );
                fixtures.push(fixture);
                // Small delay to avoid rate limits
                await new Promise(r => setTimeout(r, 200));
            } catch (error) {
                console.error(`Failed to generate ${key}:`, error);
            }
        }

        // Add XSS test vectors
        fixtures.push(...XSS_TEST_VECTORS);

        return fixtures;
    }

    async saveFixtures(fixtures: ClaudeResponseFixture[]): Promise<void> {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        const outputPath = path.join(this.outputDir, 'claude-responses.json');
        fs.writeFileSync(outputPath, JSON.stringify(fixtures, null, 2));
        console.log(`Saved ${fixtures.length} fixtures to ${outputPath}`);
    }
}

// CLI entry point
if (require.main === module) {
    const generator = new FixtureGenerator();
    generator.generateAllFixtures()
        .then(fixtures => generator.saveFixtures(fixtures))
        .then(() => console.log('Done!'))
        .catch(console.error);
}
