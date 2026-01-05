import * as vscode from 'vscode';

// Storage for diff content (used by DiffContentProvider)
const diffContentStore = new Map<string, string>();

/**
 * Custom TextDocumentContentProvider for read-only diff views
 */
export class DiffContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange = this._onDidChange.event;

    provideTextDocumentContent(uri: vscode.Uri): string {
        const content = diffContentStore.get(uri.path);
        return content || '';
    }

    /**
     * Store content for a diff view
     */
    public static setContent(path: string, content: string): void {
        diffContentStore.set(path, content);
    }

    /**
     * Clear stored content
     */
    public static clearContent(path: string): void {
        diffContentStore.delete(path);
    }

    /**
     * Clear all stored content
     */
    public static clearAll(): void {
        diffContentStore.clear();
    }
}

/**
 * Generates a unified diff between two strings
 */
export function generateUnifiedDiff(
    originalContent: string,
    modifiedContent: string,
    filePath: string,
    startLine: number = 1
): string {
    const originalLines = originalContent.split('\n');
    const modifiedLines = modifiedContent.split('\n');

    // Simple line-by-line diff (for more sophisticated diffs, use a library)
    const diff: string[] = [];
    diff.push(`--- a/${filePath}`);
    diff.push(`+++ b/${filePath}`);

    // Find the changes using LCS-based approach
    const changes = computeDiff(originalLines, modifiedLines);

    if (changes.length === 0) {
        return ''; // No changes
    }

    // Group changes into hunks
    const hunks = groupIntoHunks(changes, originalLines.length, modifiedLines.length);

    for (const hunk of hunks) {
        diff.push(`@@ -${hunk.originalStart + startLine - 1},${hunk.originalCount} +${hunk.modifiedStart + startLine - 1},${hunk.modifiedCount} @@`);
        diff.push(...hunk.lines);
    }

    return diff.join('\n');
}

interface DiffChange {
    type: 'context' | 'add' | 'remove';
    originalLine: number;
    modifiedLine: number;
    content: string;
}

interface DiffHunk {
    originalStart: number;
    originalCount: number;
    modifiedStart: number;
    modifiedCount: number;
    lines: string[];
}

function computeDiff(original: string[], modified: string[]): DiffChange[] {
    const changes: DiffChange[] = [];

    // Simple Myers diff algorithm approximation
    const lcs = longestCommonSubsequence(original, modified);

    let origIdx = 0;
    let modIdx = 0;
    let lcsIdx = 0;

    while (origIdx < original.length || modIdx < modified.length) {
        if (lcsIdx < lcs.length && origIdx < original.length && original[origIdx] === lcs[lcsIdx]) {
            if (modIdx < modified.length && modified[modIdx] === lcs[lcsIdx]) {
                // Context line (same in both)
                changes.push({
                    type: 'context',
                    originalLine: origIdx,
                    modifiedLine: modIdx,
                    content: original[origIdx]
                });
                origIdx++;
                modIdx++;
                lcsIdx++;
            } else {
                // Line added in modified
                changes.push({
                    type: 'add',
                    originalLine: origIdx,
                    modifiedLine: modIdx,
                    content: modified[modIdx]
                });
                modIdx++;
            }
        } else if (lcsIdx < lcs.length && modIdx < modified.length && modified[modIdx] === lcs[lcsIdx]) {
            // Line removed from original
            changes.push({
                type: 'remove',
                originalLine: origIdx,
                modifiedLine: modIdx,
                content: original[origIdx]
            });
            origIdx++;
        } else if (origIdx < original.length) {
            // Line removed
            changes.push({
                type: 'remove',
                originalLine: origIdx,
                modifiedLine: modIdx,
                content: original[origIdx]
            });
            origIdx++;
        } else if (modIdx < modified.length) {
            // Line added
            changes.push({
                type: 'add',
                originalLine: origIdx,
                modifiedLine: modIdx,
                content: modified[modIdx]
            });
            modIdx++;
        }
    }

    return changes;
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to find LCS
    const lcs: string[] = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            lcs.unshift(a[i - 1]);
            i--;
            j--;
        } else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }

    return lcs;
}

