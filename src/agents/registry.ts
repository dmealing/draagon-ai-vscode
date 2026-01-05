import * as vscode from 'vscode';
import { SecurityScanner, SecurityScanResult, SecurityScanOptions } from './security';
import { TestGenerator, TestGenerationResult, TestGenerationOptions } from './testGenerator';
import { PrReviewToolkit, ReviewResult } from './prReview';
import { ClaudeProcess } from '../claude/process';

export type AgentType = 'security' | 'test-generator' | 'pr-review' | 'documentation' | 'custom';

export interface AgentDefinition {
    id: string;
    type: AgentType;
    name: string;
    description: string;
    icon: string;
    triggers: AgentTrigger[];
    enabled: boolean;
}

export interface AgentTrigger {
    type: 'manual' | 'on-save' | 'on-commit' | 'scheduled' | 'on-pr';
    pattern?: string; // File glob pattern for on-save
    schedule?: string; // Cron expression for scheduled
}

export interface AgentExecutionContext {
    workspaceRoot: string;
    files?: string[];
    diff?: string;
    userPrompt?: string;
    config: vscode.WorkspaceConfiguration;
}

export interface AgentExecutionResult {
    agentId: string;
    success: boolean;
    duration: number;
    data: SecurityScanResult | TestGenerationResult | ReviewResult | unknown;
    summary: string;
    timestamp: string;
}

const DEFAULT_AGENTS: AgentDefinition[] = [
    {
        id: 'security-scanner',
        type: 'security',
        name: 'Security Scanner',
        description: 'Scan code for security vulnerabilities, exposed secrets, and OWASP issues',
        icon: '$(shield)',
        triggers: [
            { type: 'manual' },
            { type: 'on-commit' }
        ],
        enabled: true
    },
    {
        id: 'test-generator',
        type: 'test-generator',
        name: 'Test Generator',
        description: 'Generate unit tests for source files',
        icon: '$(beaker)',
        triggers: [
            { type: 'manual' }
        ],
        enabled: true
    },
    {
        id: 'pr-reviewer',
        type: 'pr-review',
        name: 'PR Reviewer',
        description: 'Review code changes for quality, security, and best practices',
        icon: '$(git-pull-request)',
        triggers: [
            { type: 'manual' },
            { type: 'on-pr' }
        ],
        enabled: true
    }
];

export class AgentRegistry {
    private _agents: Map<string, AgentDefinition> = new Map();
    private _securityScanner: SecurityScanner | null = null;
    private _testGenerator: TestGenerator | null = null;
    private _prReviewToolkit: PrReviewToolkit | null = null;
    private _executionHistory: AgentExecutionResult[] = [];

    private _onAgentExecutionStart = new vscode.EventEmitter<AgentDefinition>();
    private _onAgentExecutionComplete = new vscode.EventEmitter<AgentExecutionResult>();

    public readonly onAgentExecutionStart = this._onAgentExecutionStart.event;
    public readonly onAgentExecutionComplete = this._onAgentExecutionComplete.event;

    constructor(private config: vscode.WorkspaceConfiguration) {
        // Register default agents
        for (const agent of DEFAULT_AGENTS) {
            this._agents.set(agent.id, { ...agent });
        }
    }

    public getAgents(): AgentDefinition[] {
        return Array.from(this._agents.values());
    }

    public getEnabledAgents(): AgentDefinition[] {
        return this.getAgents().filter(a => a.enabled);
    }

    public getAgent(id: string): AgentDefinition | null {
        return this._agents.get(id) || null;
    }

    public registerAgent(agent: AgentDefinition): void {
        this._agents.set(agent.id, agent);
    }

