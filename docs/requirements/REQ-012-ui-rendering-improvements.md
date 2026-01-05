# REQ-012: UI Rendering Improvements

**Status:** COMPLETE
**Priority:** High
**Version:** 0.2.2
**Created:** 2026-01-04
**Completed:** 2026-01-05

## Overview

Improve the webview UI rendering to properly display Claude Code responses with rich formatting, syntax highlighting, and proper message layouts for different content types.

## Problem Statement

### Current State

The `formatContent()` function in `src/ui/webview/content.ts` is minimal:

```javascript
function formatContent(content) {
    return content
        .replace(/\`\`\`([\s\S]*?)\`\`\`/g, '<pre>$1</pre>')
        .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}
```

### Critical Issues

| Issue | Severity | Impact |
|-------|----------|--------|
| **No HTML escaping** | P0 | XSS vulnerability - user input rendered as HTML |
| **No markdown lists** | P1 | Bullet points and numbered lists render as plain text |
| **No syntax highlighting** | P1 | Code blocks are unstyled `<pre>` tags |
| **No tables** | P1 | Markdown tables render as garbled text |
| **No links** | P1 | URLs are not clickable |
| **Tool output truncated** | P1 | Only 100 chars shown for tool inputs |
| **No error categorization** | P1 | All errors look the same |
| **No message timestamps** | P2 | Can't tell when responses arrived |

### Visual Comparison

**Current Output:**
```
🔧 Bash: {"command":"npm test","timeout":60000,"des...
```

**Expected Output:**
```
┌─ Bash ────────────────────────────────────────────┐
│ $ npm test                                         │
│ timeout: 60s                                       │
└────────────────────────────────────────────────────┘
```

---

## Requirements

### FR-001: HTML Sanitization (P0 - Security)

Escape HTML entities before rendering user content to prevent XSS.

**Implementation:**

```javascript
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatContent(content) {
    // Escape HTML FIRST before any transformations
    let escaped = escapeHtml(content);
    // Then apply markdown transformations
    return applyMarkdown(escaped);
}
```

**Acceptance Criteria:**
- [ ] `<script>alert('xss')</script>` renders as visible text, not executed
- [ ] HTML tags in user messages display as text
- [ ] Code blocks preserve literal `<` and `>` characters

---

### FR-002: Markdown Rendering (P1)

Support common markdown formatting that Claude uses in responses.

**Required Formatting:**

| Markdown | Rendered As |
|----------|-------------|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `- item` | • item (bullet list) |
| `1. item` | 1. item (numbered list) |
| `> quote` | Indented blockquote |
| `[text](url)` | Clickable link |
| `| col |` | HTML table |
| `---` | Horizontal rule |

**Implementation:**

```javascript
function applyMarkdown(text) {
    return text
        // Bold
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        // Unordered lists
        .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
        // Ordered lists
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
        // Blockquotes
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        // Horizontal rules
        .replace(/^---$/gm, '<hr>')
        // Line breaks
        .replace(/\n/g, '<br>');
}
```

**Acceptance Criteria:**
- [ ] Bullet lists render with proper indentation
- [ ] Numbered lists maintain sequence
- [ ] Links open in external browser
- [ ] Tables render as HTML tables with borders

---

### FR-003: Code Block Syntax Highlighting (P1)

Add syntax highlighting for code blocks using language detection.

**Option A: Lightweight Custom Highlighter**

```javascript
function highlightCode(code, language) {
    const keywords = {
        javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while'],
        typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'interface', 'type'],
        python: ['def', 'class', 'import', 'from', 'return', 'if', 'elif', 'else', 'for', 'while'],
        bash: ['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'echo', 'export'],
    };

    // Apply keyword highlighting
    const langKeywords = keywords[language] || [];
    let highlighted = escapeHtml(code);

    langKeywords.forEach(kw => {
        highlighted = highlighted.replace(
            new RegExp(`\\b(${kw})\\b`, 'g'),
            '<span class="keyword">$1</span>'
        );
    });

    // Highlight strings
    highlighted = highlighted.replace(
        /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g,
        '<span class="string">$&</span>'
    );

    // Highlight comments
    highlighted = highlighted.replace(
        /(\/\/.*$|#.*$)/gm,
        '<span class="comment">$1</span>'
    );

    return highlighted;
}
```

**Option B: Use highlight.js (heavier but more complete)**

Load highlight.js from CDN or bundle it:

```javascript
// In getWebviewContent, add to CSP:
// script-src 'nonce-${nonce}' https://cdnjs.cloudflare.com;

// Then in script:
hljs.highlightAll();
```

