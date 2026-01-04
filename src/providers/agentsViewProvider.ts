import * as vscode from 'vscode';
import Groq from 'groq-sdk';
import type { AgentOrchestrator } from '../agents/orchestrator';
import type { PrReviewToolkit } from '../agents/prReview';

interface AgentContext {
    type: 'file' | 'selection' | 'diff' | 'project';
    filePath?: string;
    code?: string;
    language?: string;
    diff?: string;
}

interface Agent {
    id: string;
    name: string;
    icon: string;
    description: string;
    systemPrompt: string;
}

export class AgentsViewProvider implements vscode.TreeDataProvider<AgentItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<AgentItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _agents: Agent[] = [
        {
            id: 'code-reviewer',
            name: 'Code Reviewer',
            icon: '👀',
            description: 'Analyze code for issues and improvements',
            systemPrompt: `You are an expert code reviewer. Analyze the provided code for:
- Bugs and potential issues
- Performance problems
- Security vulnerabilities
- Code style and best practices
- Potential improvements

Be concise but thorough. Format as bullet points with severity indicators:
🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low`
        },
        {
            id: 'security-scanner',
            name: 'Security Scanner',
            icon: '🔒',
            description: 'Find security vulnerabilities',
            systemPrompt: `You are a security expert. Analyze the code for:
- SQL injection vulnerabilities
- XSS vulnerabilities
- Authentication/authorization issues
- Sensitive data exposure
- Insecure dependencies
- Input validation issues

Rate each finding: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low
Include line numbers and remediation suggestions.`
        },
        {
            id: 'doc-generator',
            name: 'Doc Generator',
            icon: '📝',
            description: 'Generate documentation',
            systemPrompt: `You are a technical writer. Generate clear, comprehensive documentation for the provided code including:
- Function/class descriptions
- Parameter documentation
- Return value descriptions
- Usage examples
- Any important notes or warnings

Use the appropriate documentation format for the language (JSDoc, docstrings, etc.)`
        },
        {
            id: 'test-writer',
            name: 'Test Writer',
            icon: '🧪',
            description: 'Generate test cases',
            systemPrompt: `You are a testing expert. Generate comprehensive test cases for the provided code including:
- Unit tests for each function/method
- Edge cases
- Error handling tests
- Integration tests where appropriate

Use the appropriate testing framework for the language. Include both positive and negative test cases.`
        }
    ];

    private _groq?: Groq;
    private _outputChannel?: vscode.OutputChannel;

    constructor() {
        this._initializeGroq();
    }

    private _initializeGroq(): void {
        const config = vscode.workspace.getConfiguration('draagon');
        const apiKey = config.get<string>('groq.apiKey', '');

        if (apiKey) {
            this._groq = new Groq({ apiKey });
        }
    }

    getTreeItem(element: AgentItem): vscode.TreeItem {
        return element;
    }

    getChildren(): AgentItem[] {
        return this._agents.map(agent => new AgentItem(agent));
    }

    async runAgent(agentId: string, context: AgentContext): Promise<void> {
        const agent = this._agents.find(a => a.id === agentId);
        if (!agent) {
            vscode.window.showErrorMessage(`Agent not found: ${agentId}`);
            return;
        }

        if (!this._groq) {
            const config = vscode.workspace.getConfiguration('draagon');
            const apiKey = config.get<string>('groq.apiKey', '');

            if (!apiKey) {
                vscode.window.showErrorMessage('Groq API key not configured. Set draagon.groq.apiKey in settings.');
                return;
            }

            this._groq = new Groq({ apiKey });
        }

        // Create or get output channel
        if (!this._outputChannel) {
            this._outputChannel = vscode.window.createOutputChannel('Draagon Agents');
        }

        this._outputChannel.clear();
        this._outputChannel.show();
        this._outputChannel.appendLine(`${agent.icon} Running ${agent.name}...`);
        this._outputChannel.appendLine(`File: ${context.filePath || 'Selection'}`);
        this._outputChannel.appendLine('─'.repeat(50));

        try {
            const startTime = Date.now();

            const prompt = this._buildPrompt(agent, context);

            const config = vscode.workspace.getConfiguration('draagon');
            const model = config.get<string>('groq.model', 'llama-3.3-70b-versatile');

            const response = await this._groq.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: agent.systemPrompt },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 2000,
                temperature: 0.1
            });

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const content = response.choices[0]?.message?.content || 'No response';

            this._outputChannel.appendLine('');
            this._outputChannel.appendLine(content);
            this._outputChannel.appendLine('');
            this._outputChannel.appendLine('─'.repeat(50));
            this._outputChannel.appendLine(`Completed in ${elapsed}s`);

        } catch (error: any) {
            this._outputChannel.appendLine(`Error: ${error.message}`);
            vscode.window.showErrorMessage(`Agent error: ${error.message}`);
        }
    }

    private _buildPrompt(agent: Agent, context: AgentContext): string {
        return `## Context
File: ${context.filePath || 'Unknown'}
Language: ${context.language || 'Unknown'}

## Code
\`\`\`${context.language || ''}
${context.code}
\`\`\`

Please provide your ${agent.name.toLowerCase()} analysis:`;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    // Setter methods for cross-module integration
    private _orchestrator?: AgentOrchestrator;
    private _prReviewToolkit?: PrReviewToolkit;

    public setOrchestrator(orchestrator: AgentOrchestrator): void {
        this._orchestrator = orchestrator;
    }

    public setPrReviewToolkit(toolkit: PrReviewToolkit): void {
        this._prReviewToolkit = toolkit;
    }

    public getOrchestrator(): AgentOrchestrator | undefined {
        return this._orchestrator;
    }

    public getPrReviewToolkit(): PrReviewToolkit | undefined {
        return this._prReviewToolkit;
    }
}

class AgentItem extends vscode.TreeItem {
    constructor(public readonly agent: Agent) {
        super(`${agent.icon} ${agent.name}`, vscode.TreeItemCollapsibleState.None);
        this.description = agent.description;
        this.tooltip = agent.description;
        this.command = {
            command: 'draagon.runCodeReview', // Will be replaced with proper agent command
            title: 'Run Agent',
            arguments: [agent.id]
        };
    }
}
