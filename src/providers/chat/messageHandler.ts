import * as vscode from 'vscode';
import * as fs from 'fs';
import { ClaudeProcess } from '../../claude/process';
import type { PermissionManager } from '../../permissions/manager';
import type { TokenTracker } from '../../stats/tokenTracker';
import type { ConversationHistoryManager } from '../../history/manager';
import type { MemoryClient } from '../../memory/client';
import { formatDiffForChat, getDiffStats } from '../../diff/provider';
import type { ChatStateManager } from './stateManager';

export interface MessagePoster {
    postMessage(message: any): void;
}

export interface ClaudeMessageHandlerDeps {
    stateManager: ChatStateManager;
    messagePoster: MessagePoster;
    claudeProcess?: ClaudeProcess;
    memoryClient?: MemoryClient;
}

/**
 * Handles Claude message processing and tool use.
 * Extracted from ChatViewProvider to handle message-related concerns.
 */
export class ClaudeMessageHandler {
    constructor(private deps: ClaudeMessageHandlerDeps) {}

    /**
     * Handle incoming messages from Claude process
     */
    public handleClaudeMessage(message: any): void {
        const { stateManager, messagePoster } = this.deps;

        // Capture session_id from Claude's response for conversation continuity
        if (message.session_id && !stateManager.claudeSessionId) {
            stateManager.setClaudeSessionId(message.session_id);
            console.log('[MessageHandler] Captured Claude session_id:', message.session_id);
        }

        // REQ-004: Track token usage from streaming response
        const usage = message.usage || message.message?.usage;
        if (usage && stateManager.tokenTracker) {
            stateManager.tokenTracker.recordTokens({
                inputTokens: usage.input_tokens || 0,
                outputTokens: usage.output_tokens || 0,
                cacheReadTokens: usage.cache_read_input_tokens || 0,
                cacheWriteTokens: usage.cache_creation_input_tokens || 0
            });
            // Send token update to UI
            const stats = stateManager.tokenTracker.getSessionStats();
            messagePoster.postMessage({
                type: 'tokenUpdate',
                data: {
                    inputTokens: stats.totalInputTokens,
                    outputTokens: stats.totalOutputTokens,
                    cacheReadTokens: stats.totalCacheReadTokens,
                    cacheWriteTokens: stats.totalCacheWriteTokens,
                    estimatedCost: stats.totalCost
                }
            });
        }

        // Handle streaming content_block_start (new text/tool block beginning)
        if (message.type === 'content_block_start' && message.content_block) {
            const block = message.content_block;
            if (block.type === 'tool_use') {
                // Tool use starting - we'll get full tool info here
                this.handleToolUse(block);
            }
            // Text blocks will be filled in via content_block_delta
        }

        // Handle streaming content_block_delta (incremental text/thinking)
        if (message.type === 'content_block_delta' && message.delta) {
            const delta = message.delta;
            if (delta.type === 'text_delta' && delta.text) {
                messagePoster.postMessage({
                    type: 'output',
                    data: delta.text
                });
            } else if (delta.type === 'thinking_delta' && delta.thinking) {
                messagePoster.postMessage({
                    type: 'thinking',
                    data: delta.thinking
                });
            }
        }

        // Handle full assistant message (non-streaming or final)
        if (message.type === 'assistant' && message.message?.content) {
            let assistantText = '';
            for (const content of message.message.content) {
                if (content.type === 'text') {
                    assistantText += content.text;
                    messagePoster.postMessage({
                        type: 'output',
                        data: content.text
                    });
                } else if (content.type === 'thinking') {
                    messagePoster.postMessage({
                        type: 'thinking',
                        data: content.thinking
                    });
                } else if (content.type === 'tool_use') {
                    this.handleToolUse(content);
                } else if (content.type === 'tool_result') {
                    // Handle inline tool results (some tools return results in the content array)
                    this.handleInlineToolResult(content);
                }
            }
            // REQ-005: Store assistant message in history
            if (assistantText && stateManager.historyManager) {
                stateManager.historyManager.addMessage({
                    timestamp: new Date().toISOString(),
                    type: 'assistant',
                    content: assistantText
                });
            }
        }

        // REQ-002: Handle tool results for diff generation
        if (message.type === 'result' && message.tool_use_id) {
            this.handleToolResult(message);
        }
    }

