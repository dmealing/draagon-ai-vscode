import { EventEmitter } from 'events';
import { ClaudeMessage, AssistantMessage, ContentBlock } from '../../claude/types';

/**
 * Helper to create a proper AssistantMessage
 */
function createAssistantMessage(content: ContentBlock[]): AssistantMessage {
    return {
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content,
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null
    };
}

/**
 * Mock Claude Process for testing
 * Simulates Claude CLI responses without requiring the actual CLI
 */
export class MockClaudeProcess extends EventEmitter {
    private _isRunning: boolean = false;
    private _responses: Map<string, ClaudeMessage[]> = new Map();
    private _defaultDelay: number = 100;

    constructor() {
        super();
        this._setupDefaultResponses();
    }

    private _setupDefaultResponses(): void {
        // Simple greeting response
        this._responses.set('hello', [
            {
                type: 'assistant',
                message: createAssistantMessage([
                    { type: 'text', text: 'Hello! How can I help you today?' }
                ])
            }
        ]);

        // Code generation response
        this._responses.set('write code', [
            {
                type: 'assistant',
                message: createAssistantMessage([
                    { type: 'thinking', thinking: 'Let me think about the best approach...' },
                    { type: 'text', text: 'Here is some sample code:\n```typescript\nfunction hello() {\n  console.log("Hello, World!");\n}\n```' }
                ])
            }
        ]);

        // Tool use response (file read)
        this._responses.set('read file', [
            {
                type: 'assistant',
                message: createAssistantMessage([
                    {
                        type: 'tool_use',
                        id: 'tool_001',
                        name: 'Read',
                        input: { file_path: '/test/example.ts' }
                    }
                ])
            }
        ]);

        // Question response
        this._responses.set('ask question', [
            {
                type: 'assistant',
                message: createAssistantMessage([
                    {
                        type: 'tool_use',
                        id: 'tool_002',
                        name: 'AskUserQuestion',
                        input: {
                            questions: [
                                {
                                    question: 'Which approach would you prefer?',
                                    header: 'Approach',
                                    options: [
                                        { label: 'Option A', description: 'First approach' },
                                        { label: 'Option B', description: 'Second approach' }
                                    ],
                                    multiSelect: false
                                }
                            ]
                        }
                    }
                ])
            }
        ]);

        // Plan mode response
        this._responses.set('plan mode', [
            {
                type: 'assistant',
                message: createAssistantMessage([
                    {
                        type: 'tool_use',
                        id: 'tool_003',
                        name: 'EnterPlanMode',
                        input: {}
                    }
                ])
            }
        ]);

        // Error response
        this._responses.set('error', [
            {
                type: 'error',
                error: {
                    message: 'Something went wrong',
                    code: 'TEST_ERROR'
                }
            }
        ]);
    }

    public async start(): Promise<void> {
        this._isRunning = true;
    }

    public send(prompt: string, _resumeSessionId?: string): void {
        if (!this._isRunning) {
            this._isRunning = true;
        }

        // Find matching response
        const lowerPrompt = prompt.toLowerCase();
        let responses: ClaudeMessage[] | undefined;

        for (const [key, value] of this._responses) {
            if (lowerPrompt.includes(key)) {
                responses = value;
                break;
            }
        }

        // Default response if no match
        if (!responses) {
            responses = [
                {
                    type: 'assistant',
                    message: createAssistantMessage([
                        { type: 'text', text: `I received your message: "${prompt}"` }
                    ])
                }
            ];
        }

        // Emit responses with delay to simulate streaming
        this._emitResponses(responses);
    }

    private async _emitResponses(responses: ClaudeMessage[]): Promise<void> {
        for (const response of responses) {
            await this._delay(this._defaultDelay);
            this.emit('message', response);
        }

        await this._delay(this._defaultDelay);
        this.emit('complete', 0);
        this._isRunning = false;
    }

    private _delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public sendToolResult(toolUseId: string, _result: Record<string, unknown>): void {
        // Simulate tool result processing
        setTimeout(() => {
            this.emit('message', {
                type: 'assistant',
                message: createAssistantMessage([
                    { type: 'text', text: `Tool result received for ${toolUseId}` }
                ])
            });
            this.emit('complete', 0);
        }, this._defaultDelay);
    }

    public stop(): void {
        this._isRunning = false;
        this.emit('complete', null);
    }

    public isRunning(): boolean {
        return this._isRunning;
    }

    // Test helpers

    public addResponse(trigger: string, messages: ClaudeMessage[]): void {
        this._responses.set(trigger.toLowerCase(), messages);
    }

    public clearResponses(): void {
        this._responses.clear();
        this._setupDefaultResponses();
    }

    public setDelay(ms: number): void {
        this._defaultDelay = ms;
    }

    public onMessage(handler: (message: ClaudeMessage) => void): void {
        this.on('message', handler);
    }

    public onError(handler: (error: Error) => void): void {
        this.on('error', handler);
    }

    public onComplete(handler: (code: number | null) => void): void {
        this.on('complete', handler);
    }
}

// Re-export helper for tests
export { createAssistantMessage };

/**
 * Factory function to create mock Claude process
 */
export function createMockClaudeProcess(): MockClaudeProcess {
    return new MockClaudeProcess();
}

/**
 * Test scenarios for integration testing
 */
export const TestScenarios = {
    simpleGreeting: {
        input: 'Hello!',
        expectedOutputContains: 'Hello',
        expectedMessageType: 'assistant'
    },
    codeGeneration: {
        input: 'Write code for a function',
        expectedOutputContains: 'function',
        expectedThinking: true
    },
    fileRead: {
        input: 'Read file example.ts',
        expectedToolUse: 'Read'
    },
    userQuestion: {
        input: 'Ask question about approach',
        expectedToolUse: 'AskUserQuestion'
    },
    planMode: {
        input: 'Enter plan mode to design',
        expectedToolUse: 'EnterPlanMode'
    }
};
