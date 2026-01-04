import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Starting Draagon AI tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('draagon.draagon-ai'));
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('draagon.draagon-ai');
        if (ext) {
            await ext.activate();
            assert.strictEqual(ext.isActive, true);
        }
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);

        assert.ok(commands.includes('draagon.openChat'), 'openChat command should exist');
        assert.ok(commands.includes('draagon.newSession'), 'newSession command should exist');
        assert.ok(commands.includes('draagon.runCodeReview'), 'runCodeReview command should exist');
        assert.ok(commands.includes('draagon.runSecurityScan'), 'runSecurityScan command should exist');
    });

    test('Views should be registered', () => {
        // This verifies the package.json views are properly defined
        // The views are: draagon.chatView, draagon.agentsView, draagon.memoryView
        const ext = vscode.extensions.getExtension('draagon.draagon-ai');
        assert.ok(ext?.packageJSON?.contributes?.views?.draagon?.length === 3);
    });

    test('Configuration should have defaults', () => {
        const config = vscode.workspace.getConfiguration('draagon');

        assert.strictEqual(config.get('claude.path'), 'claude');
        assert.strictEqual(config.get('routing.enabled'), false);
        assert.strictEqual(config.get('memory.enabled'), false);
        assert.strictEqual(config.get('backup.enabled'), true);
        assert.strictEqual(config.get('backup.maxCommits'), 50);
    });
});