    /**
     * Handle tool use events from Claude
     */
    public async handleToolUse(toolUse: any): Promise<void> {
        const { stateManager, messagePoster } = this.deps;

        // Handle AskUserQuestion specially
        if (toolUse.name === 'AskUserQuestion') {
            messagePoster.postMessage({
                type: 'userQuestion',
                data: {
                    toolUseId: toolUse.id,
                    questions: toolUse.input.questions
                }
            });
            return;
        }

        // Handle EnterPlanMode
        if (toolUse.name === 'EnterPlanMode') {
            messagePoster.postMessage({
                type: 'planModeChanged',
                data: { active: true }
            });
        }

        // Handle ExitPlanMode
        if (toolUse.name === 'ExitPlanMode') {
            messagePoster.postMessage({
                type: 'planModeChanged',
                data: { active: false }
            });
        }

        // Handle TodoWrite - update the todo panel in UI
        if (toolUse.name === 'TodoWrite' && toolUse.input?.todos) {
            messagePoster.postMessage({
                type: 'updateTodos',
                todos: toolUse.input.todos
            });
        }

        // Handle Task tool - track background agents
        if (toolUse.name === 'Task' && toolUse.input) {
            messagePoster.postMessage({
                type: 'agentStarted',
                data: {
                    id: toolUse.id,
                    description: toolUse.input.description || toolUse.input.prompt?.substring(0, 50) || 'Background task',
                    subagentType: toolUse.input.subagent_type || 'general-purpose'
                }
            });
        }

        // REQ-002: Capture file state BEFORE Edit/Write operations for diff
        if (['Edit', 'Write', 'MultiEdit'].includes(toolUse.name) && toolUse.input?.file_path) {
            const filePath = toolUse.input.file_path;
            try {
                if (fs.existsSync(filePath)) {
                    const contentBefore = fs.readFileSync(filePath, 'utf-8');
                    stateManager.setPendingDiff(toolUse.id, { filePath, contentBefore });
                } else {
                    // New file - empty before
                    stateManager.setPendingDiff(toolUse.id, { filePath, contentBefore: '' });
                }
            } catch (error) {
                console.error('Failed to capture file state:', error);
            }
        }

        // NOTE: Permission blocking is disabled for --print mode
        // In --print mode, Claude CLI executes tools automatically before we receive the message.
        // The tool has already been executed by the time we see this event.
        // Blocking here would hang the conversation since we can't actually prevent execution.
        //
        // To implement real permission control, we'd need to:
        // 1. Use interactive mode instead of --print
        // 2. Actually execute the tools ourselves
        // 3. Send tool_result back to Claude
        //
        // For now, we just log and display tool use without blocking.

        // Send tool use to UI
        messagePoster.postMessage({
            type: 'toolUse',
            data: {
                toolName: toolUse.name,
                toolInput: toolUse.input,
                toolUseId: toolUse.id
            }
        });

        // REQ-005: Log tool use in history
        if (stateManager.historyManager) {
            stateManager.historyManager.addMessage({
                timestamp: new Date().toISOString(),
                type: 'tool_use',
                content: `${toolUse.name}: ${JSON.stringify(toolUse.input).substring(0, 200)}`
            });
        }
    }

    /**
     * Handle inline tool results (tool_result in content array)
     */
    private handleInlineToolResult(toolResult: any): void {
        const { stateManager, messagePoster } = this.deps;
        const toolUseId = toolResult.tool_use_id;
        const content = toolResult.content;
        const isError = toolResult.is_error;

        // Check if this is a pending diff (Edit/Write result)
        const pendingDiff = stateManager.getPendingDiff(toolUseId);
        if (pendingDiff) {
            // Delegate to handleToolResult for diff generation
            this.handleToolResult({ tool_use_id: toolUseId, content });
            return;
        }

        // Display tool result in UI (for Bash, Read, Glob, Grep, etc.)
        if (content) {
            messagePoster.postMessage({
                type: 'toolResult',
                data: {
                    toolUseId,
                    content: typeof content === 'string' ? content : JSON.stringify(content),
                    isError: isError || false
                }
            });
        }
    }

    /**
     * Handle tool results for diff generation (REQ-002)
     */
    public handleToolResult(message: any): void {
        const { stateManager, messagePoster } = this.deps;
        const toolUseId = message.tool_use_id;
        const pendingDiff = stateManager.getPendingDiff(toolUseId);

        if (!pendingDiff) {
            return;
        }

        const { filePath, contentBefore } = pendingDiff;
        stateManager.deletePendingDiff(toolUseId);

        // Read the new content
        let contentAfter = '';
        try {
            if (fs.existsSync(filePath)) {
                contentAfter = fs.readFileSync(filePath, 'utf-8');
            }
        } catch (error) {
            console.error('Failed to read file after edit:', error);
            return;
        }

        // Skip if no changes
        if (contentBefore === contentAfter) {
            return;
        }

        // Generate diff for UI
        const diffResult = formatDiffForChat(contentBefore, contentAfter, filePath);
        const stats = getDiffStats(contentBefore, contentAfter);

        messagePoster.postMessage({
            type: 'diffResult',
            data: {
                filePath,
                diffHtml: diffResult.html,
                additions: stats.additions,
                deletions: stats.deletions,
                truncated: diffResult.truncated,
                toolUseId
            }
        });

        // REQ-005: Log diff in history
        if (stateManager.historyManager) {
            stateManager.historyManager.addMessage({
                timestamp: new Date().toISOString(),
                type: 'tool_result',
                content: `File changed: ${filePath} (+${stats.additions}/-${stats.deletions})`,
                metadata: { filePath, additions: stats.additions, deletions: stats.deletions }
            });
        }
    }

    /**
     * Handle question answer from user
     */
    public async handleQuestionAnswer(toolUseId: string, answers: Record<string, string | string[]>): Promise<void> {
        if (!this.deps.claudeProcess) {
            return;
        }
        this.deps.claudeProcess.sendToolResult(toolUseId, { answers });
    }

    /**
     * Handle Claude error
     */
    public handleClaudeError(error: Error): void {
        this.deps.messagePoster.postMessage({
            type: 'error',
            data: error.message
        });
    }

    /**
     * Handle Claude completion
     */
    public handleClaudeComplete(): void {
        const { stateManager, messagePoster } = this.deps;
        stateManager.setProcessing(false);
        messagePoster.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
        this.storeInteractionMemory();
    }

    /**
     * Store successful interaction in memory
     */
    private async storeInteractionMemory(): Promise<void> {
        if (this.deps.memoryClient) {
            // TODO: Analyze interaction and store relevant learnings
        }
    }

    /**
     * Format memory context for Claude
     */
    public formatMemoryContext(memories: any[]): string {
        return `<relevant_memories>
${memories.map(m => `- ${m.content}`).join('\n')}
</relevant_memories>

Consider the above memories when responding.`;
    }

    /**
     * Stop processing
     */
    public stopProcessing(): void {
        if (this.deps.claudeProcess) {
            this.deps.claudeProcess.stop();
        }
        this.deps.stateManager.setProcessing(false);
        this.deps.messagePoster.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
    }
}
