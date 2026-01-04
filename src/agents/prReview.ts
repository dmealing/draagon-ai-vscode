import * as vscode from 'vscode';

export interface ReviewComment {
    file: string;
    line: number;
    endLine?: number;
    severity: 'error' | 'warning' | 'info' | 'suggestion';
    category: ReviewCategory;
    message: string;
    suggestion?: string;
    confidence: number; // 0-100
}

export type ReviewCategory =
    | 'security'
    | 'performance'
    | 'error-handling'
    | 'type-safety'
    | 'code-quality'
    | 'testing'
    | 'documentation'
    | 'accessibility'
    | 'maintainability'
    | 'best-practices';

export interface ReviewResult {
    summary: string;
    overallScore: number; // 0-100
    comments: ReviewComment[];
    stats: {
        filesReviewed: number;
        totalIssues: number;
        criticalIssues: number;
        suggestions: number;
    };
    categoryScores: Record<ReviewCategory, number>;
    timestamp: string;
}

export interface ReviewAgent {
    id: string;
    name: string;
    description: string;
    categories: ReviewCategory[];
    systemPrompt: string;
    enabled: boolean;
}

// Specialized review agents
const REVIEW_AGENTS: ReviewAgent[] = [
    {
        id: 'security-reviewer',
        name: 'Security Reviewer',
        description: 'Identifies security vulnerabilities and unsafe patterns',
        categories: ['security'],
        systemPrompt: `You are a security-focused code reviewer. Analyze the code for:
- SQL injection vulnerabilities
- XSS vulnerabilities
- Command injection
- Path traversal
- Insecure cryptography
- Hardcoded secrets
- Authentication/authorization issues
- OWASP Top 10 vulnerabilities
Rate each issue by severity and provide specific remediation suggestions.`,
        enabled: true
    },
    {
        id: 'error-handler',
        name: 'Error Handling Reviewer',
        description: 'Checks error handling patterns and edge cases',
        categories: ['error-handling'],
        systemPrompt: `You are an error handling expert. Analyze the code for:
- Uncaught exceptions
- Missing null/undefined checks
- Improper async error handling
- Missing try-catch blocks
- Silent failures
- Error message quality
- Recovery mechanisms
Suggest proper error handling patterns.`,
        enabled: true
    },
    {
        id: 'type-checker',
        name: 'Type Safety Reviewer',
        description: 'Reviews type safety and TypeScript best practices',
        categories: ['type-safety'],
        systemPrompt: `You are a TypeScript type safety expert. Analyze the code for:
- Use of 'any' type
- Missing type annotations
- Type assertions that could fail
- Incorrect generic usage
- Missing null checks
- Type narrowing opportunities
- Interface vs type decisions
Suggest type improvements that enhance safety.`,
        enabled: true
    },
    {
        id: 'performance-reviewer',
        name: 'Performance Reviewer',
        description: 'Identifies performance issues and optimization opportunities',
        categories: ['performance'],
        systemPrompt: `You are a performance optimization expert. Analyze the code for:
- N+1 query problems
- Memory leaks
- Unnecessary re-renders
- Inefficient algorithms
- Missing memoization
- Large bundle impacts
- Database query optimization
Suggest specific optimizations with expected impact.`,
        enabled: true
    },
    {
        id: 'test-reviewer',
        name: 'Test Coverage Reviewer',
        description: 'Evaluates test coverage and test quality',
        categories: ['testing'],
        systemPrompt: `You are a testing expert. Analyze the code for:
- Missing test cases
- Edge cases not covered
- Test quality and assertions
- Mocking best practices
- Integration test needs
- Test maintainability
Suggest specific test cases that should be added.`,
        enabled: true
    },
    {
        id: 'code-quality',
        name: 'Code Quality Reviewer',
        description: 'Reviews code quality, readability, and maintainability',
        categories: ['code-quality', 'maintainability'],
        systemPrompt: `You are a code quality expert. Analyze the code for:
- Code duplication
- Function/class complexity
- Naming conventions
- Code organization
- SOLID principles
- Design patterns
- Code readability
Suggest refactoring opportunities.`,
        enabled: true
    },
    {
        id: 'simplifier',
        name: 'Code Simplifier',
        description: 'Suggests ways to simplify complex code',
        categories: ['maintainability', 'code-quality'],
        systemPrompt: `You are a code simplification expert. Focus on:
- Reducing complexity
- Eliminating dead code
- Simplifying conditionals
- Reducing nesting levels
- Extracting reusable functions
- Using built-in methods
Suggest simpler alternatives to complex code.`,
        enabled: true
    },
    {
        id: 'docs-reviewer',
        name: 'Documentation Reviewer',
        description: 'Reviews documentation and comments',
        categories: ['documentation'],
        systemPrompt: `You are a documentation expert. Analyze the code for:
- Missing JSDoc comments
- Outdated comments
- Self-documenting code opportunities
- README updates needed
- API documentation
- Code examples
Suggest documentation improvements.`,
        enabled: false
    }
];

