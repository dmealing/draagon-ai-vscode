/**
 * Validates generated fixtures against the formatContent function
 * Run with: npx ts-node src/test/fixtures/validateFixtures.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Reference implementation matching the webview's formatContent
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatContent(content: string, options: { skipEscape?: boolean } = {}): string {
    const { skipEscape = false } = options;

    // Step 1: Escape HTML
    let text = skipEscape ? content : escapeHtml(content);

    // Step 2: Extract code blocks
    const codeBlocks: { lang: string; code: string }[] = [];
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const placeholder = '___CODEBLOCK_' + codeBlocks.length + '___';
        codeBlocks.push({ lang: lang || '', code: code.trim() });
        return placeholder;
    });

    // Step 3: Inline code
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Step 4: Bold and italic
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Step 5: Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link">$1</a>');

    // Step 6: Headers
    text = text.replace(/(^|\n)######\s+(.+)/g, '$1<h6 class="md-h6">$2</h6>');
    text = text.replace(/(^|\n)#####\s+(.+)/g, '$1<h5 class="md-h5">$2</h5>');
    text = text.replace(/(^|\n)####\s+(.+)/g, '$1<h4 class="md-h4">$2</h4>');
    text = text.replace(/(^|\n)###\s+(.+)/g, '$1<h3 class="md-h3">$2</h3>');
    text = text.replace(/(^|\n)##\s+(.+)/g, '$1<h2 class="md-h2">$2</h2>');
    text = text.replace(/(^|\n)#\s+(.+)/g, '$1<h1 class="md-h1">$2</h1>');

    // Step 7: Unordered lists
    text = text.replace(/(^|\n)[-*+]\s+(.+)/g, '$1<li class="md-li">$2</li>');

    // Step 8: Ordered lists
    text = text.replace(/(^|\n)(\d+)\.\s+(.+)/g, '$1<li class="md-li md-ol" value="$2">$2. $3</li>');

    // Step 9: Blockquotes
    text = text.replace(/^>\s+(.+)/gm, '<blockquote class="md-quote">$1</blockquote>');

    // Step 10: Horizontal rules
    text = text.replace(/(^|\n)---+/g, '$1<hr class="md-hr">');

    // Step 11: Newlines
    text = text.replace(/\n/g, '<br>');

    // Step 12: Restore code blocks
    codeBlocks.forEach((block, i) => {
        const langLabel = block.lang ? `<span class="code-lang">${block.lang}</span>` : '';
        const codeHtml = `<div class="code-block"><div class="code-header">${langLabel}</div><pre class="code-pre"><code class="code-content lang-${block.lang || 'text'}">${escapeHtml(block.code)}</code></pre></div>`;
        text = text.replace('___CODEBLOCK_' + i + '___', codeHtml);
    });

    return text;
}

interface Fixture {
    id: string;
    type: string;
    input: string;
    metadata?: {
        isXSS?: boolean;
        expectedSafe?: boolean;
        containsDangerousPatterns?: string[];
    };
}

interface ValidationResult {
    id: string;
    type: string;
    passed: boolean;
    errors: string[];
    warnings: string[];
}

function validateFixture(fixture: Fixture): ValidationResult {
    const result: ValidationResult = {
        id: fixture.id,
        type: fixture.type,
        passed: true,
        errors: [],
        warnings: []
    };

    try {
        const rendered = formatContent(fixture.input);

        // XSS checks
        if (rendered.includes('<script>') && !rendered.includes('&lt;script')) {
            result.errors.push('Raw <script> tag found in output');
            result.passed = false;
        }

        if (rendered.includes('<img ') && !rendered.includes('&lt;img')) {
            result.errors.push('Raw <img> tag found in output');
            result.passed = false;
        }

        if (rendered.includes('onerror=') && !rendered.includes('&lt;')) {
            result.errors.push('Potential XSS via onerror handler');
            result.passed = false;
        }

        if (rendered.includes('onmouseover=') && !rendered.includes('&lt;')) {
            result.errors.push('Potential XSS via onmouseover handler');
            result.passed = false;
        }

        // Check for proper code block rendering
        if (fixture.input.includes('```')) {
            if (!rendered.includes('code-block')) {
                result.warnings.push('Code block markers present but code-block class missing');
            }
        }

        // Check for proper markdown rendering
        if (fixture.input.includes('**') && !fixture.input.includes('```')) {
            if (!rendered.includes('<strong>') && !rendered.includes('&lt;strong')) {
                result.warnings.push('Bold markers present but <strong> tag missing');
            }
        }

        // For XSS fixtures, verify they're properly escaped
        if (fixture.metadata?.isXSS) {
            const dangerousPatterns = fixture.metadata.containsDangerousPatterns || [];
            for (const pattern of dangerousPatterns) {
                if (rendered.includes(`<${pattern}`) && !rendered.includes(`&lt;${pattern}`)) {
                    result.errors.push(`Dangerous pattern <${pattern}> not escaped`);
                    result.passed = false;
                }
            }
        }

    } catch (error) {
        result.errors.push(`Rendering failed: ${error}`);
        result.passed = false;
    }

    return result;
}

async function main() {
    const fixturesPath = path.join(__dirname, 'generated', 'claude-responses.json');

    if (!fs.existsSync(fixturesPath)) {
        console.error('No fixtures found. Run generateFixtures.ts first.');
        process.exit(1);
    }

    const fixtures: Fixture[] = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));
    console.log(`\nValidating ${fixtures.length} fixtures...\n`);

    const results: ValidationResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const fixture of fixtures) {
        const result = validateFixture(fixture);
        results.push(result);

        const status = result.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
        console.log(`${status} ${fixture.id} (${fixture.type})`);

        if (result.errors.length > 0) {
            result.errors.forEach(e => console.log(`    \x1b[31mERROR: ${e}\x1b[0m`));
        }
        if (result.warnings.length > 0) {
            result.warnings.forEach(w => console.log(`    \x1b[33mWARN: ${w}\x1b[0m`));
        }

        if (result.passed) {
            passed++;
        } else {
            failed++;
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(50));

    // Show sample rendered output
    console.log('\n--- Sample Rendered Output ---\n');
    const sample = fixtures.find(f => f.type === 'markdown_basic');
    if (sample) {
        console.log('Input:');
        console.log(sample.input.substring(0, 200) + '...\n');
        console.log('Rendered:');
        console.log(formatContent(sample.input).substring(0, 500) + '...\n');
    }

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
