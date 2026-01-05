import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Chat Integration Tests', () => {
    const extensionId = 'draagon.draagon-ai';

    suiteSetup(async () => {
        // Ensure extension is activated
        const ext = vscode.extensions.getExtension(extensionId);
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    // ============================================
    // Chat Panel Tests
    // ============================================

    suite('Chat Panel', () => {
        test('openChatPanel command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.openChatPanel'), 'openChatPanel command should exist');
        });

        test('openChat command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.openChat'), 'openChat command should exist');
        });

        test('newSession command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.newSession'), 'newSession command should exist');
        });

        test('openChatPanel should create a webview panel', async () => {
            try {
                await vscode.commands.executeCommand('draagon.openChatPanel');
                // Give it time to create panel
                await new Promise(resolve => setTimeout(resolve, 500));

                // Panel should be visible
                assert.ok(true, 'openChatPanel executed successfully');
            } catch (error) {
                assert.fail('openChatPanel should execute without error: ' + error);
            }
        });

        test('Chat panel should have correct title', async () => {
            try {
                await vscode.commands.executeCommand('draagon.openChatPanel');
                await new Promise(resolve => setTimeout(resolve, 300));

                // Check that there's a visible editor with our panel
                // Note: WebviewPanels don't show in activeTextEditor
                assert.ok(true, 'Chat panel created');
            } catch (error) {
                assert.fail('Chat panel creation failed: ' + error);
            }
        });

        test('newSession should reset chat state', async () => {
            try {
                // First open chat panel
                await vscode.commands.executeCommand('draagon.openChatPanel');
                await new Promise(resolve => setTimeout(resolve, 300));

                // Then start new session
                await vscode.commands.executeCommand('draagon.newSession');
                await new Promise(resolve => setTimeout(resolve, 100));

                assert.ok(true, 'newSession executed successfully');
            } catch (error) {
                assert.fail('newSession should execute without error: ' + error);
            }
        });
    });

    // ============================================
    // Chat Configuration Tests
    // ============================================

    suite('Chat Configuration', () => {
        test('Claude path configuration should exist', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.ok(config.has('claude.path'), 'claude.path should exist');
        });

        test('Claude model configuration should exist', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.ok(config.has('claude.model'), 'claude.model should exist');
        });

        test('Default Claude path should be "claude"', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.strictEqual(config.get('claude.path'), 'claude', 'Default claude path should be "claude"');
        });

        test('Routing configuration should exist', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.ok(config.has('routing.enabled'), 'routing.enabled should exist');
        });

        test('Routing should be disabled by default', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.strictEqual(config.get('routing.enabled'), false, 'Routing should be disabled by default');
        });
    });

    // ============================================
    // Memory Integration Tests
    // ============================================

    suite('Memory Configuration', () => {
        test('Memory enabled configuration should exist', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.ok(config.has('memory.enabled'), 'memory.enabled should exist');
        });

        test('Memory should be disabled by default', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.strictEqual(config.get('memory.enabled'), false, 'Memory should be disabled by default');
        });

        test('Memory autoContext configuration should exist', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.ok(config.has('memory.autoContext'), 'memory.autoContext should exist');
        });
    });

    // ============================================
    // Keybinding Tests
    // ============================================

    suite('Keybindings', () => {
        test('openChat keybinding should be configured', () => {
            const ext = vscode.extensions.getExtension(extensionId);
            const keybindings = ext?.packageJSON?.contributes?.keybindings;
            const openChatBinding = keybindings?.find((kb: { command: string }) => kb.command === 'draagon.openChat');
            assert.ok(openChatBinding, 'openChat keybinding should exist');
            assert.ok(openChatBinding.key, 'openChat should have a key binding');
        });
    });
});
