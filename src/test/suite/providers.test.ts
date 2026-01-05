import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Provider Tests', () => {
    const extensionId = 'draagon.draagon-ai';

    suiteSetup(async () => {
        // Ensure extension is activated
        const ext = vscode.extensions.getExtension(extensionId);
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    // ============================================
    // Chat View Provider Tests
    // ============================================

    suite('ChatViewProvider', () => {
        test('Chat panel command should exist', async () => {
            // Chat is provided via webview panel, not a sidebar view
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.openChatPanel'), 'openChatPanel command should exist for chat panel');
        });

        test('Account view should be registered as webview', () => {
            // Account view is the webview-based view in the sidebar
            const ext = vscode.extensions.getExtension(extensionId);
            const views = ext?.packageJSON?.contributes?.views?.draagon || [];
            const accountView = views.find((v: { id: string }) => v.id === 'draagon.accountView');
            assert.ok(accountView, 'Account view should be registered');
            assert.strictEqual(accountView?.type, 'webview', 'Account view should be webview type');
        });

        test('openChat command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.openChat'), 'openChat command should exist');
        });

        test('openChatPanel command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.openChatPanel'), 'openChatPanel command should exist');
        });
    });

    // ============================================
    // Agents View Provider Tests
    // ============================================

    suite('AgentsViewProvider', () => {
        test('Agents view should be registered', () => {
            const ext = vscode.extensions.getExtension(extensionId);
            const views = ext?.packageJSON?.contributes?.views?.draagon || [];
            const agentsView = views.find((v: { id: string }) => v.id === 'draagon.agentsView');
            assert.ok(agentsView, 'Agents view should be registered');
        });

        test('Agents view should have correct name', () => {
            const ext = vscode.extensions.getExtension(extensionId);
            const views = ext?.packageJSON?.contributes?.views?.draagon || [];
            const agentsView = views.find((v: { id: string }) => v.id === 'draagon.agentsView');
            assert.strictEqual(agentsView?.name, 'Agents', 'Agents view should have correct name');
        });

        test('runCodeReview command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.runCodeReview'), 'runCodeReview command should exist');
        });

        test('runSecurityScan command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.runSecurityScan'), 'runSecurityScan command should exist');
        });

        test('runPrReview command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.runPrReview'), 'runPrReview command should exist');
        });

        test('launchAgentSwarm command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.launchAgentSwarm'), 'launchAgentSwarm command should exist');
        });
    });

    // ============================================
    // Memory View Provider Tests
    // ============================================

    suite('MemoryViewProvider', () => {
        test('Memory view should be registered', () => {
            const ext = vscode.extensions.getExtension(extensionId);
            const views = ext?.packageJSON?.contributes?.views?.draagon || [];
            const memoryView = views.find((v: { id: string }) => v.id === 'draagon.memoryView');
            assert.ok(memoryView, 'Memory view should be registered');
        });

        test('Memory view should have correct name', () => {
            const ext = vscode.extensions.getExtension(extensionId);
            const views = ext?.packageJSON?.contributes?.views?.draagon || [];
            const memoryView = views.find((v: { id: string }) => v.id === 'draagon.memoryView');
            assert.strictEqual(memoryView?.name, 'Memory', 'Memory view should have correct name');
        });

        test('openMemoryBrowser command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.openMemoryBrowser'), 'openMemoryBrowser command should exist');
        });

        test('Memory configuration should exist', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.ok(config.has('memory.enabled'), 'memory.enabled should exist');
            assert.ok(config.has('memory.endpoint'), 'memory.endpoint should exist');
        });
    });
});
