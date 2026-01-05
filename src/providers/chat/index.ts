/**
 * Chat provider modules - decomposed from ChatViewProvider
 *
 * This module exports focused components that handle specific aspects
 * of the chat functionality:
 *
 * - ChatStateManager: Manages session state, images, and module references
 * - ClaudeMessageHandler: Handles Claude message processing and tool use
 * - ChatWebviewManager: Manages webview lifecycle (view and panel)
 */

export { ChatStateManager } from './stateManager';
export { ClaudeMessageHandler, type MessagePoster, type ClaudeMessageHandlerDeps } from './messageHandler';
export { ChatWebviewManager, type WebviewMessageHandler } from './webviewManager';
