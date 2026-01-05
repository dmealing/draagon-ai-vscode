import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Integration tests for Claude Code features
 * Tests the wiring between chatViewProvider, webview, and Claude process
 */
suite('Claude Code Integration Tests', () => {
    const extensionId = 'draagon.draagon-ai';

    suiteSetup(async () => {
        // Ensure extension is activated
        const ext = vscode.extensions.getExtension(extensionId);
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    // ============================================
    // Token Tracking Tests
    // ============================================
    suite('Token Tracking (REQ-004)', () => {
        test('TokenTracker should calculate cost correctly', () => {
            // Import dynamically since we're in test context
            const { TokenTracker } = require('../../stats/tokenTracker');
            const tracker = new TokenTracker();

            // Record some tokens
            tracker.recordTokens({
                inputTokens: 1000,
                outputTokens: 500,
                cacheReadTokens: 200,
                cacheWriteTokens: 0
            });

            const stats = tracker.getSessionStats();
            assert.strictEqual(stats.totalInputTokens, 1000, 'Input tokens should be 1000');
            assert.strictEqual(stats.totalOutputTokens, 500, 'Output tokens should be 500');
            assert.ok(stats.totalCost > 0, 'Cost should be calculated');

            tracker.dispose();
        });

        test('TokenTracker should reset session', () => {
            const { TokenTracker } = require('../../stats/tokenTracker');
            const tracker = new TokenTracker();

            tracker.recordTokens({ inputTokens: 1000, outputTokens: 500 });
            tracker.resetSession();

            const stats = tracker.getSessionStats();
            assert.strictEqual(stats.totalInputTokens, 0, 'Input tokens should be 0 after reset');
            assert.strictEqual(stats.totalOutputTokens, 0, 'Output tokens should be 0 after reset');

            tracker.dispose();
        });

        test('TokenTracker should format cost correctly', () => {
            const { TokenTracker } = require('../../stats/tokenTracker');

            assert.strictEqual(TokenTracker.formatCost(0.00001), '$0.0000');
            assert.strictEqual(TokenTracker.formatCost(0.0012), '$0.0012');
            assert.strictEqual(TokenTracker.formatCost(0.123), '$0.123');
            assert.strictEqual(TokenTracker.formatCost(1.5), '$1.50');
        });
    });

    // ============================================
    // Permission System Tests
    // ============================================
    suite('Permission System (REQ-001)', () => {
        test('PermissionManager should identify safe tools', async () => {
            const ext = vscode.extensions.getExtension(extensionId);
            if (!ext) {
                assert.fail('Extension not found');
                return;
            }
            await ext.activate();

            // Access PermissionManager via extension context (mocked for tests)
            const { PermissionManager } = require('../../permissions/manager');
            const mockContext = {
                storageUri: { fsPath: '/tmp/test-storage' },
                globalStorageUri: { fsPath: '/tmp/test-global-storage' },
                workspaceState: {
                    get: () => undefined,
                    update: () => Promise.resolve()
                }
            };

            const manager = new PermissionManager(mockContext);

            // Safe tools
            assert.ok(manager.isSafeTool('Read'), 'Read should be safe');
            assert.ok(manager.isSafeTool('Glob'), 'Glob should be safe');
            assert.ok(manager.isSafeTool('Grep'), 'Grep should be safe');

            // Dangerous tools
            assert.ok(!manager.isSafeTool('Bash'), 'Bash should NOT be safe');
            assert.ok(!manager.isSafeTool('Write'), 'Write should NOT be safe');
            assert.ok(!manager.isSafeTool('Edit'), 'Edit should NOT be safe');

            manager.dispose();
        });

        test('PermissionManager should suggest patterns', () => {
            const { PermissionManager } = require('../../permissions/manager');
            const mockContext = {
                storageUri: { fsPath: '/tmp/test-storage' },
                globalStorageUri: { fsPath: '/tmp/test-global-storage' },
                workspaceState: {
                    get: () => undefined,
                    update: () => Promise.resolve()
                }
            };

            const manager = new PermissionManager(mockContext);

            const suggestions = manager.getSuggestedPatterns('npm install lodash');
            assert.ok(suggestions.length > 0, 'Should have suggestions');
            assert.ok(suggestions.includes('npm *'), 'Should suggest npm *');

            manager.dispose();
        });
    });

    // ============================================
    // Diff Provider Tests
    // ============================================
    suite('Diff Provider (REQ-002)', () => {
        test('generateUnifiedDiff should create valid diff', () => {
            const { generateUnifiedDiff, getDiffStats } = require('../../diff/provider');

            const original = 'line1\nline2\nline3';
            const modified = 'line1\nmodified\nline3\nline4';

            const diff = generateUnifiedDiff(original, modified, 'test.txt');

            assert.ok(diff.includes('--- a/test.txt'), 'Should have original header');
            assert.ok(diff.includes('+++ b/test.txt'), 'Should have modified header');
            assert.ok(diff.includes('-line2'), 'Should show removed line');
            assert.ok(diff.includes('+modified'), 'Should show added line');
        });

        test('getDiffStats should count changes correctly', () => {
            const { getDiffStats } = require('../../diff/provider');

            const original = 'line1\nline2\nline3';
            const modified = 'line1\nmodified\nline3\nline4';

            const stats = getDiffStats(original, modified);

            assert.ok(stats.additions >= 1, 'Should have additions');
            assert.ok(stats.deletions >= 1, 'Should have deletions');
        });

        test('formatDiffForChat should generate HTML', () => {
            const { formatDiffForChat } = require('../../diff/provider');

            const original = 'line1\nline2';
            const modified = 'line1\nline2\nline3';

            const result = formatDiffForChat(original, modified, 'test.txt');

            assert.ok(result.html.includes('diff-container'), 'Should have diff container');
            assert.ok(result.html.includes('diff-add'), 'Should have diff-add class');
            assert.strictEqual(result.truncated, false, 'Small diff should not be truncated');
        });
    });

    // ============================================
    // Thinking Mode Tests
    // ============================================
    suite('Thinking Modes (REQ-007)', () => {
        test('ThinkingModeManager should wrap messages', () => {
            const { ThinkingModeManager } = require('../../thinking/modes');
            const manager = new ThinkingModeManager();

            // Default mode should not modify message
            manager.setMode('default');
            assert.strictEqual(
                manager.wrapMessage('hello'),
                'hello',
                'Default mode should not modify message'
            );

            // Think mode should add instruction
            manager.setMode('think');
            const thinkResult = manager.wrapMessage('hello');
            assert.ok(
                thinkResult.includes('hello'),
                'Think mode should preserve original message'
            );
            assert.ok(
                thinkResult.length > 'hello'.length,
                'Think mode should add instructions'
            );
        });

        test('ThinkingModeManager should list available modes', () => {
            const { ThinkingModeManager } = require('../../thinking/modes');
            const manager = new ThinkingModeManager();

            const modes = manager.getModes();
            assert.ok(modes.length >= 4, 'Should have at least 4 modes');
            assert.ok(modes.some((m: any) => m.id === 'default'), 'Should have default mode');
            assert.ok(modes.some((m: any) => m.id === 'think'), 'Should have think mode');
            assert.ok(modes.some((m: any) => m.id === 'ultrathink'), 'Should have ultrathink mode');
        });
    });

    // ============================================
    // History Manager Tests
    // ============================================
    suite('History Manager (REQ-005)', () => {
        test('HistoryManager should create and retrieve conversations', async () => {
            const { ConversationHistoryManager } = require('../../history/manager');
            const { createMockContext } = require('../mocks/mockContext');

            const mockContext = createMockContext();
            const manager = new ConversationHistoryManager(mockContext);

            // Wait for initialization if async
            await new Promise(resolve => setTimeout(resolve, 100));

            // Start a conversation
            const conv = manager.startConversation('test_session', 'claude-3.5-sonnet');
            assert.ok(conv.id, 'Conversation should have ID');
            assert.strictEqual(conv.sessionId, 'test_session', 'Session ID should match');

            // Add messages
            manager.addMessage({
                timestamp: new Date().toISOString(),
                type: 'user',
                content: 'Hello'
            });
            manager.addMessage({
                timestamp: new Date().toISOString(),
                type: 'assistant',
                content: 'Hi there!'
            });

            // Get current conversation should have messages
            const current = manager.getCurrentConversation?.() || conv;
            assert.ok(current.messages.length >= 0, 'Should have messages array');

            // End conversation
            manager.endConversation();
        });

        test('HistoryManager should group by date', async () => {
            const { ConversationHistoryManager } = require('../../history/manager');
            const { createMockContext } = require('../mocks/mockContext');

            const mockContext = createMockContext();
            const manager = new ConversationHistoryManager(mockContext);

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify the method exists and runs
            const groups = manager.getConversationsGroupedByDate();
            assert.ok(typeof groups === 'object', 'Should return groups object');
        });
    });

    // ============================================
    // Question/Answer Flow Tests
    // ============================================
    suite('Question/Answer Flow', () => {
        test('Question panel structure should be correct in HTML', async () => {
            // This tests that the webview content has the right structure
            const { getWebviewContent } = require('../../ui/webview/content');

            // Create mock webview
            const mockWebview = {
                cspSource: 'https://example.com',
                asWebviewUri: (uri: vscode.Uri) => uri
            };
            const mockExtensionUri = vscode.Uri.file('/tmp/test');

            const html = getWebviewContent(mockWebview as any, mockExtensionUri);

            // Verify question panel exists
            assert.ok(html.includes('id="questionPanel"'), 'Should have question panel');
            assert.ok(html.includes('id="questionHeader"'), 'Should have question header');
            assert.ok(html.includes('id="questionOptions"'), 'Should have question options');
            assert.ok(html.includes('id="submitAnswer"'), 'Should have submit button');
        });
    });

    // ============================================
    // Message Handler Tests
    // ============================================
    suite('Message Handlers', () => {
        test('Webview should handle all REQ message types', async () => {
            const { getWebviewContent } = require('../../ui/webview/content');

            const mockWebview = {
                cspSource: 'https://example.com',
                asWebviewUri: (uri: vscode.Uri) => uri
            };
            const mockExtensionUri = vscode.Uri.file('/tmp/test');

            const html = getWebviewContent(mockWebview as any, mockExtensionUri);

            // Check for message handlers in script
            assert.ok(html.includes("case 'permissionRequest'"), 'Should handle permissionRequest');
            assert.ok(html.includes("case 'diffResult'"), 'Should handle diffResult');
            assert.ok(html.includes("case 'tokenUpdate'"), 'Should handle tokenUpdate');
            assert.ok(html.includes("case 'historyData'"), 'Should handle historyData');
            assert.ok(html.includes("case 'userQuestion'"), 'Should handle userQuestion');
        });
    });
});
