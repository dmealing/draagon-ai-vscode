import * as vscode from 'vscode';
import { ChatViewProvider } from './providers/chatViewProvider';
import { AgentsViewProvider } from './providers/agentsViewProvider';
import { MemoryViewProvider } from './providers/memoryViewProvider';
import { AccountViewProvider } from './providers/accountViewProvider';
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
// New feature imports (REQ-001 through REQ-007)
import { PermissionManager } from './permissions/manager';
import { DiffContentProvider } from './diff/provider';
import { ImageHandler } from './images/handler';
import { TokenTracker } from './stats/tokenTracker';
import { ConversationHistoryManager } from './history/manager';
import { WslSupport } from './wsl/support';
import { ThinkingModeManager } from './thinking/modes';
import { AgentRegistry } from './agents/registry';
import { PlanManager } from './plan/manager';

export function activate(context: vscode.ExtensionContext) {
    console.log('Draagon AI extension activating...');

    try {
        // Initialize core providers
        const chatProvider = new ChatViewProvider(context.extensionUri, context);
        const accountProvider = new AccountViewProvider(context);
        const agentsProvider = new AgentsViewProvider();
        const memoryProvider = new MemoryViewProvider();

        // Initialize feature modules
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

        // Initialize REQ-001 through REQ-007 feature modules
        const permissionManager = new PermissionManager(context);
        const diffProvider = new DiffContentProvider();
        const imageHandler = new ImageHandler(context);
        const tokenTracker = new TokenTracker();
        const historyManager = new ConversationHistoryManager(context);
        const wslSupport = new WslSupport();
        const thinkingModeManager = new ThinkingModeManager(context);
        const agentRegistry = new AgentRegistry(vscode.workspace.getConfiguration('draagon'));
        const planManager = new PlanManager(context, vscode.workspace.getConfiguration('draagon'));

        // Register view providers
        context.subscriptions.push(
            // AccountView is now a WebviewViewProvider for custom styling
            vscode.window.registerWebviewViewProvider(
                AccountViewProvider.viewType,
                accountProvider
            ),
            vscode.window.registerTreeDataProvider('draagon.agentsView', agentsProvider),
            vscode.window.registerTreeDataProvider('draagon.memoryView', memoryProvider)
        );

        // Register diff content provider (REQ-002)
        context.subscriptions.push(
            vscode.workspace.registerTextDocumentContentProvider('draagon-diff', diffProvider)
        );

        // Create status bar item for quick access
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = '$(comment-discussion) Draagon';
        statusBarItem.tooltip = 'Open Draagon AI Chat';
        statusBarItem.command = 'draagon.openChatPanel';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // Create thinking mode status bar item (REQ-007)
        const thinkingStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        thinkingStatusItem.text = thinkingModeManager.getStatusText();
        thinkingStatusItem.tooltip = 'Click to change thinking mode';
        thinkingStatusItem.command = 'draagon.selectThinkingMode';
        thinkingStatusItem.show();
        context.subscriptions.push(thinkingStatusItem);

        // Update thinking mode status bar when mode changes
        thinkingModeManager.onModeChange(() => {
            thinkingStatusItem.text = thinkingModeManager.getStatusText();
        });

        // Register disposable modules for cleanup
        context.subscriptions.push(
            mcpManager,
            browserController,
            orchestrator,
            // REQ-001 through REQ-007 disposables
            permissionManager,
            tokenTracker,
            historyManager,
            thinkingModeManager,
            // New feature disposables
            agentRegistry,
            planManager
        );

        // Register commands
        context.subscriptions.push(
            vscode.commands.registerCommand('draagon.openChat', () => {
                chatProvider.openAsPanel();
            }),

            vscode.commands.registerCommand('draagon.openChatPanel', () => {
                chatProvider.openAsPanel();
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

            // Context menu commands for code selection
            vscode.commands.registerCommand('draagon.askAboutSelection', async () => {
                const editor = vscode.window.activeTextEditor;
                if (editor && !editor.selection.isEmpty) {
                    const code = editor.document.getText(editor.selection);
                    const filePath = editor.document.uri.fsPath;
                    const language = editor.document.languageId;
                    const prompt = `Please explain and analyze this ${language} code from ${filePath}:\n\n\`\`\`${language}\n${code}\n\`\`\``;
                    await chatProvider.sendMessageToChat(prompt);
                }
            }),

            vscode.commands.registerCommand('draagon.explainCode', async () => {
                const editor = vscode.window.activeTextEditor;
                if (editor && !editor.selection.isEmpty) {
                    const code = editor.document.getText(editor.selection);
                    const language = editor.document.languageId;
                    const prompt = `Explain this ${language} code in detail. What does it do? How does it work? Are there any important patterns or concepts used?\n\n\`\`\`${language}\n${code}\n\`\`\``;
                    await chatProvider.sendMessageToChat(prompt);
                }
            }),

            vscode.commands.registerCommand('draagon.generateTestsForSelection', async () => {
                const editor = vscode.window.activeTextEditor;
                if (editor && !editor.selection.isEmpty) {
                    const code = editor.document.getText(editor.selection);
                    const filePath = editor.document.uri.fsPath;
                    const language = editor.document.languageId;
                    const prompt = `Generate comprehensive unit tests for this ${language} code from ${filePath}. Include edge cases and error handling:\n\n\`\`\`${language}\n${code}\n\`\`\``;
                    await chatProvider.sendMessageToChat(prompt);
                }
            }),

            vscode.commands.registerCommand('draagon.refactorCode', async () => {
                const editor = vscode.window.activeTextEditor;
                if (editor && !editor.selection.isEmpty) {
                    const code = editor.document.getText(editor.selection);
                    const language = editor.document.languageId;
                    const prompt = `Refactor this ${language} code to improve readability, maintainability, and performance. Explain your changes:\n\n\`\`\`${language}\n${code}\n\`\`\``;
                    await chatProvider.sendMessageToChat(prompt);
                }
            }),

            vscode.commands.registerCommand('draagon.documentCode', async () => {
                const editor = vscode.window.activeTextEditor;
                if (editor && !editor.selection.isEmpty) {
                    const code = editor.document.getText(editor.selection);
                    const language = editor.document.languageId;
                    const prompt = `Add comprehensive documentation to this ${language} code. Include JSDoc/docstrings, inline comments for complex logic, and type annotations where appropriate:\n\n\`\`\`${language}\n${code}\n\`\`\``;
                    await chatProvider.sendMessageToChat(prompt);
                }
            }),

            vscode.commands.registerCommand('draagon.findBugs', async () => {
                const editor = vscode.window.activeTextEditor;
                if (editor && !editor.selection.isEmpty) {
                    const code = editor.document.getText(editor.selection);
                    const language = editor.document.languageId;
                    const prompt = `Analyze this ${language} code for potential bugs, security vulnerabilities, edge cases, and logic errors. Be thorough:\n\n\`\`\`${language}\n${code}\n\`\`\``;
                    await chatProvider.sendMessageToChat(prompt);
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
                    'Draagon Usage Statistics',
                    vscode.ViewColumn.One,
                    { enableScripts: true }
                );
                panel.webview.html = usageTracker.getStatsHtml(stats);
            }),

            // Session management commands
            vscode.commands.registerCommand('draagon.renameSession', async () => {
                const currentSession = sessionManager.getCurrentSession();
                if (!currentSession) {
                    vscode.window.showInformationMessage('No active session to rename');
                    return;
                }
                const newName = await vscode.window.showInputBox({
                    prompt: 'Enter new session name',
                    placeHolder: 'My Session'
                });
                if (newName) {
                    sessionManager.renameSession(currentSession.id, newName);
                }
            }),

            vscode.commands.registerCommand('draagon.resumeSession', async () => {
                const sessions = sessionManager.getSessions();
                const items = sessions.map(s => ({
                    label: s.name || s.id,
                    description: new Date(s.createdAt).toLocaleString(),
                    session: s
                }));
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select session to resume'
                });
                if (selected) {
                    sessionManager.resumeSession(selected.session.id);
                }
            }),

            // Plugin management commands
            vscode.commands.registerCommand('draagon.installPlugin', async () => {
                const url = await vscode.window.showInputBox({
                    prompt: 'Enter plugin repository URL or npm package name',
                    placeHolder: 'https://github.com/user/plugin or @scope/plugin-name'
                });
                if (url) {
                    await pluginManager.installPlugin(url);
                }
            }),

            vscode.commands.registerCommand('draagon.managePlugins', async () => {
                const plugins = pluginManager.getPlugins();
                const items = plugins.map(p => ({
                    label: `${p.enabled ? '$(check)' : '$(x)'} ${p.manifest.name}`,
                    description: p.manifest.version,
                    plugin: p
                }));
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select plugin to manage'
                });
                if (selected) {
                    const action = await vscode.window.showQuickPick([
                        { label: selected.plugin.enabled ? 'Disable' : 'Enable', action: 'toggle' },
                        { label: 'Uninstall', action: 'uninstall' },
                        { label: 'View Details', action: 'details' }
                    ]);
                    if (action) {
                        switch (action.action) {
                            case 'toggle':
                                if (selected.plugin.enabled) {
                                    pluginManager.disablePlugin(selected.plugin.id);
                                } else {
                                    pluginManager.enablePlugin(selected.plugin.id);
                                }
                                break;
                            case 'uninstall':
                                pluginManager.uninstallPlugin(selected.plugin.id);
                                break;
                            case 'details':
                                vscode.window.showInformationMessage(
                                    `${selected.plugin.manifest.name} v${selected.plugin.manifest.version}\n${selected.plugin.manifest.description}`
                                );
                                break;
                        }
                    }
                }
            }),

            // MCP server management
            vscode.commands.registerCommand('draagon.manageMcpServers', async () => {
                const servers = mcpManager.getServers();
                const items = servers.map(s => {
                    const status = mcpManager.getServerStatus(s.id);
                    const isRunning = status?.running ?? false;
                    return {
                        label: `${isRunning ? '$(pass)' : '$(circle-slash)'} ${s.name}`,
                        description: isRunning ? 'running' : 'stopped',
                        server: s,
                        isRunning
                    };
                });
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select MCP server to manage'
                });
                if (selected) {
                    const action = await vscode.window.showQuickPick([
                        { label: selected.isRunning ? 'Stop' : 'Start', action: 'toggle' },
                        { label: 'Restart', action: 'restart' },
                        { label: 'View Config', action: 'config' }
                    ]);
                    if (action) {
                        switch (action.action) {
                            case 'toggle':
                                if (selected.isRunning) {
                                    mcpManager.stopServer(selected.server.id);
                                } else {
                                    await mcpManager.startServer(selected.server.id);
                                }
                                break;
                            case 'restart':
                                await mcpManager.restartServer(selected.server.id);
                                break;
                            case 'config':
                                const config = JSON.stringify(selected.server, null, 2);
                                const doc = await vscode.workspace.openTextDocument({
                                    content: config,
                                    language: 'json'
                                });
                                await vscode.window.showTextDocument(doc);
                                break;
                        }
                    }
                }
            }),

            // PR Review command
            vscode.commands.registerCommand('draagon.runPrReview', async () => {
                const prNumber = await vscode.window.showInputBox({
                    prompt: 'Enter PR number or URL',
                    placeHolder: '123 or https://github.com/owner/repo/pull/123'
                });
                if (prNumber) {
                    // Show info about PR review capabilities
                    const agents = prReviewToolkit.getEnabledAgents();
                    const agentList = agents.map(a => `• ${a.name}: ${a.description}`).join('\n');
                    vscode.window.showInformationMessage(
                        `PR Review Agents Available:\n${agentList}\n\nUse the chat interface to run a PR review with: "Review PR #${prNumber}"`
                    );
                }
            }),

            // Document processing command
            vscode.commands.registerCommand('draagon.processDocument', async () => {
                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    filters: {
                        'Documents': ['pdf', 'docx', 'txt', 'md', 'html']
                    }
                });
                if (uris && uris[0]) {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: 'Processing document...',
                        cancellable: false
                    }, async () => {
                        const result = await documentProcessor.processDocument(uris[0].fsPath);
                        if (result) {
                            const title = result.metadata.title || result.fileName;
                            const wordCount = result.metadata.wordCount || 0;
                            chatProvider.sendMessage(`I've processed the document "${title}" (${wordCount} words). The content is ready to discuss.`);
                        }
                    });
                }
            }),

            // Agent swarm command
            vscode.commands.registerCommand('draagon.launchAgentSwarm', async () => {
                const task = await vscode.window.showInputBox({
                    prompt: 'Describe the task for the agent swarm',
                    placeHolder: 'Analyze this codebase and suggest improvements...'
                });
                if (task) {
                    const agentCount = await vscode.window.showQuickPick(
                        ['2', '3', '5', '10'],
                        { placeHolder: 'How many agents?' }
                    );
                    if (agentCount) {
                        const numAgents = parseInt(agentCount);
                        // Create tasks for each agent
                        const tasks = Array.from({ length: numAgents }, (_, i) => ({
                            prompt: `${task} (Agent ${i + 1} of ${numAgents})`,
                            priority: 'normal' as const
                        }));
                        await orchestrator.runParallelTasks(tasks);
                    }
                }
            }),

            // Browser control commands
            vscode.commands.registerCommand('draagon.launchBrowser', async () => {
                const url = await vscode.window.showInputBox({
                    prompt: 'Enter URL to open',
                    placeHolder: 'https://example.com'
                });
                if (url) {
                    const launched = await browserController.launch();
                    if (launched) {
                        await browserController.navigate(url);
                    }
                }
            }),

            vscode.commands.registerCommand('draagon.closeBrowser', async () => {
                await browserController.close();
            }),

            // Figma integration commands
            vscode.commands.registerCommand('draagon.connectFigma', async () => {
                const token = await vscode.window.showInputBox({
                    prompt: 'Enter your Figma Personal Access Token',
                    password: true
                });
                if (token) {
                    const connected = await figmaIntegration.setAccessToken(token);
                    if (connected) {
                        vscode.window.showInformationMessage('Figma connected successfully!');
                    } else {
                        vscode.window.showErrorMessage('Failed to connect to Figma. Please check your token.');
                    }
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
            }),

            // REQ-001: Permission Management commands
            vscode.commands.registerCommand('draagon.managePermissions', async () => {
                const permissions = permissionManager.getPermissions();
                const action = await vscode.window.showQuickPick([
                    { label: `${permissions.yoloMode ? '$(check)' : '$(circle-slash)'} YOLO Mode`, action: 'yolo' },
                    { label: 'View Allowed Tools', action: 'view' },
                    { label: 'Clear All Permissions', action: 'clear' }
                ], { placeHolder: 'Manage permissions' });

                if (action?.action === 'yolo') {
                    permissionManager.setYoloMode(!permissions.yoloMode);
                    vscode.window.showInformationMessage(
                        `YOLO Mode ${!permissions.yoloMode ? 'enabled' : 'disabled'}`
                    );
                } else if (action?.action === 'view') {
                    const allowedTools = Object.entries(permissions.alwaysAllow)
                        .map(([tool, value]) => {
                            if (value === true) {
                                return `$(check) ${tool} (all)`;
                            }
                            if (Array.isArray(value)) {
                                return `$(check) ${tool}: ${value.join(', ')}`;
                            }
                            return `$(circle-slash) ${tool}`;
                        });
                    const doc = await vscode.workspace.openTextDocument({
                        content: `# Allowed Tools\n\n${allowedTools.join('\n')}`,
                        language: 'markdown'
                    });
                    await vscode.window.showTextDocument(doc);
                } else if (action?.action === 'clear') {
                    const confirm = await vscode.window.showWarningMessage(
                        'Clear all custom permissions?',
                        { modal: true },
                        'Yes'
                    );
                    if (confirm === 'Yes') {
                        permissionManager.clearAllPermissions();
                        vscode.window.showInformationMessage('Permissions cleared');
                    }
                }
            }),

            // REQ-004: Token usage display
            vscode.commands.registerCommand('draagon.showTokenUsage', async () => {
                const panel = vscode.window.createWebviewPanel(
                    'draagonTokens',
                    'Token Usage',
                    vscode.ViewColumn.One,
                    { enableScripts: true }
                );
                panel.webview.html = tokenTracker.getTokenDisplayHtml();
            }),

            // REQ-005: Conversation history commands
            vscode.commands.registerCommand('draagon.viewHistory', async () => {
                const conversations = historyManager.getConversations();
                const items = conversations.map(c => ({
                    label: c.firstUserMessage.substring(0, 50) || c.id,
                    description: `${c.messageCount} messages - ${new Date(c.startTime).toLocaleDateString()}`,
                    detail: c.lastUserMessage,
                    id: c.id
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select a conversation to view',
                    matchOnDetail: true
                });

                if (selected) {
                    const markdown = await historyManager.exportAsMarkdown(selected.id);
                    if (markdown) {
                        const doc = await vscode.workspace.openTextDocument({
                            content: markdown,
                            language: 'markdown'
                        });
                        await vscode.window.showTextDocument(doc);
                    }
                }
            }),

            vscode.commands.registerCommand('draagon.searchHistory', async () => {
                const query = await vscode.window.showInputBox({
                    prompt: 'Search conversation history',
                    placeHolder: 'Enter search terms...'
                });

                if (query) {
                    const results = await historyManager.searchConversations(query);
                    if (results.length === 0) {
                        vscode.window.showInformationMessage('No matching conversations found');
                        return;
                    }

                    const items = results.map(c => ({
                        label: c.firstUserMessage.substring(0, 50) || c.id,
                        description: `${c.messageCount} messages`,
                        id: c.id
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: `Found ${results.length} matching conversations`
                    });

                    if (selected) {
                        const markdown = await historyManager.exportAsMarkdown(selected.id);
                        if (markdown) {
                            const doc = await vscode.workspace.openTextDocument({
                                content: markdown,
                                language: 'markdown'
                            });
                            await vscode.window.showTextDocument(doc);
                        }
                    }
                }
            }),

            vscode.commands.registerCommand('draagon.exportHistory', async () => {
                const conversations = historyManager.getConversations();
                const items = conversations.map(c => ({
                    label: c.firstUserMessage.substring(0, 50) || c.id,
                    description: new Date(c.startTime).toLocaleDateString(),
                    id: c.id
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select conversation to export',
                    canPickMany: false
                });

                if (selected) {
                    const format = await vscode.window.showQuickPick([
                        { label: 'Markdown', value: 'md' },
                        { label: 'JSON', value: 'json' },
                        { label: 'HTML', value: 'html' }
                    ], { placeHolder: 'Select export format' });

                    if (format) {
                        let content: string;
                        let ext: string;

                        if (format.value === 'md') {
                            content = await historyManager.exportAsMarkdown(selected.id) || '';
                            ext = 'md';
                        } else if (format.value === 'html') {
                            content = await historyManager.exportAsHtml(selected.id) || '';
                            ext = 'html';
                        } else {
                            content = await historyManager.exportAsJson(selected.id) || '';
                            ext = 'json';
                        }

                        const filters: Record<string, string[]> = {
                            md: { 'Markdown': ['md'] },
                            html: { 'HTML': ['html'] },
                            json: { 'JSON': ['json'] }
                        }[ext] as any;

                        const uri = await vscode.window.showSaveDialog({
                            defaultUri: vscode.Uri.file(`conversation-${selected.id}.${ext}`),
                            filters
                        });

                        if (uri) {
                            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
                            vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
                        }
                    }
                }
            }),

            // REQ-006: WSL Support commands
            vscode.commands.registerCommand('draagon.configureWsl', async () => {
                if (!wslSupport.isWindowsPlatform()) {
                    vscode.window.showInformationMessage('WSL is only available on Windows');
                    return;
                }

                const isAvailable = await wslSupport.isWslAvailable();
                if (!isAvailable) {
                    const install = await vscode.window.showWarningMessage(
                        'WSL is not installed or not available',
                        'Show Setup Instructions'
                    );
                    if (install) {
                        await wslSupport.showSetupInstructions();
                    }
                    return;
                }

                const distros = await wslSupport.getDistributions();
                const config = wslSupport.getConfig();

                const action = await vscode.window.showQuickPick([
                    { label: `${config.enabled ? '$(check)' : '$(circle-slash)'} WSL Mode`, action: 'toggle' },
                    { label: `Distro: ${config.distro}`, action: 'distro' },
                    { label: 'Test Connection', action: 'test' }
                ], { placeHolder: 'WSL Configuration' });

                if (action?.action === 'toggle') {
                    const vsConfig = vscode.workspace.getConfiguration('draagon');
                    await vsConfig.update('wsl.enabled', !config.enabled, vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage(`WSL Mode ${!config.enabled ? 'enabled' : 'disabled'}`);
                } else if (action?.action === 'distro') {
                    const distroItems = distros.map(d => ({
                        label: `${d.default ? '$(star) ' : ''}${d.name}`,
                        description: `${d.state} - WSL ${d.version}`,
                        distro: d
                    }));
                    const selected = await vscode.window.showQuickPick(distroItems, {
                        placeHolder: 'Select WSL distribution'
                    });
                    if (selected) {
                        const vsConfig = vscode.workspace.getConfiguration('draagon');
                        await vsConfig.update('wsl.distro', selected.distro.name, vscode.ConfigurationTarget.Global);
                        vscode.window.showInformationMessage(`Using ${selected.distro.name}`);
                    }
                } else if (action?.action === 'test') {
                    const claudeAvailable = await wslSupport.isClaudeAvailableInWsl();
                    if (claudeAvailable) {
                        vscode.window.showInformationMessage('$(check) Claude CLI is available in WSL');
                    } else {
                        vscode.window.showWarningMessage('Claude CLI not found in WSL. Install with: npm install -g @anthropic-ai/claude-code');
                    }
                }
            }),

            // REQ-007: Thinking Mode commands
            vscode.commands.registerCommand('draagon.selectThinkingMode', async () => {
                await thinkingModeManager.showModePicker();
            }),

            vscode.commands.registerCommand('draagon.cycleThinkingMode', () => {
                const newMode = thinkingModeManager.nextMode();
                const config = thinkingModeManager.getModeConfig();
                vscode.window.showInformationMessage(`Thinking mode: ${config.emoji} ${config.label}`);
            }),

            // REQ-003: Image attachment command
            vscode.commands.registerCommand('draagon.attachImage', async () => {
                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    filters: {
                        'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
                    },
                    title: 'Select image to attach'
                });

                if (uris && uris[0]) {
                    const imageInfo = await imageHandler.saveImageFromPath(uris[0].fsPath);
                    if (imageInfo) {
                        chatProvider.attachImage(imageInfo);
                        vscode.window.showInformationMessage('Image attached');
                    } else {
                        vscode.window.showErrorMessage('Failed to attach image');
                    }
                }
            }),

            // New Agent Registry commands
            vscode.commands.registerCommand('draagon.runSecurityScanner', async () => {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (!workspaceRoot) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Running Security Scan...',
                    cancellable: false
                }, async (progress) => {
                    const result = await agentRegistry.executeAgent('security-scanner', {
                        workspaceRoot,
                        config: vscode.workspace.getConfiguration('draagon')
                    });

                    if (result.success) {
                        const markdown = agentRegistry.formatResultAsMarkdown(result);
                        const doc = await vscode.workspace.openTextDocument({
                            content: markdown,
                            language: 'markdown'
                        });
                        await vscode.window.showTextDocument(doc);
                    } else {
                        vscode.window.showErrorMessage(`Security scan failed: ${result.summary}`);
                    }
                });
            }),

            vscode.commands.registerCommand('draagon.runTestGenerator', async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No file open');
                    return;
                }

                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (!workspaceRoot) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Generating Tests...',
                    cancellable: false
                }, async () => {
                    const result = await agentRegistry.executeAgent('test-generator', {
                        workspaceRoot,
                        files: [editor.document.uri.fsPath],
                        config: vscode.workspace.getConfiguration('draagon')
                    });

                    if (result.success) {
                        const markdown = agentRegistry.formatResultAsMarkdown(result);
                        const doc = await vscode.workspace.openTextDocument({
                            content: markdown,
                            language: 'markdown'
                        });
                        await vscode.window.showTextDocument(doc);
                    } else {
                        vscode.window.showErrorMessage(`Test generation failed: ${result.summary}`);
                    }
                });
            }),

            vscode.commands.registerCommand('draagon.runPrReviewer', async () => {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (!workspaceRoot) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Running PR Review...',
                    cancellable: false
                }, async () => {
                    const result = await agentRegistry.executeAgent('pr-reviewer', {
                        workspaceRoot,
                        config: vscode.workspace.getConfiguration('draagon')
                    });

                    if (result.success) {
                        const markdown = agentRegistry.formatResultAsMarkdown(result);
                        const doc = await vscode.workspace.openTextDocument({
                            content: markdown,
                            language: 'markdown'
                        });
                        await vscode.window.showTextDocument(doc);
                    } else {
                        vscode.window.showErrorMessage(`PR review failed: ${result.summary}`);
                    }
                });
            }),

            vscode.commands.registerCommand('draagon.listAgents', async () => {
                const agents = agentRegistry.getAgents();
                const items = agents.map(a => ({
                    label: `${a.enabled ? '$(check)' : '$(circle-slash)'} ${a.icon} ${a.name}`,
                    description: a.description,
                    agent: a
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select an agent to run'
                });

                if (selected) {
                    await vscode.commands.executeCommand(`draagon.run${selected.agent.id.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}`);
                }
            }),

            // Plan Mode commands
            vscode.commands.registerCommand('draagon.viewPlans', async () => {
                const plans = planManager.getPlans();
                if (plans.length === 0) {
                    vscode.window.showInformationMessage('No plans yet. Plans are created when Claude generates implementation plans.');
                    return;
                }

                const items = plans.map(p => ({
                    label: `${p.status === 'completed' ? '$(check)' : p.status === 'executing' ? '$(sync~spin)' : '$(file-text)'} ${p.title}`,
                    description: `${p.metadata.completedSteps}/${p.metadata.estimatedSteps} steps - ${p.status}`,
                    detail: p.description,
                    plan: p
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select a plan to view'
                });

                if (selected) {
                    const markdown = planManager.formatPlanAsMarkdown(selected.plan);
                    const doc = await vscode.workspace.openTextDocument({
                        content: markdown,
                        language: 'markdown'
                    });
                    await vscode.window.showTextDocument(doc);
                }
            }),

            vscode.commands.registerCommand('draagon.executePlan', async () => {
                const plans = planManager.getPlansByStatus('approved').concat(planManager.getPlansByStatus('draft'));
                if (plans.length === 0) {
                    vscode.window.showInformationMessage('No plans ready to execute');
                    return;
                }

                const items = plans.map(p => ({
                    label: p.title,
                    description: `${p.metadata.estimatedSteps} steps - ${p.status}`,
                    plan: p
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select a plan to execute'
                });

                if (selected) {
                    const dryRun = await vscode.window.showQuickPick([
                        { label: 'Execute for real', value: false },
                        { label: 'Dry run (preview only)', value: true }
                    ], { placeHolder: 'Execution mode' });

                    if (dryRun) {
                        await vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: `Executing: ${selected.plan.title}`,
                            cancellable: true
                        }, async (progress, token) => {
                            token.onCancellationRequested(() => {
                                planManager.cancelExecution();
                            });

                            const result = await planManager.executePlan(selected.plan.id, {
                                dryRun: dryRun.value,
                                autoApprove: false
                            });

                            if (result?.success) {
                                vscode.window.showInformationMessage(`Plan completed: ${result.stepsExecuted} steps executed`);
                            } else {
                                vscode.window.showWarningMessage(`Plan finished with ${result?.stepsFailed || 0} failures`);
                            }
                        });
                    }
                }
            }),

            // History tagging commands
            vscode.commands.registerCommand('draagon.tagConversation', async () => {
                const conversations = historyManager.getConversations();
                const items = conversations.map(c => ({
                    label: c.firstUserMessage.substring(0, 50) || c.id,
                    description: c.tags?.join(', ') || 'No tags',
                    id: c.id
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select conversation to tag'
                });

                if (selected) {
                    const existingTags = historyManager.getAllTags();
                    const tagInput = await vscode.window.showInputBox({
                        prompt: 'Enter tag name',
                        placeHolder: existingTags.length > 0 ? `Existing: ${existingTags.join(', ')}` : 'e.g., bug-fix, feature, refactor'
                    });

                    if (tagInput) {
                        await historyManager.addTag(selected.id, tagInput);
                        vscode.window.showInformationMessage(`Tag "${tagInput}" added`);
                    }
                }
            }),

            vscode.commands.registerCommand('draagon.filterByTag', async () => {
                const tags = historyManager.getAllTags();
                if (tags.length === 0) {
                    vscode.window.showInformationMessage('No tags yet. Use "Tag Conversation" to add tags.');
                    return;
                }

                const selected = await vscode.window.showQuickPick(tags, {
                    placeHolder: 'Select tag to filter by'
                });

                if (selected) {
                    const conversations = historyManager.getConversationsByTag(selected);
                    const items = conversations.map(c => ({
                        label: c.firstUserMessage.substring(0, 50) || c.id,
                        description: `${c.messageCount} messages`,
                        id: c.id
                    }));

                    const conv = await vscode.window.showQuickPick(items, {
                        placeHolder: `${conversations.length} conversations with tag "${selected}"`
                    });

                    if (conv) {
                        const markdown = await historyManager.exportAsMarkdown(conv.id);
                        if (markdown) {
                            const doc = await vscode.workspace.openTextDocument({
                                content: markdown,
                                language: 'markdown'
                            });
                            await vscode.window.showTextDocument(doc);
                        }
                    }
                }
            }),

            // Account view commands
            vscode.commands.registerCommand('draagon.refreshAccount', () => {
                accountProvider.refresh();
            }),

            vscode.commands.registerCommand('draagon.authenticateClaude', async () => {
                const terminal = vscode.window.createTerminal('Claude Login');
                terminal.show();
                terminal.sendText('claude login');

                // Wait a bit then refresh account info
                setTimeout(() => {
                    accountProvider.refresh();
                }, 5000);
            }),

            vscode.commands.registerCommand('draagon.switchAccount', async () => {
                const accountInfo = accountProvider.getAccountInfo();
                const options = [
                    { label: '$(sign-out) Logout & Re-authenticate', action: 'logout' },
                    { label: '$(key) Use API Key', action: 'apikey' }
                ];

                if (accountInfo.authType === 'api_key') {
                    options.push({ label: '$(sign-in) Switch to OAuth', action: 'oauth' });
                }

                const selected = await vscode.window.showQuickPick(options, {
                    placeHolder: 'Switch account method'
                });

                if (selected?.action === 'logout') {
                    const terminal = vscode.window.createTerminal('Claude Login');
                    terminal.show();
                    terminal.sendText('claude logout && claude login');
                    setTimeout(() => accountProvider.refresh(), 5000);
                } else if (selected?.action === 'apikey') {
                    const apiKey = await vscode.window.showInputBox({
                        prompt: 'Enter your Anthropic API Key',
                        password: true,
                        placeHolder: 'sk-ant-...'
                    });
                    if (apiKey) {
                        // Store in VS Code secrets
                        await context.secrets.store('anthropic-api-key', apiKey);
                        vscode.window.showInformationMessage('API Key saved. Restart to apply.');
                        accountProvider.refresh();
                    }
                } else if (selected?.action === 'oauth') {
                    // Clear stored API key
                    await context.secrets.delete('anthropic-api-key');
                    const terminal = vscode.window.createTerminal('Claude Login');
                    terminal.show();
                    terminal.sendText('claude login');
                    setTimeout(() => accountProvider.refresh(), 5000);
                }
            })
        );

        // Wire up cross-module communication
        chatProvider.setUsageTracker(usageTracker);
        chatProvider.setSessionManager(sessionManager);
        chatProvider.setThinkingDisplay(thinkingDisplay);
        agentsProvider.setOrchestrator(orchestrator);
        agentsProvider.setPrReviewToolkit(prReviewToolkit);

        // Wire up REQ-001 through REQ-007 modules to chat provider
        chatProvider.setPermissionManager(permissionManager);
        chatProvider.setImageHandler(imageHandler);
        chatProvider.setTokenTracker(tokenTracker);
        chatProvider.setHistoryManager(historyManager);
        chatProvider.setWslSupport(wslSupport);
        chatProvider.setThinkingModeManager(thinkingModeManager);

        // Listen for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('draagon')) {
                    chatProvider.onConfigurationChanged();
                }
            })
        );

        console.log('Draagon AI extension activated successfully!');
    } catch (error) {
        console.error('Draagon AI extension failed to activate:', error);
        vscode.window.showErrorMessage(`Draagon AI activation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function deactivate() {
    console.log('Draagon AI extension deactivated');
}
