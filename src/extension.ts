import * as vscode from 'vscode';
import { ChatViewProvider } from './providers/chatViewProvider';
import { AgentsViewProvider } from './providers/agentsViewProvider';
import { MemoryViewProvider } from './providers/memoryViewProvider';
import { UsageTracker } from './stats/tracker';
import { SessionManager } from './sessions/manager';
import { ThinkingDisplay } from './thinking/display';
import { PluginManager } from './plugins/manager';
import { McpServerManager } from './mcp/serverManager';
import { PrReviewToolkit } from './agents/prReview';
import { DocumentProcessor } from './documents/processor';
import { AgentOrchestrator } from './agents/orchestrator';
import { BrowserController } from './browser/controller';
import { FigmaIntegration } from './integrations/figma';

export function activate(context: vscode.ExtensionContext) {
    console.log('Draagon AI extension activating...');

    // Initialize core providers
    const chatProvider = new ChatViewProvider(context.extensionUri, context);
    const agentsProvider = new AgentsViewProvider();
    const memoryProvider = new MemoryViewProvider();

    // Initialize new feature modules
    const usageTracker = new UsageTracker(context);
    const sessionManager = new SessionManager(context);
    const thinkingDisplay = new ThinkingDisplay();
    const pluginManager = new PluginManager(context);
    const mcpManager = new McpServerManager(context);
    const prReviewToolkit = new PrReviewToolkit();
    const documentProcessor = new DocumentProcessor(context);
    const orchestrator = new AgentOrchestrator();
    const browserController = new BrowserController();
    const figmaIntegration = new FigmaIntegration();

    // Register webview provider for chat
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('draagon.chatView', chatProvider)
    );

    // Register tree view providers
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('draagon.agentsView', agentsProvider),
        vscode.window.registerTreeDataProvider('draagon.memoryView', memoryProvider)
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('draagon.openChat', () => {
            vscode.commands.executeCommand('draagon.chatView.focus');
        }),

        vscode.commands.registerCommand('draagon.newSession', () => {
            chatProvider.newSession();
        }),

        vscode.commands.registerCommand('draagon.runCodeReview', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const selection = editor.selection;
                const code = editor.document.getText(selection.isEmpty ? undefined : selection);
                await agentsProvider.runAgent('code-reviewer', {
                    type: 'selection',
                    code,
                    filePath: editor.document.uri.fsPath,
                    language: editor.document.languageId
                });
            }
        }),

        vscode.commands.registerCommand('draagon.runSecurityScan', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const selection = editor.selection;
                const code = editor.document.getText(selection.isEmpty ? undefined : selection);
                await agentsProvider.runAgent('security-scanner', {
                    type: 'selection',
                    code,
                    filePath: editor.document.uri.fsPath,
                    language: editor.document.languageId
                });
            }
        }),

        vscode.commands.registerCommand('draagon.openMemoryBrowser', () => {
            vscode.commands.executeCommand('draagon.memoryView.focus');
        }),

        // Usage Stats commands
        vscode.commands.registerCommand('draagon.showStats', async () => {
            const stats = usageTracker.getStats();
            const panel = vscode.window.createWebviewPanel(
                'draagonStats',
                'Draagon AI Usage Stats',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );
            panel.webview.html = usageTracker.getStatsHtml(stats);
        }),

        // Session management commands
        vscode.commands.registerCommand('draagon.renameSession', async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter a name for this session',
                placeHolder: 'My Feature Branch'
            });
            if (name) {
                const current = sessionManager.getCurrentSession();
                if (current) {
                    sessionManager.renameSession(current.id, name);
                    vscode.window.showInformationMessage(`Session renamed to "${name}"`);
                }
            }
        }),

        vscode.commands.registerCommand('draagon.resumeSession', async () => {
            const sessions = sessionManager.getSessions();
            const items = sessions.map(s => ({
                label: s.name || s.id,
                description: new Date(s.updatedAt).toLocaleString(),
                session: s
            }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a session to resume'
            });
            if (selected) {
                sessionManager.resumeSession(selected.session.id);
            }
        }),

        // Plugin commands
        vscode.commands.registerCommand('draagon.installPlugin', async () => {
            const source = await vscode.window.showInputBox({
                prompt: 'Enter plugin source (npm package, git URL, or local path)',
                placeHolder: '@anthropic/claude-code-memory'
            });
            if (source) {
                await pluginManager.installPlugin(source);
            }
        }),

        vscode.commands.registerCommand('draagon.managePlugins', async () => {
            const plugins = pluginManager.getPlugins();
            const items = plugins.map(p => ({
                label: `${p.enabled ? '✓' : '○'} ${p.manifest.name}`,
                description: p.manifest.version,
                detail: p.manifest.description,
                plugin: p
            }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a plugin to manage'
            });
            if (selected) {
                const action = await vscode.window.showQuickPick([
                    { label: selected.plugin.enabled ? 'Disable' : 'Enable' },
                    { label: 'Uninstall' },
                    { label: 'Cancel' }
                ]);
                if (action?.label === 'Enable') {
                    pluginManager.enablePlugin(selected.plugin.id);
                } else if (action?.label === 'Disable') {
                    pluginManager.disablePlugin(selected.plugin.id);
                } else if (action?.label === 'Uninstall') {
                    await pluginManager.uninstallPlugin(selected.plugin.id);
                }
            }
        }),

        // MCP Server commands
        vscode.commands.registerCommand('draagon.manageMcpServers', async () => {
            const templates = mcpManager.getTemplates();
            const servers = mcpManager.getServers();

            const action = await vscode.window.showQuickPick([
                { label: 'Add Server from Template', action: 'add' },
                { label: 'View Running Servers', action: 'view' },
                { label: 'Stop All Servers', action: 'stopAll' }
            ]);

            if (action?.action === 'add') {
                const template = await vscode.window.showQuickPick(
                    templates.map(t => ({
                        label: t.name,
                        description: t.description,
                        template: t
                    })),
                    { placeHolder: 'Select an MCP server template' }
                );
                if (template) {
                    await mcpManager.addServerFromTemplate(template.template.id);
                }
            } else if (action?.action === 'view') {
                const serverItems = servers.map(s => {
                    const status = mcpManager.getServerStatus(s.id);
                    const isRunning = status?.running ?? false;
                    return {
                        label: `${isRunning ? '🟢' : '🔴'} ${s.name}`,
                        description: isRunning ? 'running' : 'stopped',
                        server: s,
                        isRunning
                    };
                });
                const selected = await vscode.window.showQuickPick(serverItems);
                if (selected) {
                    const serverAction = await vscode.window.showQuickPick([
                        { label: selected.isRunning ? 'Stop' : 'Start' },
                        { label: 'Remove' }
                    ]);
                    if (serverAction?.label === 'Stop') {
                        mcpManager.stopServer(selected.server.id);
                    } else if (serverAction?.label === 'Start') {
                        await mcpManager.startServer(selected.server.id);
                    } else if (serverAction?.label === 'Remove') {
                        mcpManager.removeServer(selected.server.id);
                    }
                }
            } else if (action?.action === 'stopAll') {
                mcpManager.stopAllServers();
            }
        }),

        // PR Review commands
        vscode.commands.registerCommand('draagon.runPrReview', async () => {
            const agents = prReviewToolkit.getAgents();
            const selectedAgents = await vscode.window.showQuickPick(
                agents.map(a => ({ label: a.name, description: a.description, picked: true, agent: a })),
                { canPickMany: true, placeHolder: 'Select review agents to run' }
            );

            if (selectedAgents && selectedAgents.length > 0) {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const code = editor.document.getText();
                    const agentIds = selectedAgents.map(s => s.agent.id);
                    const prompt = prReviewToolkit.buildReviewPrompt(code, agentIds);
                    // This would integrate with the chat provider to send the review
                    chatProvider.sendMessage(prompt);
                }
            }
        }),

        // Document processing commands
        vscode.commands.registerCommand('draagon.processDocument', async () => {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: {
                    'Documents': ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'json', 'xml', 'html', 'md']
                }
            });

            if (uris && uris[0]) {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Processing document...',
                    cancellable: false
                }, async () => {
                    const result = await documentProcessor.processDocument(uris[0].fsPath);
                    if (result) {
                        // Show document content in a new editor
                        const doc = await vscode.workspace.openTextDocument({
                            content: JSON.stringify(result, null, 2),
                            language: 'json'
                        });
                        await vscode.window.showTextDocument(doc);
                    }
                });
            }
        }),

        // Multi-agent orchestration commands
        vscode.commands.registerCommand('draagon.launchAgentSwarm', async () => {
            const taskInput = await vscode.window.showInputBox({
                prompt: 'Describe the tasks for the agent swarm',
                placeHolder: 'Review code, write tests, update documentation...'
            });

            if (taskInput) {
                const tasks = taskInput.split(',').map(t => ({
                    prompt: t.trim(),
                    priority: 'normal' as const
                }));

                const mode = await vscode.window.showQuickPick([
                    { label: 'Parallel', description: 'Run tasks simultaneously', mode: 'parallel' },
                    { label: 'Sequential', description: 'Run tasks one after another', mode: 'sequential' }
                ]);

                if (mode) {
                    vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: 'Running agent swarm...',
                        cancellable: true
                    }, async (_progress, token) => {
                        token.onCancellationRequested(() => {
                            orchestrator.stopSwarm();
                        });

                        const result = mode.mode === 'parallel'
                            ? await orchestrator.runParallelTasks(tasks)
                            : await orchestrator.runSequentialTasks(tasks);

                        vscode.window.showInformationMessage(result.summary);
                    });
                }
            }
        }),

        // Browser control commands
        vscode.commands.registerCommand('draagon.launchBrowser', async () => {
            const url = await vscode.window.showInputBox({
                prompt: 'Enter URL to open',
                placeHolder: 'https://example.com',
                value: 'https://google.com'
            });

            if (url) {
                await browserController.launch();
                await browserController.navigate(url);
                vscode.window.showInformationMessage('Browser launched');
            }
        }),

        vscode.commands.registerCommand('draagon.closeBrowser', () => {
            browserController.close();
            vscode.window.showInformationMessage('Browser closed');
        }),

        // Figma integration commands
        vscode.commands.registerCommand('draagon.connectFigma', async () => {
            const token = await vscode.window.showInputBox({
                prompt: 'Enter your Figma Personal Access Token',
                password: true
            });

            if (token) {
                figmaIntegration.setAccessToken(token);
                vscode.window.showInformationMessage('Figma connected');
            }
        }),

        vscode.commands.registerCommand('draagon.importFigmaDesign', async () => {
            const url = await vscode.window.showInputBox({
                prompt: 'Enter Figma design URL',
                placeHolder: 'https://www.figma.com/file/xxxxx/Design-Name'
            });

            if (url) {
                const { fileKey, nodeId } = figmaIntegration.parseUrl(url);
                if (fileKey) {
                    vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: 'Fetching Figma design...',
                        cancellable: false
                    }, async () => {
                        const file = await figmaIntegration.getFile(fileKey);
                        if (file) {
                            const framework = await vscode.window.showQuickPick([
                                { label: 'React', value: 'react' as const },
                                { label: 'Vue', value: 'vue' as const },
                                { label: 'Svelte', value: 'svelte' as const },
                                { label: 'HTML', value: 'html' as const },
                                { label: 'Tailwind', value: 'tailwind' as const }
                            ], { placeHolder: 'Select output framework' });

                            if (framework) {
                                const targetNode = nodeId
                                    ? await figmaIntegration.getNode(fileKey, nodeId)
                                    : file.document;

                                if (targetNode) {
                                    const code = figmaIntegration.generateCode(targetNode, {
                                        framework: framework.value,
                                        useTailwind: framework.value === 'tailwind',
                                        useTypescript: true,
                                        includeStyles: true,
                                        responsiveBreakpoints: true
                                    });

                                    const doc = await vscode.workspace.openTextDocument({
                                        content: code,
                                        language: framework.value === 'html' ? 'html' :
                                                 framework.value === 'vue' ? 'vue' :
                                                 framework.value === 'svelte' ? 'svelte' : 'typescriptreact'
                                    });
                                    await vscode.window.showTextDocument(doc);
                                }
                            }
                        }
                    });
                }
            }
        })
    );

    // Wire up cross-module communication
    chatProvider.setUsageTracker(usageTracker);
    chatProvider.setSessionManager(sessionManager);
    chatProvider.setThinkingDisplay(thinkingDisplay);
    agentsProvider.setOrchestrator(orchestrator);
    agentsProvider.setPrReviewToolkit(prReviewToolkit);

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('draagon')) {
                chatProvider.onConfigurationChanged();
            }
        })
    );

    console.log('Draagon AI extension activated');
}

export function deactivate() {
    console.log('Draagon AI extension deactivating...');
    // Cleanup is handled by disposables added to context.subscriptions
    console.log('Draagon AI extension deactivated');
}