function groupIntoHunks(changes: DiffChange[], originalLength: number, modifiedLength: number): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const contextLines = 3;

    let currentHunk: DiffHunk | null = null;
    let lastChangeIdx = -1;

    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];

        if (change.type !== 'context') {
            if (currentHunk === null || i - lastChangeIdx > contextLines * 2) {
                // Start new hunk
                if (currentHunk !== null) {
                    hunks.push(currentHunk);
                }

                // Include context before
                const contextStart = Math.max(0, i - contextLines);
                currentHunk = {
                    originalStart: changes[contextStart].originalLine + 1,
                    originalCount: 0,
                    modifiedStart: changes[contextStart].modifiedLine + 1,
                    modifiedCount: 0,
                    lines: []
                };

                // Add context lines before
                for (let j = contextStart; j < i; j++) {
                    if (changes[j].type === 'context') {
                        currentHunk.lines.push(` ${changes[j].content}`);
                        currentHunk.originalCount++;
                        currentHunk.modifiedCount++;
                    }
                }
            }

            lastChangeIdx = i;
        }

        if (currentHunk !== null) {
            switch (change.type) {
                case 'context':
                    currentHunk.lines.push(` ${change.content}`);
                    currentHunk.originalCount++;
                    currentHunk.modifiedCount++;
                    break;
                case 'add':
                    currentHunk.lines.push(`+${change.content}`);
                    currentHunk.modifiedCount++;
                    break;
                case 'remove':
                    currentHunk.lines.push(`-${change.content}`);
                    currentHunk.originalCount++;
                    break;
            }
        }
    }

    if (currentHunk !== null) {
        hunks.push(currentHunk);
    }

    return hunks;
}

/**
 * Opens a diff view in VS Code
 */
export async function openDiffEditor(
    originalContent: string,
    modifiedContent: string,
    filePath: string,
    title?: string
): Promise<void> {
    const fileName = filePath.split('/').pop() || 'file';
    const timestamp = Date.now();

    // Store content
    DiffContentProvider.setContent(`/original-${timestamp}`, originalContent);
    DiffContentProvider.setContent(`/modified-${timestamp}`, modifiedContent);

    const originalUri = vscode.Uri.parse(`draagon-diff:/original-${timestamp}`);
    const modifiedUri = vscode.Uri.parse(`draagon-diff:/modified-${timestamp}`);

    await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        modifiedUri,
        title || `${fileName} (Before ↔ After)`
    );
}

/**
 * Format diff for display in chat
 */
export function formatDiffForChat(
    originalContent: string,
    modifiedContent: string,
    filePath: string,
    maxLines: number = 50
): { html: string; truncated: boolean; fullDiff: string } {
    const diff = generateUnifiedDiff(originalContent, modifiedContent, filePath);
    const lines = diff.split('\n');
    const truncated = lines.length > maxLines;
    const displayLines = truncated ? lines.slice(0, maxLines) : lines;

    const htmlLines = displayLines.map(line => {
        const escaped = escapeHtml(line);
        if (line.startsWith('+') && !line.startsWith('+++')) {
            return `<span class="diff-add">${escaped}</span>`;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            return `<span class="diff-remove">${escaped}</span>`;
        } else if (line.startsWith('@@')) {
            return `<span class="diff-hunk">${escaped}</span>`;
        } else if (line.startsWith('---') || line.startsWith('+++')) {
            return `<span class="diff-header">${escaped}</span>`;
        }
        return `<span class="diff-context">${escaped}</span>`;
    });

    const html = `<div class="diff-container">
<div class="diff-file-header">${escapeHtml(filePath)}</div>
<pre class="diff-content">${htmlLines.join('\n')}</pre>
${truncated ? '<div class="diff-truncated">... diff truncated. Click "Open Diff" to see full changes.</div>' : ''}
</div>`;

    return { html, truncated, fullDiff: diff };
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Calculate diff statistics
 */
export function getDiffStats(originalContent: string, modifiedContent: string): {
    additions: number;
    deletions: number;
    changes: number;
} {
    const originalLines = originalContent.split('\n');
    const modifiedLines = modifiedContent.split('\n');
    const changes = computeDiff(originalLines, modifiedLines);

    let additions = 0;
    let deletions = 0;

    for (const change of changes) {
        if (change.type === 'add') additions++;
        if (change.type === 'remove') deletions++;
    }

    return {
        additions,
        deletions,
        changes: additions + deletions
    };
}