    public unregisterAgent(id: string): boolean {
        return this._agents.delete(id);
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

    public getAgentsByTrigger(triggerType: AgentTrigger['type']): AgentDefinition[] {
        return this.getEnabledAgents().filter(a =>
            a.triggers.some(t => t.type === triggerType)
        );
    }

    /**
     * Execute an agent by ID
     */
    public async executeAgent(
        agentId: string,
        context: AgentExecutionContext
    ): Promise<AgentExecutionResult> {
        const agent = this._agents.get(agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }

        if (!agent.enabled) {
            throw new Error(`Agent is disabled: ${agentId}`);
        }

        this._onAgentExecutionStart.fire(agent);
        const startTime = Date.now();

        let result: AgentExecutionResult;

        try {
            switch (agent.type) {
                case 'security':
                    result = await this.executeSecurity(agent, context);
                    break;
                case 'test-generator':
                    result = await this.executeTestGenerator(agent, context);
                    break;
                case 'pr-review':
                    result = await this.executePrReview(agent, context);
                    break;
                default:
                    throw new Error(`Unknown agent type: ${agent.type}`);
            }
        } catch (error) {
            result = {
                agentId,
                success: false,
                duration: Date.now() - startTime,
                data: null,
                summary: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date().toISOString()
            };
        }

        this._executionHistory.push(result);
        this._onAgentExecutionComplete.fire(result);
        return result;
    }

    /**
     * Execute security scanner
     */
    private async executeSecurity(
        agent: AgentDefinition,
        context: AgentExecutionContext
    ): Promise<AgentExecutionResult> {
        if (!this._securityScanner) {
            this._securityScanner = new SecurityScanner(context.config);
        }

        const startTime = Date.now();
        const options: SecurityScanOptions = {
            files: context.files,
            maxFiles: context.config.get<number>('agents.security.maxFiles', 500)
        };

        const scanResult = await this._securityScanner.scanWorkspace(options);

        return {
            agentId: agent.id,
            success: true,
            duration: Date.now() - startTime,
            data: scanResult,
            summary: `Found ${scanResult.issues.length} issues (${scanResult.summary.critical} critical, ${scanResult.summary.high} high)`,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Execute test generator
     */
    private async executeTestGenerator(
        agent: AgentDefinition,
        context: AgentExecutionContext
    ): Promise<AgentExecutionResult> {
        if (!this._testGenerator) {
            this._testGenerator = new TestGenerator(context.config);
        }

        const startTime = Date.now();

        let testResult: TestGenerationResult;
        if (context.files && context.files.length > 0) {
            testResult = await this._testGenerator.generateTestsForFiles(context.files);
        } else {
            testResult = await this._testGenerator.generateTestsForChangedFiles();
        }

        return {
            agentId: agent.id,
            success: testResult.success,
            duration: Date.now() - startTime,
            data: testResult,
            summary: `Generated ${testResult.tests.length} test file(s) with ${testResult.errors.length} error(s)`,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Execute PR review
     */
    private async executePrReview(
        agent: AgentDefinition,
        context: AgentExecutionContext
    ): Promise<AgentExecutionResult> {
        if (!this._prReviewToolkit) {
            this._prReviewToolkit = new PrReviewToolkit();
        }

        const startTime = Date.now();

        if (!context.diff) {
            // Get diff from git
            const { execSync } = require('child_process');
            try {
                context.diff = execSync('git diff HEAD', {
                    cwd: context.workspaceRoot,
                    encoding: 'utf-8',
                    maxBuffer: 10 * 1024 * 1024
                });
            } catch {
                return {
                    agentId: agent.id,
                    success: false,
                    duration: Date.now() - startTime,
                    data: null,
                    summary: 'Failed to get git diff',
                    timestamp: new Date().toISOString()
                };
            }
        }

        if (!context.diff || context.diff.trim().length === 0) {
            return {
                agentId: agent.id,
                success: true,
                duration: Date.now() - startTime,
                data: null,
                summary: 'No changes to review',
                timestamp: new Date().toISOString()
            };
        }

        const prompt = this._prReviewToolkit.buildReviewPrompt(context.diff);

        // Use Claude to perform the review
        const claudeProcess = new ClaudeProcess({ config: context.config });
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
                const reviewResult = this._prReviewToolkit!.parseReviewResponse(response);

                if (reviewResult) {
                    resolve({
                        agentId: agent.id,
                        success: true,
                        duration: Date.now() - startTime,
                        data: reviewResult,
                        summary: `Review complete: ${reviewResult.stats.totalIssues} issues found, score ${reviewResult.overallScore}/100`,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    resolve({
                        agentId: agent.id,
                        success: false,
                        duration: Date.now() - startTime,
                        data: null,
                        summary: 'Failed to parse review response',
                        timestamp: new Date().toISOString()
                    });
                }
            });

            claudeProcess.onError(() => {
                resolve({
                    agentId: agent.id,
                    success: false,
                    duration: Date.now() - startTime,
                    data: null,
                    summary: 'Claude process error',
                    timestamp: new Date().toISOString()
                });
            });

            claudeProcess.send(prompt);
        });
    }

    /**
     * Get execution history
     */
    public getExecutionHistory(limit?: number): AgentExecutionResult[] {
        const history = [...this._executionHistory].reverse();
        return limit ? history.slice(0, limit) : history;
    }

    /**
     * Get last execution result for an agent
     */
    public getLastResult(agentId: string): AgentExecutionResult | null {
        for (let i = this._executionHistory.length - 1; i >= 0; i--) {
            if (this._executionHistory[i].agentId === agentId) {
                return this._executionHistory[i];
            }
        }
        return null;
    }

    /**
     * Format result for display
     */
    public formatResultAsMarkdown(result: AgentExecutionResult): string {
        const agent = this._agents.get(result.agentId);
        const lines: string[] = [];

        lines.push(`# ${agent?.name || result.agentId} Results`);
        lines.push('');
        lines.push(`**Status:** ${result.success ? '✅ Success' : '❌ Failed'}`);
        lines.push(`**Duration:** ${result.duration}ms`);
        lines.push(`**Time:** ${new Date(result.timestamp).toLocaleString()}`);
        lines.push('');
        lines.push(`## Summary`);
        lines.push(result.summary);
        lines.push('');

        if (result.data) {
            switch (agent?.type) {
                case 'security':
                    if (this._securityScanner) {
                        lines.push(this._securityScanner.formatReport(result.data as SecurityScanResult));
                    }
                    break;
                case 'pr-review':
                    if (this._prReviewToolkit) {
                        lines.push(this._prReviewToolkit.formatReviewAsMarkdown(result.data as ReviewResult));
                    }
                    break;
                case 'test-generator':
                    const testResult = result.data as TestGenerationResult;
                    lines.push(`## Generated Tests`);
                    for (const test of testResult.tests) {
                        lines.push(`### ${test.testFile}`);
                        lines.push(`- Source: ${test.sourceFile}`);
                        lines.push(`- Framework: ${test.framework}`);
                        lines.push(`- Functions covered: ${test.coverage.join(', ')}`);
                        lines.push('');
                    }
                    if (testResult.errors.length > 0) {
                        lines.push(`## Errors`);
                        for (const error of testResult.errors) {
                            lines.push(`- ${error}`);
                        }
                    }
                    break;
            }
        }

        return lines.join('\n');
    }

    public dispose(): void {
        this._securityScanner?.dispose();
        this._testGenerator?.dispose();
        this._prReviewToolkit?.dispose();
        this._onAgentExecutionStart.dispose();
        this._onAgentExecutionComplete.dispose();
    }
}
