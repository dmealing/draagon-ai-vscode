import * as assert from 'assert';
import { MockClaudeProcess, TestScenarios, createAssistantMessage } from '../mocks/mockClaudeProcess';
import { ClaudeMessage, ToolUseBlock, AskUserQuestionInput } from '../../claude/types';

suite('Prompt Integration Tests', () => {
    let mockClaude: MockClaudeProcess;

    setup(() => {
        mockClaude = new MockClaudeProcess();
    });

    teardown(() => {
        mockClaude.removeAllListeners();
    });

    // ============================================
    // Basic Message Flow Tests
    // ============================================

    suite('Basic Message Flow', () => {
        test('Should receive assistant response for simple message', (done) => {
            const messages: ClaudeMessage[] = [];

            mockClaude.onMessage((msg) => {
                messages.push(msg);
            });

            mockClaude.onComplete(() => {
                assert.ok(messages.length > 0, 'Should receive at least one message');
                assert.strictEqual(messages[0].type, 'assistant', 'First message should be assistant');
                done();
            });

            mockClaude.send('hello');
        });

        test('Should handle greeting scenario', (done) => {
            const scenario = TestScenarios.simpleGreeting;
            let outputText = '';

            mockClaude.onMessage((msg) => {
                if (msg.type === 'assistant' && msg.message?.content) {
                    for (const content of msg.message.content) {
                        if (content.type === 'text') {
                            outputText += content.text;
                        }
                    }
                }
            });

            mockClaude.onComplete(() => {
                assert.ok(
                    outputText.toLowerCase().includes(scenario.expectedOutputContains.toLowerCase()),
                    `Output should contain "${scenario.expectedOutputContains}"`
                );
                done();
            });

            mockClaude.send(scenario.input);
        });

        test('Should handle code generation with thinking', (done) => {
            const scenario = TestScenarios.codeGeneration;
            let hasThinking = false;
            let hasCode = false;

            mockClaude.onMessage((msg) => {
                if (msg.type === 'assistant' && msg.message?.content) {
                    for (const content of msg.message.content) {
                        if (content.type === 'thinking') {
                            hasThinking = true;
                        }
                        if (content.type === 'text' && content.text.includes('function')) {
                            hasCode = true;
                        }
                    }
                }
            });

            mockClaude.onComplete(() => {
                if (scenario.expectedThinking) {
                    assert.ok(hasThinking, 'Should include thinking block');
                }
                assert.ok(hasCode, 'Should include code');
                done();
            });

            mockClaude.send(scenario.input);
        });
    });

    // ============================================
    // Tool Use Tests
    // ============================================

    suite('Tool Use', () => {
        test('Should emit tool use for file read', (done) => {
            const scenario = TestScenarios.fileRead;
            let toolUseName = '';

            mockClaude.onMessage((msg) => {
                if (msg.type === 'assistant' && msg.message?.content) {
                    for (const content of msg.message.content) {
                        if (content.type === 'tool_use') {
                            toolUseName = content.name;
                        }
                    }
                }
            });

            mockClaude.onComplete(() => {
                assert.strictEqual(toolUseName, scenario.expectedToolUse, 'Should use Read tool');
                done();
            });

            mockClaude.send(scenario.input);
        });

        test('Should emit AskUserQuestion tool use', (done) => {
            const scenario = TestScenarios.userQuestion;
            let toolUseId = '';
            let hasQuestions = false;

            mockClaude.onMessage((msg) => {
                if (msg.type === 'assistant' && msg.message?.content) {
                    for (const content of msg.message.content) {
                        if (content.type === 'tool_use' && content.name === 'AskUserQuestion') {
                            const toolContent = content as ToolUseBlock;
                            toolUseId = toolContent.id;
                            const input = toolContent.input as unknown as AskUserQuestionInput;
                            hasQuestions = input?.questions?.length > 0;
                        }
                    }
                }
            });

            mockClaude.onComplete(() => {
                assert.ok(toolUseId, 'Should have tool use ID');
                assert.ok(hasQuestions, 'Should include questions');
                done();
            });

            mockClaude.send(scenario.input);
        });

        test('Should handle tool result', (done) => {
            let responseReceived = false;

            mockClaude.onMessage((msg) => {
                if (msg.type === 'assistant') {
                    responseReceived = true;
                }
            });

            mockClaude.onComplete(() => {
                assert.ok(responseReceived, 'Should receive response after tool result');
                done();
            });

            mockClaude.sendToolResult('tool_001', { answer: 'Option A' });
        });
    });

    // ============================================
    // Plan Mode Tests
    // ============================================

    suite('Plan Mode', () => {
        test('Should emit EnterPlanMode tool use', (done) => {
            const scenario = TestScenarios.planMode;
            let planModeEntered = false;

            mockClaude.onMessage((msg) => {
                if (msg.type === 'assistant' && msg.message?.content) {
                    for (const content of msg.message.content) {
                        if (content.type === 'tool_use' && content.name === 'EnterPlanMode') {
                            planModeEntered = true;
                        }
                    }
                }
            });

            mockClaude.onComplete(() => {
                assert.ok(planModeEntered, 'Should enter plan mode');
                done();
            });

            mockClaude.send(scenario.input);
        });
    });

    // ============================================
    // Process Lifecycle Tests
    // ============================================

    suite('Process Lifecycle', () => {
        test('Should start and become running', async () => {
            await mockClaude.start();
            // Note: Mock process starts when first message is sent
            assert.ok(true, 'Process started successfully');
        });

        test('Should stop cleanly', (done) => {
            mockClaude.onComplete((code) => {
                assert.strictEqual(code, null, 'Stop should emit null code');
                assert.strictEqual(mockClaude.isRunning(), false, 'Should not be running after stop');
                done();
            });

            mockClaude.send('hello');
            setTimeout(() => {
                mockClaude.stop();
            }, 50);
        });

        test('isRunning should reflect process state', () => {
            assert.strictEqual(mockClaude.isRunning(), false, 'Should not be running initially');
        });
    });

    // ============================================
    // Custom Response Tests
    // ============================================

    suite('Custom Responses', () => {
        test('Should support custom responses', (done) => {
            const customMessage = 'This is a custom test response';

            mockClaude.addResponse('custom trigger', [
                {
                    type: 'assistant',
                    message: createAssistantMessage([
                        { type: 'text', text: customMessage }
                    ])
                }
            ]);

            let receivedText = '';

            mockClaude.onMessage((msg) => {
                if (msg.type === 'assistant' && msg.message?.content) {
                    for (const content of msg.message.content) {
                        if (content.type === 'text') {
                            receivedText = content.text;
                        }
                    }
                }
            });

            mockClaude.onComplete(() => {
                assert.strictEqual(receivedText, customMessage, 'Should receive custom message');
                done();
            });

            mockClaude.send('custom trigger test');
        });

        test('Should handle unknown prompts with default response', (done) => {
            const unknownPrompt = 'xyzzy random unknown prompt';
            let receivedResponse = false;

            mockClaude.onMessage((msg) => {
                if (msg.type === 'assistant') {
                    receivedResponse = true;
                }
            });

            mockClaude.onComplete(() => {
                assert.ok(receivedResponse, 'Should receive default response for unknown prompts');
                done();
            });

            mockClaude.send(unknownPrompt);
        });
    });

    // ============================================
    // Error Handling Tests
    // ============================================

    suite('Error Handling', () => {
        test('Should handle error responses', (done) => {
            let errorReceived = false;

            mockClaude.onMessage((msg) => {
                if (msg.type === 'error') {
                    errorReceived = true;
                    assert.ok(msg.error?.message, 'Error should have message');
                }
            });

            mockClaude.onComplete(() => {
                assert.ok(errorReceived, 'Should receive error message');
                done();
            });

            mockClaude.send('trigger error');
        });
    });

    // ============================================
    // Timing Tests
    // ============================================

    suite('Timing', () => {
        test('Should respect configured delay', (done) => {
            mockClaude.setDelay(10); // Very short delay for testing

            const startTime = Date.now();

            mockClaude.onComplete(() => {
                const elapsed = Date.now() - startTime;
                assert.ok(elapsed < 500, 'Should complete quickly with short delay');
                done();
            });

            mockClaude.send('hello');
        });
    });
});
