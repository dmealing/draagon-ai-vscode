import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Session Manager Tests', () => {
    const extensionId = 'draagon.draagon-ai';

    suiteSetup(async () => {
        // Ensure extension is activated
        const ext = vscode.extensions.getExtension(extensionId);
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    test('Session manager should be initialized on extension activation', async () => {
        const ext = vscode.extensions.getExtension(extensionId);
        assert.ok(ext?.isActive, 'Extension should be active');
    });

    test('resumeSession command should be available', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('draagon.resumeSession'), 'resumeSession command should exist');
    });

    test('renameSession command should be available', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('draagon.renameSession'), 'renameSession command should exist');
    });

    test('newSession command should be available', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('draagon.newSession'), 'newSession command should exist');
    });
});