export class PrReviewToolkit {
    private _agents: Map<string, ReviewAgent> = new Map();
    private _onReviewComplete: vscode.EventEmitter<ReviewResult> = new vscode.EventEmitter();

    public readonly onReviewComplete = this._onReviewComplete.event;

    constructor() {
        for (const agent of REVIEW_AGENTS) {
            this._agents.set(agent.id, { ...agent });
        }
    }

    public getAgents(): ReviewAgent[] {
        return Array.from(this._agents.values());
    }

    public getEnabledAgents(): ReviewAgent[] {
        return this.getAgents().filter(a => a.enabled);
    }

    public enableAgent(id: string): boolean {
        const agent = this._agents.get(id);
        if (!agent) return false;
        agent.enabled = true;
        return true;
    }

    public disableAgent(id: string): boolean {
        const agent = this._agents.get(id);
        if (!agent) return false;
        agent.enabled = false;
        return true;
    }

    public getAgentsByCategory(category: ReviewCategory): ReviewAgent[] {
        return this.getEnabledAgents().filter(a => a.categories.includes(category));
    }

    public buildReviewPrompt(diff: string, agents?: string[]): string {
        const enabledAgents = agents
            ? this.getAgents().filter(a => agents.includes(a.id))
            : this.getEnabledAgents();

        const agentInstructions = enabledAgents
            .map(a => `## ${a.name}\n${a.systemPrompt}`)
            .join('\n\n');

        return `You are a comprehensive code reviewer using multiple specialized review perspectives.

${agentInstructions}

## Review Instructions

Analyze the following diff and provide a structured review. For each issue found:
1. Specify the file and line number
2. Categorize the issue (security, performance, error-handling, type-safety, code-quality, testing, documentation, accessibility, maintainability, best-practices)
3. Rate severity (error, warning, info, suggestion)
4. Provide a confidence score (0-100)
5. Explain the issue clearly
6. Suggest a fix if applicable

Filter out issues with confidence below 70% to reduce false positives.

## Diff to Review

\`\`\`diff
${diff}
\`\`\`

Provide your review in the following JSON format:
{
  "summary": "Brief overall assessment",
  "overallScore": 85,
  "comments": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "warning",
      "category": "security",
      "message": "Issue description",
      "suggestion": "How to fix",
      "confidence": 95
    }
  ],
  "categoryScores": {
    "security": 90,
    "performance": 85,
    ...
  }
}`;
    }

