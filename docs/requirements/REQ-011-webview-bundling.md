# REQ-011: Webview Bundling with esbuild

**Status:** PLANNED
**Priority:** Medium
**Version:** 0.3.0
**Created:** 2026-01-04

## Overview

Refactor the monolithic webview content file (`src/ui/webview/content.ts` - 3,061 lines) into a properly bundled, component-based architecture using esbuild.

## Problem Statement

### Current State

The webview is implemented as a single TypeScript function that returns a massive HTML string with inline CSS and JavaScript:

```
src/ui/webview/content.ts (3,061 lines)
├── getWebviewContent() function
├── getStyles() - ~800 lines of inline CSS
├── getScript() - ~1,500 lines of inline JavaScript
└── Helper functions (getNonce, etc.)
```

### Issues

| Issue | Impact | Severity |
|-------|--------|----------|
| No TypeScript in webview JS | No type safety, refactoring is error-prone | Medium |
| Inline CSS/JS | No syntax highlighting, linting, or formatting | Medium |
| No component architecture | Hard to maintain, test, or extend | Medium |
| No minification | ~100KB payload sent to webview | Low |
| No hot reload | Full rebuild required for any change | Low |
| No source maps | Debugging is difficult | Low |

### Metrics

- **File size:** 3,061 lines in single file
- **Bundle size:** ~100KB unminified
- **Test coverage:** 0% (inline JS cannot be unit tested)
- **Type safety:** 0% in webview JavaScript

---

## Requirements

### FR-001: Project Structure

Create a proper webview source directory structure:

```
src/ui/webview/
├── src/                          # Webview source (TypeScript)
│   ├── index.ts                  # Entry point
│   ├── app.ts                    # Main application
│   ├── components/
│   │   ├── MessageList.ts        # Chat message display
│   │   ├── InputArea.ts          # User input with toolbar
│   │   ├── PermissionDialog.ts   # REQ-001 permission UI
│   │   ├── DiffViewer.ts         # REQ-002 diff display
│   │   ├── ImageAttachment.ts    # REQ-003 image preview
│   │   ├── TokenDisplay.ts       # REQ-004 token stats
│   │   ├── HistoryPanel.ts       # REQ-005 history browser
│   │   ├── ThinkingIndicator.ts  # REQ-007 thinking mode
│   │   ├── QuestionPanel.ts      # AskUserQuestion UI
│   │   ├── TodoPanel.ts          # Task list display
│   │   └── CheckpointPanel.ts    # Backup checkpoints
│   ├── services/
│   │   ├── vscodeApi.ts          # VS Code API wrapper
│   │   ├── messageHandler.ts     # Message routing
│   │   └── state.ts              # UI state management
│   ├── styles/
│   │   ├── index.css             # Main stylesheet
│   │   ├── variables.css         # CSS custom properties
│   │   ├── components.css        # Component styles
│   │   └── themes.css            # Light/dark theme
│   └── types.ts                  # Shared type definitions
├── dist/                         # Built output (gitignored)
│   ├── webview.js                # Bundled JavaScript
│   └── webview.css               # Bundled CSS
├── esbuild.config.mjs            # Build configuration
└── content.ts                    # Updated to load bundled assets
```

### FR-002: Build Configuration

**File:** `src/ui/webview/esbuild.config.mjs`

```javascript
import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--production');

const config = {
    entryPoints: ['src/ui/webview/src/index.ts'],
    bundle: true,
    outfile: 'src/ui/webview/dist/webview.js',
    format: 'iife',
    platform: 'browser',
    target: ['chrome108'], // VS Code's Electron version
    minify: isProd,
    sourcemap: !isProd,
    loader: {
        '.css': 'text',
    },
};

if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log('Watching for changes...');
} else {
    await esbuild.build(config);
    console.log('Build complete');
}
```

### FR-003: Updated Content Loader

**File:** `src/ui/webview/content.ts` (simplified)

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function getWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): string {
    const nonce = getNonce();

    // Load bundled assets
    const distPath = path.join(extensionUri.fsPath, 'src', 'ui', 'webview', 'dist');
    const scriptContent = fs.readFileSync(path.join(distPath, 'webview.js'), 'utf-8');
    const styleContent = fs.readFileSync(path.join(distPath, 'webview.css'), 'utf-8');

    // Get resource URIs
    const iconUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'resources', 'icon.png')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}';
        img-src ${webview.cspSource} data: https:;
    ">
    <title>Draagon AI Chat</title>
    <style>${styleContent}</style>
</head>
<body>
    <div id="app"></div>
    <script nonce="${nonce}">
        window.iconUri = "${iconUri}";
        ${scriptContent}
    </script>
</body>
</html>`;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
```

### FR-004: Component Architecture

Each component should follow this pattern:

```typescript
// src/ui/webview/src/components/MessageList.ts

import { vscode } from '../services/vscodeApi';
import type { Message } from '../types';

export class MessageList {
    private container: HTMLElement;
    private messages: Message[] = [];

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Container ${containerId} not found`);
        this.container = el;
    }

    public addMessage(message: Message): void {
        this.messages.push(message);
        this.render();
    }

    public clear(): void {
        this.messages = [];
        this.render();
    }

    private render(): void {
        this.container.innerHTML = this.messages
            .map(msg => this.renderMessage(msg))
            .join('');
        this.scrollToBottom();
    }

    private renderMessage(msg: Message): string {
        return `
            <div class="message message-${msg.type}">
                <div class="message-content">${this.escapeHtml(msg.content)}</div>
                <div class="message-time">${msg.timestamp}</div>
            </div>
        `;
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private scrollToBottom(): void {
        this.container.scrollTop = this.container.scrollHeight;
    }
}
```

### FR-005: VS Code API Wrapper

```typescript
// src/ui/webview/src/services/vscodeApi.ts

interface VsCodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

// Acquire VS Code API (only available in webview context)
declare function acquireVsCodeApi(): VsCodeApi;

class VsCodeService {
    private api: VsCodeApi;

    constructor() {
        this.api = acquireVsCodeApi();
    }

    public send(type: string, data?: unknown): void {
        this.api.postMessage({ type, ...data });
    }

    public getState<T>(): T | undefined {
        return this.api.getState() as T | undefined;
    }

    public setState<T>(state: T): void {
        this.api.setState(state);
    }
}

export const vscode = new VsCodeService();
```

### FR-006: Build Integration

Update `package.json` scripts:

```json
{
    "scripts": {
        "compile": "npm run compile:extension && npm run compile:webview",
        "compile:extension": "tsc -p ./",
        "compile:webview": "node src/ui/webview/esbuild.config.mjs",
        "watch": "npm run watch:extension & npm run watch:webview",
        "watch:extension": "tsc -watch -p ./",
        "watch:webview": "node src/ui/webview/esbuild.config.mjs --watch",
        "build": "npm run compile:extension && node src/ui/webview/esbuild.config.mjs --production",
        "vscode:prepublish": "npm run build"
    }
}
```

### FR-007: Type Definitions

```typescript
// src/ui/webview/src/types.ts

export interface Message {
    type: 'user' | 'assistant' | 'system' | 'error';
    content: string;
    timestamp: string;
    thinking?: string;
}

export interface ToolUse {
    toolName: string;
    toolInput: Record<string, unknown>;
    toolUseId: string;
}

export interface PermissionRequest {
    requestId: string;
    toolName: string;
    toolUseId: string;
    input: Record<string, unknown>;
    suggestions?: string[];
}

export interface DiffResult {
    filePath: string;
    diffHtml: string;
    additions: number;
    deletions: number;
    truncated: boolean;
}

export interface TokenStats {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    estimatedCost: number;
}

export interface Question {
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
}
```

---

## Implementation Plan

### Phase 1: Setup (2 hours)

1. Install esbuild as dev dependency
2. Create directory structure
3. Create esbuild configuration
4. Update package.json scripts
5. Add dist/ to .gitignore

### Phase 2: Extract Components (4 hours)

1. Create type definitions
2. Extract VS Code API wrapper
3. Extract MessageList component
4. Extract InputArea component
5. Extract remaining components (one by one)

### Phase 3: Extract Styles (1 hour)

1. Create CSS variables file
2. Extract component styles
3. Extract theme styles
4. Verify dark/light mode works

### Phase 4: Integration (1 hour)

1. Update content.ts to load bundled assets
2. Verify CSP compliance
3. Test all functionality
4. Verify in both sidebar and panel modes

### Phase 5: Cleanup (30 minutes)

1. Remove old inline code
2. Update documentation
3. Run full test suite

---

## Acceptance Criteria

- [ ] All webview functionality works identically to current implementation
- [ ] TypeScript compilation succeeds for webview code
- [ ] ESLint passes on webview code
- [ ] Bundle size is smaller than current inline approach
- [ ] Source maps work in VS Code Developer Tools
- [ ] Watch mode enables rapid development iteration
- [ ] All 115 existing tests still pass
- [ ] CSP headers remain secure (no 'unsafe-eval')

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CSP violations | Medium | High | Test thoroughly, keep 'unsafe-inline' for styles only |
| Breaking existing functionality | Medium | High | Comprehensive manual testing checklist |
| Build complexity | Low | Medium | Clear documentation, simple esbuild config |
| Bundle size increase | Low | Low | Tree shaking, minification in production |

---

## Dependencies

- esbuild (dev dependency)
- No runtime dependencies added

---

## References

- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [esbuild Documentation](https://esbuild.github.io/)
- [VS Code CSP Guide](https://code.visualstudio.com/api/extension-guides/webview#content-security-policy)
