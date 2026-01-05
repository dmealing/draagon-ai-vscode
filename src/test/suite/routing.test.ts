import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Routing Tests', () => {
    const extensionId = 'draagon.draagon-ai';

    suiteSetup(async () => {
        // Ensure extension is activated
        const ext = vscode.extensions.getExtension(extensionId);
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    test('Routing configuration should exist', () => {
        const config = vscode.workspace.getConfiguration('draagon');
        assert.ok(config.has('routing.enabled'), 'routing.enabled should exist');
    });

    test('Routing should be disabled by default', () => {
        const config = vscode.workspace.getConfiguration('draagon');
        assert.strictEqual(config.get('routing.enabled'), false, 'Routing should be disabled by default');
    });

    test('Routing patterns configuration should exist', () => {
        const ext = vscode.extensions.getExtension(extensionId);
        const configSchema = ext?.packageJSON?.contributes?.configuration?.properties;
        assert.ok(configSchema?.['draagon.routing.enabled'], 'routing.enabled should be in schema');
    });
});
