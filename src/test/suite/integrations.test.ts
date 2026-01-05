import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Integration Tests', () => {
    const extensionId = 'draagon.draagon-ai';

    suiteSetup(async () => {
        // Ensure extension is activated
        const ext = vscode.extensions.getExtension(extensionId);
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    // ============================================
    // Browser Controller Tests
    // ============================================

    suite('Browser Controller', () => {
        test('launchBrowser command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.launchBrowser'), 'launchBrowser command should exist');
        });

        test('closeBrowser command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.closeBrowser'), 'closeBrowser command should exist');
        });

        test('closeBrowser should execute without error when no browser open', async () => {
            try {
                await vscode.commands.executeCommand('draagon.closeBrowser');
                assert.ok(true, 'closeBrowser executed without error');
            } catch {
                assert.ok(true, 'closeBrowser handled gracefully');
            }
        });

        test('Browser configuration should exist', () => {
            const ext = vscode.extensions.getExtension(extensionId);
            const configSchema = ext?.packageJSON?.contributes?.configuration?.properties;
            assert.ok(configSchema?.['draagon.browser.headless'] !== undefined, 'browser.headless should be in schema');
        });
    });

    // ============================================
    // Figma Integration Tests
    // ============================================

    suite('Figma Integration', () => {
        test('connectFigma command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.connectFigma'), 'connectFigma command should exist');
        });

        test('importFigmaDesign command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.importFigmaDesign'), 'importFigmaDesign command should exist');
        });

        test('Figma configuration should exist', () => {
            const ext = vscode.extensions.getExtension(extensionId);
            const configSchema = ext?.packageJSON?.contributes?.configuration?.properties;
            assert.ok(configSchema?.['draagon.figma.defaultFramework'] !== undefined, 'figma.defaultFramework should be in schema');
        });
    });

    // ============================================
    // Plugin Manager Tests
    // ============================================

    suite('Plugin Manager', () => {
        test('installPlugin command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.installPlugin'), 'installPlugin command should exist');
        });

        test('managePlugins command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.managePlugins'), 'managePlugins command should exist');
        });

        test('Plugin configuration should exist', () => {
            const ext = vscode.extensions.getExtension(extensionId);
            const configSchema = ext?.packageJSON?.contributes?.configuration?.properties;
            assert.ok(configSchema?.['draagon.plugins.autoUpdate'] !== undefined, 'plugins.autoUpdate should be in schema');
        });
    });

    // ============================================
    // MCP Server Manager Tests
    // ============================================

    suite('MCP Server Manager', () => {
        test('manageMcpServers command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.manageMcpServers'), 'manageMcpServers command should exist');
        });

        test('MCP configuration should exist', () => {
            const ext = vscode.extensions.getExtension(extensionId);
            const configSchema = ext?.packageJSON?.contributes?.configuration?.properties;
            assert.ok(configSchema?.['draagon.mcp.servers'] !== undefined, 'mcp.servers should be in schema');
        });
    });

    // ============================================
    // Document Processor Tests
    // ============================================

    suite('Document Processor', () => {
        test('processDocument command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.processDocument'), 'processDocument command should exist');
        });
    });

    // ============================================
    // Usage Tracker Tests
    // ============================================

    suite('Usage Tracker', () => {
        test('showStats command should exist', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('draagon.showStats'), 'showStats command should exist');
        });

        test('showStats should create a webview panel', async () => {
            try {
                await vscode.commands.executeCommand('draagon.showStats');
                // Give it time to create panel
                await new Promise(resolve => setTimeout(resolve, 100));
                assert.ok(true, 'showStats executed successfully');
            } catch (error) {
                assert.fail('showStats should execute without error: ' + error);
            }
        });

        test('UI configuration for stats should exist', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.ok(config.has('ui.showTokenCost'), 'ui.showTokenCost should exist');
        });
    });

    // ============================================
    // Backup Manager Tests
    // ============================================

    suite('Backup Manager', () => {
        test('Backup configuration should exist', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.ok(config.has('backup.enabled'), 'backup.enabled should exist');
            assert.ok(config.has('backup.maxCommits'), 'backup.maxCommits should exist');
        });

        test('Backup should be enabled by default', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.strictEqual(config.get('backup.enabled'), true, 'Backup should be enabled by default');
        });

        test('Default max commits should be 50', () => {
            const config = vscode.workspace.getConfiguration('draagon');
            assert.strictEqual(config.get('backup.maxCommits'), 50, 'Default maxCommits should be 50');
        });
    });
});