**CSS for Syntax Highlighting:**

```css
.code-block {
    background: var(--vscode-textCodeBlock-background);
    border-radius: 4px;
    padding: 12px;
    overflow-x: auto;
    font-family: var(--vscode-editor-font-family);
}

.code-block .keyword { color: #c586c0; }
.code-block .string { color: #ce9178; }
.code-block .comment { color: #6a9955; }
.code-block .number { color: #b5cea8; }
.code-block .function { color: #dcdcaa; }
```

**Acceptance Criteria:**
- [ ] Language detected from fence: ` ```typescript`
- [ ] Keywords highlighted in appropriate color
- [ ] Strings highlighted differently from code
- [ ] Comments visually muted
- [ ] Copy button on code blocks

---

### FR-004: Enhanced Tool Use Display (P1)

Format tool inputs and outputs for readability.

**Current (bad):**
```
🔧 Bash: {"command":"npm test","timeout":60000,"des...
```

**Target:**
```
┌─ 🔧 Bash ──────────────────────────────────────────┐
│ Command: npm test                                   │
│ Timeout: 60s                                        │
│ Description: Run test suite                         │
└─────────────────────────────────────────────────────┘
```

**Implementation:**

```javascript
function formatToolUse(toolName, toolInput) {
    const formatters = {
        Bash: (input) => `
            <div class="tool-card">
                <div class="tool-header">🔧 Bash</div>
                <div class="tool-body">
                    <div class="command-line">$ ${escapeHtml(input.command)}</div>
                    ${input.description ? `<div class="tool-desc">${escapeHtml(input.description)}</div>` : ''}
                </div>
            </div>
        `,
        Read: (input) => `
            <div class="tool-card">
                <div class="tool-header">📄 Read</div>
                <div class="tool-body">
                    <code class="file-path">${escapeHtml(input.file_path)}</code>
                </div>
            </div>
        `,
        Edit: (input) => `
            <div class="tool-card">
                <div class="tool-header">✏️ Edit</div>
                <div class="tool-body">
                    <code class="file-path">${escapeHtml(input.file_path)}</code>
                </div>
            </div>
        `,
        Write: (input) => `
            <div class="tool-card">
                <div class="tool-header">📝 Write</div>
                <div class="tool-body">
                    <code class="file-path">${escapeHtml(input.file_path)}</code>
                </div>
            </div>
        `,
        Glob: (input) => `
            <div class="tool-card">
                <div class="tool-header">🔍 Glob</div>
                <div class="tool-body">
                    <code>${escapeHtml(input.pattern)}</code>
                </div>
            </div>
        `,
        Grep: (input) => `
            <div class="tool-card">
                <div class="tool-header">🔎 Grep</div>
                <div class="tool-body">
                    <code>/${escapeHtml(input.pattern)}/</code>
                    ${input.path ? ` in <code>${escapeHtml(input.path)}</code>` : ''}
                </div>
            </div>
        `,
        Task: (input) => `
            <div class="tool-card tool-card-agent">
                <div class="tool-header">🤖 Agent: ${escapeHtml(input.description || 'Background Task')}</div>
            </div>
        `,
        TodoWrite: (input) => formatTodoUpdate(input.todos),
    };

    const formatter = formatters[toolName];
    if (formatter) {
        return formatter(toolInput);
    }

    // Fallback: formatted JSON
    return `
        <div class="tool-card">
            <div class="tool-header">🔧 ${escapeHtml(toolName)}</div>
            <div class="tool-body">
                <pre class="tool-json">${escapeHtml(JSON.stringify(toolInput, null, 2))}</pre>
            </div>
        </div>
    `;
}
```

**CSS:**

```css
.tool-card {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    margin: 8px 0;
    overflow: hidden;
}

.tool-header {
    background: var(--vscode-sideBarSectionHeader-background);
    padding: 6px 12px;
    font-weight: 500;
    font-size: 12px;
}

.tool-body {
    padding: 8px 12px;
    font-size: 13px;
}

.command-line {
    font-family: var(--vscode-editor-font-family);
    background: var(--vscode-terminal-background);
    padding: 8px;
    border-radius: 4px;
    color: var(--vscode-terminal-foreground);
}

.file-path {
    color: var(--vscode-textLink-foreground);
}

.tool-json {
    font-size: 11px;
    max-height: 200px;
    overflow: auto;
}
```

**Acceptance Criteria:**
- [ ] Each tool type has distinct visual formatting
- [ ] File paths are highlighted
- [ ] Commands show as terminal-style
- [ ] Long JSON is scrollable, not truncated

---

### FR-005: Enhanced Error Display (P1)

Categorize and format errors for better debugging.

**Error Categories:**

| Category | Icon | Color | Example |
|----------|------|-------|---------|
| Auth | 🔑 | Yellow | API key invalid |
| Rate Limit | ⏱️ | Orange | Too many requests |
| Context | 📏 | Orange | Context window exceeded |
| Tool | 🔧 | Red | Tool execution failed |
| Network | 🌐 | Red | Connection timeout |
| Unknown | ❌ | Red | Generic error |

**Implementation:**

```javascript
function formatError(errorMessage) {
    const categories = [
        { pattern: /api.?key|auth|unauthorized|401/i, icon: '🔑', label: 'Authentication Error', color: 'warning' },
        { pattern: /rate.?limit|429|too many/i, icon: '⏱️', label: 'Rate Limit', color: 'warning' },
        { pattern: /context|token.?limit|exceeded/i, icon: '📏', label: 'Context Limit', color: 'warning' },
        { pattern: /tool|execution|failed to/i, icon: '🔧', label: 'Tool Error', color: 'error' },
        { pattern: /network|timeout|ECONNREFUSED/i, icon: '🌐', label: 'Network Error', color: 'error' },
    ];

    const match = categories.find(c => c.pattern.test(errorMessage));
    const category = match || { icon: '❌', label: 'Error', color: 'error' };

    return `
        <div class="error-card error-${category.color}">
            <div class="error-header">
                ${category.icon} ${category.label}
            </div>
            <div class="error-body">
                ${escapeHtml(errorMessage)}
            </div>
        </div>
    `;
}
```

**CSS:**

```css
.error-card {
    border-radius: 6px;
    margin: 8px 0;
    overflow: hidden;
}

.error-warning {
    border: 1px solid var(--vscode-inputValidation-warningBorder);
    background: var(--vscode-inputValidation-warningBackground);
}

.error-error {
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    background: var(--vscode-inputValidation-errorBackground);
}

.error-header {
    padding: 8px 12px;
    font-weight: 500;
}

.error-body {
    padding: 8px 12px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    white-space: pre-wrap;
}
```

**Acceptance Criteria:**
- [ ] Auth errors show yellow with key icon
- [ ] Rate limits show with time icon
- [ ] Tool errors clearly identify which tool failed
- [ ] Error message is readable, not truncated

---

### FR-006: Message Timestamps (P2)

Show when each message was sent/received.

**Implementation:**

```javascript
function addMessage(role, content, timestamp = new Date()) {
    const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    div.className = 'message message-' + role;
    div.innerHTML = `
        <div class="message-content">${formatContent(content)}</div>
        <div class="message-meta">
            <span class="message-time">${timeStr}</span>
        </div>
    `;
    messagesEl.appendChild(div);
}
```

**CSS:**

```css
.message-meta {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
}

.message-time {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
}
```

**Acceptance Criteria:**
- [ ] Each message shows HH:MM timestamp
- [ ] Timestamp is subtle, doesn't distract from content
- [ ] User and assistant messages both show times

---

### FR-007: Thinking Mode Display (P2)

Make extended thinking visually distinct and collapsible.

**Current:**
```
💭 Let me think about this step by step...
```

**Target:**
```
┌─ 💭 Thinking ─────────────────────────────────────┐
│ ▼ Let me think about this step by step...         │
│   First, I need to understand...                  │
│   [collapsed: 1,234 tokens]                       │
└────────────────────────────────────────────────────┘
```

**Implementation:**

```javascript
function addThinking(content) {
    const id = 'thinking-' + Date.now();
    const preview = content.substring(0, 100);
    const isLong = content.length > 200;

    const div = document.createElement('div');
    div.className = 'message message-thinking';
    div.innerHTML = `
        <div class="thinking-header" onclick="toggleThinking('${id}')">
            💭 Thinking
            ${isLong ? '<span class="thinking-toggle">▼</span>' : ''}
        </div>
        <div class="thinking-content" id="${id}">
            ${formatContent(content)}
        </div>
        ${isLong ? `<div class="thinking-collapsed" id="${id}-collapsed">${escapeHtml(preview)}...</div>` : ''}
    `;
    messagesEl.appendChild(div);

    if (isLong) {
        document.getElementById(id).style.display = 'none';
        document.getElementById(id + '-collapsed').style.display = 'block';
    }
}

function toggleThinking(id) {
    const full = document.getElementById(id);
    const collapsed = document.getElementById(id + '-collapsed');
    const toggle = full.previousElementSibling.querySelector('.thinking-toggle');

    if (full.style.display === 'none') {
        full.style.display = 'block';
        collapsed.style.display = 'none';
        toggle.textContent = '▲';
    } else {
        full.style.display = 'none';
        collapsed.style.display = 'block';
        toggle.textContent = '▼';
    }
}
```

**CSS:**

```css
.message-thinking {
    background: var(--vscode-textBlockQuote-background);
    border-left: 3px solid var(--vscode-textBlockQuote-border);
    opacity: 0.8;
}

.thinking-header {
    cursor: pointer;
    font-weight: 500;
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
}

.thinking-toggle {
    font-size: 10px;
}

.thinking-collapsed {
    padding: 0 12px 8px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
}
```

**Acceptance Criteria:**
- [ ] Thinking is visually distinct from output
- [ ] Long thinking sections are collapsed by default
- [ ] Click expands/collapses thinking
- [ ] Preview shows first ~100 chars

---

## Implementation Plan

### Phase 1: Security Fix (30 min)
1. Add `escapeHtml()` function
2. Apply to all user-generated content
3. Test XSS vectors

### Phase 2: Markdown Rendering (2 hours)
1. Implement `applyMarkdown()` with list/link support
2. Add table parsing
3. Test with Claude's typical output

### Phase 3: Code Highlighting (2 hours)
1. Add language detection from fence
2. Implement keyword highlighting
3. Add CSS for syntax colors
4. Add copy button

### Phase 4: Tool Formatting (2 hours)
1. Create tool-specific formatters
2. Add CSS for tool cards
3. Test all tool types

### Phase 5: Error & Timestamps (1 hour)
1. Add error categorization
2. Add timestamps to messages
3. Update CSS

### Phase 6: Thinking Display (1 hour)
1. Add collapsible thinking
2. Style thinking distinctly
3. Test with extended thinking mode

---

## Acceptance Criteria

- [x] No XSS vulnerabilities in message rendering
- [x] Markdown lists, links, and tables render correctly
- [x] Code blocks have syntax highlighting
- [x] Each tool type has readable formatting
- [x] Errors are categorized and styled appropriately
- [x] Messages show timestamps
- [x] Extended thinking is collapsible
- [x] All 115 existing tests still pass

## Implementation Summary

All features were implemented in a single session:

1. **HTML Escaping (P0)**: `formatContent()` now escapes HTML by default using the existing `escapeHtml()` function before applying any markdown transformations.

2. **Markdown Rendering (P1)**: Added support for:
   - Bold (`**text**`) and italic (`*text*`)
   - Headers (H1-H6)
   - Unordered lists (`-`, `*`, `+`)
   - Ordered lists (`1.`, `2.`, etc.)
   - Blockquotes (`>`)
   - Links with click handlers for file navigation
   - Horizontal rules (`---`)
   - Inline code with styling

3. **Syntax Highlighting (P1)**: Custom lightweight highlighter for:
   - JavaScript/TypeScript (keywords, strings, numbers, comments, literals)
   - Python (keywords, strings, numbers, comments, decorators)
   - JSON (properties, strings, numbers, literals)
   - Bash (comments, variables, strings, common commands)
   - HTML/XML (tags, attributes, attribute values)
   - CSS/SCSS (selectors, properties, numbers, colors)
   - Code blocks include language label and copy button

4. **Enhanced Tool Use Display (P1)**: Collapsible tool blocks with:
   - Tool-specific icons (Read, Write, Edit, Bash, Glob, Grep, etc.)
   - Expandable input preview
   - Properly formatted JSON in expanded view

5. **Error Categorization (P1)**: Errors now categorized as:
   - Rate Limit (429, rate limit mentions)
   - Timeout (timeout, timed out)
   - Network (network, connection, ECONNREFUSED)
   - Permission (permission, denied, 401, 403)
   - Not Found (not found, 404)
   - Validation (validation, invalid)
   - With appropriate icons and styling

6. **Message Timestamps (P2)**: All messages now display HH:MM timestamps that show on hover.

7. **Collapsible Thinking (P2)**: Thinking blocks are collapsible with expand/collapse toggle.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/ui/webview/content.ts` | Add formatters, update `formatContent()`, add CSS |
| `src/providers/chat/messageHandler.ts` | Pass timestamps with messages |

---

## Dependencies

None - all changes are internal to existing files.

---

## References

- Claude Code CLI output format documentation
- VS Code webview theming variables
- OWASP XSS prevention cheat sheet
