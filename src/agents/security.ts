import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ClaudeProcess } from '../claude/process';

export interface SecurityIssue {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: SecurityCategory;
    title: string;
    description: string;
    file: string;
    line?: number;
    code?: string;
    recommendation: string;
    cweId?: string;
}

export type SecurityCategory =
    | 'secrets'
    | 'injection'
    | 'xss'
    | 'auth'
    | 'crypto'
    | 'config'
    | 'dependencies'
    | 'other';

export interface SecurityScanResult {
    scanId: string;
    timestamp: string;
    duration: number;
    filesScanned: number;
    issues: SecurityIssue[];
    summary: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
    };
}

export interface SecurityScanOptions {
    files?: string[];
    includePatterns?: string[];
    excludePatterns?: string[];
    categories?: SecurityCategory[];
    maxFiles?: number;
}

const SECRET_PATTERNS = [
    { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g },
    { name: 'AWS Secret Key', pattern: /[A-Za-z0-9/+=]{40}/g },
    { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
    { name: 'Generic API Key', pattern: /['"](api[_-]?key|apikey)['"]\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/gi },
    { name: 'Generic Secret', pattern: /['"](secret|password|passwd|pwd)['"]\s*[:=]\s*['"][^'"]{8,}['"]/gi },
    { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
    { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/]*/g },
];

const INJECTION_PATTERNS = [
    { name: 'SQL Injection', pattern: /\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)/gi, category: 'injection' as SecurityCategory },
    { name: 'Command Injection', pattern: /exec\s*\(\s*[`'"].*\$\{/g, category: 'injection' as SecurityCategory },
    { name: 'eval Usage', pattern: /\beval\s*\(/g, category: 'injection' as SecurityCategory },
];

const XSS_PATTERNS = [
    { name: 'innerHTML Assignment', pattern: /\.innerHTML\s*=/g },
    { name: 'document.write', pattern: /document\.write\s*\(/g },
    { name: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/g },
];

export class SecurityScanner {
    private _onScanStart = new vscode.EventEmitter<string>();
    private _onScanProgress = new vscode.EventEmitter<{ scanned: number; total: number }>();
    private _onScanComplete = new vscode.EventEmitter<SecurityScanResult>();
    private _onIssueFound = new vscode.EventEmitter<SecurityIssue>();

    public readonly onScanStart = this._onScanStart.event;
    public readonly onScanProgress = this._onScanProgress.event;
    public readonly onScanComplete = this._onScanComplete.event;
    public readonly onIssueFound = this._onIssueFound.event;

    private _results: Map<string, SecurityScanResult> = new Map();
    private _isScanning = false;

    constructor(private config: vscode.WorkspaceConfiguration) {}

    public isScanning(): boolean {
        return this._isScanning;
    }

    public getLastResult(): SecurityScanResult | null {
        const results = Array.from(this._results.values());
        return results[results.length - 1] || null;
    }

    public async scanWorkspace(options: SecurityScanOptions = {}): Promise<SecurityScanResult> {
        const scanId = `scan_${Date.now()}`;
        const startTime = Date.now();
        this._isScanning = true;
        this._onScanStart.fire(scanId);

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            throw new Error('No workspace folder open');
        }

        const issues: SecurityIssue[] = [];
        const includePatterns = options.includePatterns || ['**/*.{js,ts,jsx,tsx,py,java,go,rb,php}'];
        const excludePatterns = options.excludePatterns || ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'];

        // Find files to scan
        let files: vscode.Uri[] = [];
        for (const pattern of includePatterns) {
            const found = await vscode.workspace.findFiles(pattern, `{${excludePatterns.join(',')}}`);
            files.push(...found);
        }

        // Apply limit
        const maxFiles = options.maxFiles || 500;
        if (files.length > maxFiles) {
            files = files.slice(0, maxFiles);
        }

        // Scan each file
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            this._onScanProgress.fire({ scanned: i + 1, total: files.length });

            try {
                const content = await fs.promises.readFile(file.fsPath, 'utf-8');
                const relativePath = path.relative(workspaceRoot, file.fsPath);
                const fileIssues = this.scanFileContent(content, relativePath, options.categories);

                for (const issue of fileIssues) {
                    issues.push(issue);
                    this._onIssueFound.fire(issue);
                }
            } catch (error) {
                // Skip files that can't be read
                console.error(`Failed to scan ${file.fsPath}:`, error);
            }
        }

        const result: SecurityScanResult = {
            scanId,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
            filesScanned: files.length,
            issues,
            summary: {
                critical: issues.filter(i => i.severity === 'critical').length,
                high: issues.filter(i => i.severity === 'high').length,
                medium: issues.filter(i => i.severity === 'medium').length,
                low: issues.filter(i => i.severity === 'low').length,
                info: issues.filter(i => i.severity === 'info').length,
            }
        };

        this._results.set(scanId, result);
        this._isScanning = false;
        this._onScanComplete.fire(result);

        return result;
    }

    private scanFileContent(content: string, filePath: string, categories?: SecurityCategory[]): SecurityIssue[] {
        const issues: SecurityIssue[] = [];
        const lines = content.split('\n');

        // Skip if file is likely minified
        if (lines.some(line => line.length > 1000)) {
            return issues;
        }

        // Check for secrets
        if (!categories || categories.includes('secrets')) {
            for (const { name, pattern } of SECRET_PATTERNS) {
                const matches = content.matchAll(pattern);
                for (const match of matches) {
                    const line = this.getLineNumber(content, match.index || 0);
                    issues.push({
                        id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                        severity: 'critical',
                        category: 'secrets',
                        title: `Potential ${name} Exposed`,
                        description: `Found what appears to be a ${name} in the source code.`,
                        file: filePath,
                        line,
                        code: this.getCodeSnippet(lines, line),
                        recommendation: 'Move secrets to environment variables or a secure secrets manager.',
                        cweId: 'CWE-798'
                    });
                }
            }
        }

        // Check for injection vulnerabilities
        if (!categories || categories.includes('injection')) {
            for (const { name, pattern, category } of INJECTION_PATTERNS) {
                const matches = content.matchAll(pattern);
                for (const match of matches) {
                    const line = this.getLineNumber(content, match.index || 0);
                    issues.push({
                        id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                        severity: name === 'eval Usage' ? 'high' : 'critical',
                        category,
                        title: `Potential ${name} Vulnerability`,
                        description: `Found pattern that may indicate ${name} vulnerability.`,
                        file: filePath,
                        line,
                        code: this.getCodeSnippet(lines, line),
                        recommendation: 'Use parameterized queries or safe APIs instead.',
                        cweId: name === 'SQL Injection' ? 'CWE-89' : 'CWE-78'
                    });
                }
            }
        }

        // Check for XSS vulnerabilities
        if (!categories || categories.includes('xss')) {
            for (const { name, pattern } of XSS_PATTERNS) {
                const matches = content.matchAll(pattern);
                for (const match of matches) {
                    const line = this.getLineNumber(content, match.index || 0);
                    issues.push({
                        id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                        severity: 'medium',
                        category: 'xss',
                        title: `Potential XSS: ${name}`,
                        description: `Using ${name} can lead to XSS vulnerabilities if not properly sanitized.`,
                        file: filePath,
                        line,
                        code: this.getCodeSnippet(lines, line),
                        recommendation: 'Sanitize user input and use safe rendering methods.',
                        cweId: 'CWE-79'
                    });
                }
            }
        }

        return issues;
    }

    private getLineNumber(content: string, index: number): number {
        const beforeContent = content.substring(0, index);
        return (beforeContent.match(/\n/g) || []).length + 1;
    }

    private getCodeSnippet(lines: string[], lineNumber: number): string {
        const start = Math.max(0, lineNumber - 2);
        const end = Math.min(lines.length, lineNumber + 1);
        return lines.slice(start, end).join('\n');
    }

    /**
     * Use Claude for deep security analysis
     */
    public async deepScan(file: string, content: string): Promise<SecurityIssue[]> {
        const prompt = `Analyze this code for security vulnerabilities. Look for:
1. Hardcoded secrets or credentials
2. SQL injection vulnerabilities
3. XSS vulnerabilities
4. Command injection
5. Insecure cryptography
6. Authentication/authorization issues
7. Path traversal vulnerabilities
8. Insecure deserialization

File: ${file}

\`\`\`
${content.substring(0, 10000)}
\`\`\`

Respond with a JSON array of issues found, each with:
- severity: "critical" | "high" | "medium" | "low"
- category: string
- title: string
- description: string
- line: number (if applicable)
- recommendation: string

If no issues found, respond with an empty array [].`;

        try {
            const claudeProcess = new ClaudeProcess({
                config: this.config
            });

            let response = '';

            return new Promise((resolve) => {
                claudeProcess.onMessage((msg) => {
                    if (msg.type === 'assistant' && msg.message?.content) {
                        for (const block of msg.message.content) {
                            if (block.type === 'text') {
                                response += block.text;
                            }
                        }
                    }
                });

                claudeProcess.onComplete(() => {
                    try {
                        // Extract JSON from response
                        const jsonMatch = response.match(/\[[\s\S]*\]/);
                        if (jsonMatch) {
                            const parsed = JSON.parse(jsonMatch[0]);
                            const issues: SecurityIssue[] = parsed.map((item: any) => ({
                                id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                                severity: item.severity || 'medium',
                                category: item.category || 'other',
                                title: item.title || 'Security Issue',
                                description: item.description || '',
                                file,
                                line: item.line,
                                recommendation: item.recommendation || ''
                            }));
                            resolve(issues);
                        } else {
                            resolve([]);
                        }
                    } catch {
                        resolve([]);
                    }
                });

                claudeProcess.onError(() => {
                    resolve([]);
                });

                claudeProcess.send(prompt);
            });
        } catch {
            return [];
        }
    }

    public formatReport(result: SecurityScanResult): string {
        const lines: string[] = [];

        lines.push('# Security Scan Report');
        lines.push('');
        lines.push(`**Scan ID:** ${result.scanId}`);
        lines.push(`**Timestamp:** ${new Date(result.timestamp).toLocaleString()}`);
        lines.push(`**Duration:** ${result.duration}ms`);
        lines.push(`**Files Scanned:** ${result.filesScanned}`);
        lines.push('');

        lines.push('## Summary');
        lines.push('');
        lines.push(`| Severity | Count |`);
        lines.push(`|----------|-------|`);
        lines.push(`| Critical | ${result.summary.critical} |`);
        lines.push(`| High | ${result.summary.high} |`);
        lines.push(`| Medium | ${result.summary.medium} |`);
        lines.push(`| Low | ${result.summary.low} |`);
        lines.push(`| Info | ${result.summary.info} |`);
        lines.push('');

        if (result.issues.length === 0) {
            lines.push('No security issues found.');
        } else {
            lines.push('## Issues');
            lines.push('');

            for (const issue of result.issues) {
                const severityEmoji = {
                    critical: '🔴',
                    high: '🟠',
                    medium: '🟡',
                    low: '🔵',
                    info: 'ℹ️'
                }[issue.severity];

                lines.push(`### ${severityEmoji} ${issue.title}`);
                lines.push('');
                lines.push(`**File:** ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
                lines.push(`**Category:** ${issue.category}`);
                if (issue.cweId) {
                    lines.push(`**CWE:** ${issue.cweId}`);
                }
                lines.push('');
                lines.push(issue.description);
                lines.push('');
                if (issue.code) {
                    lines.push('```');
                    lines.push(issue.code);
                    lines.push('```');
                    lines.push('');
                }
                lines.push(`**Recommendation:** ${issue.recommendation}`);
                lines.push('');
            }
        }

        return lines.join('\n');
    }

    public dispose(): void {
        this._onScanStart.dispose();
        this._onScanProgress.dispose();
        this._onScanComplete.dispose();
        this._onIssueFound.dispose();
    }
}