    public parseReviewResponse(response: string): ReviewResult | null {
        try {
            // Extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return null;
            }

            const data = JSON.parse(jsonMatch[0]);

            // Filter by confidence
            const filteredComments = (data.comments || [])
                .filter((c: ReviewComment) => c.confidence >= 70);

            const result: ReviewResult = {
                summary: data.summary || 'Review complete',
                overallScore: data.overallScore || 0,
                comments: filteredComments,
                stats: {
                    filesReviewed: new Set(filteredComments.map((c: ReviewComment) => c.file)).size,
                    totalIssues: filteredComments.length,
                    criticalIssues: filteredComments.filter((c: ReviewComment) => c.severity === 'error').length,
                    suggestions: filteredComments.filter((c: ReviewComment) => c.severity === 'suggestion').length
                },
                categoryScores: data.categoryScores || {},
                timestamp: new Date().toISOString()
            };

            this._onReviewComplete.fire(result);
            return result;

        } catch (error) {
            console.error('Failed to parse review response:', error);
            return null;
        }
    }

    public formatReviewAsMarkdown(result: ReviewResult): string {
        const severityEmoji: Record<string, string> = {
            error: '🔴',
            warning: '🟡',
            info: 'ℹ️',
            suggestion: '💡'
        };

        const categoryEmoji: Record<string, string> = {
            security: '🔒',
            performance: '⚡',
            'error-handling': '🚨',
            'type-safety': '📝',
            'code-quality': '✨',
            testing: '🧪',
            documentation: '📚',
            accessibility: '♿',
            maintainability: '🔧',
            'best-practices': '📋'
        };

        let md = `# Code Review Results\n\n`;
        md += `**Overall Score:** ${result.overallScore}/100\n\n`;
        md += `## Summary\n${result.summary}\n\n`;

        md += `## Statistics\n`;
        md += `- Files reviewed: ${result.stats.filesReviewed}\n`;
        md += `- Total issues: ${result.stats.totalIssues}\n`;
        md += `- Critical issues: ${result.stats.criticalIssues}\n`;
        md += `- Suggestions: ${result.stats.suggestions}\n\n`;

        if (Object.keys(result.categoryScores).length > 0) {
            md += `## Category Scores\n`;
            for (const [category, score] of Object.entries(result.categoryScores)) {
                const emoji = categoryEmoji[category] || '•';
                md += `- ${emoji} ${category}: ${score}/100\n`;
            }
            md += '\n';
        }

        if (result.comments.length > 0) {
            md += `## Issues Found\n\n`;

            // Group by file
            const byFile = new Map<string, ReviewComment[]>();
            for (const comment of result.comments) {
                if (!byFile.has(comment.file)) {
                    byFile.set(comment.file, []);
                }
                byFile.get(comment.file)!.push(comment);
            }

            for (const [file, comments] of byFile) {
                md += `### ${file}\n\n`;
                for (const comment of comments) {
                    const emoji = severityEmoji[comment.severity] || '•';
                    const catEmoji = categoryEmoji[comment.category] || '';
                    md += `${emoji} **Line ${comment.line}** ${catEmoji} [${comment.category}]\n`;
                    md += `${comment.message}\n`;
                    if (comment.suggestion) {
                        md += `> 💡 **Suggestion:** ${comment.suggestion}\n`;
                    }
                    md += `*Confidence: ${comment.confidence}%*\n\n`;
                }
            }
        }

        return md;
    }

    public async applyToEditor(result: ReviewResult): Promise<void> {
        const diagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [];
        const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

        for (const comment of result.comments) {
            const uri = vscode.Uri.file(comment.file);
            const uriString = uri.toString();

            if (!diagnosticsByFile.has(uriString)) {
                diagnosticsByFile.set(uriString, []);
            }

            const severity = {
                error: vscode.DiagnosticSeverity.Error,
                warning: vscode.DiagnosticSeverity.Warning,
                info: vscode.DiagnosticSeverity.Information,
                suggestion: vscode.DiagnosticSeverity.Hint
            }[comment.severity] || vscode.DiagnosticSeverity.Warning;

            const range = new vscode.Range(
                comment.line - 1, 0,
                (comment.endLine || comment.line) - 1, 1000
            );

            const diagnostic = new vscode.Diagnostic(
                range,
                `[${comment.category}] ${comment.message}`,
                severity
            );
            diagnostic.source = 'Draagon AI Review';

            diagnosticsByFile.get(uriString)!.push(diagnostic);
        }

        for (const [uriString, diags] of diagnosticsByFile) {
            diagnostics.push([vscode.Uri.parse(uriString), diags]);
        }

        // Create diagnostic collection if needed
        const collection = vscode.languages.createDiagnosticCollection('draagon-review');
        collection.set(diagnostics);
    }

    public dispose(): void {
        this._onReviewComplete.dispose();
    }
}
