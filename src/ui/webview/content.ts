import * as vscode from 'vscode';

export function getWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    version?: string
): string {
    const nonce = getNonce();
    const displayVersion = version || 'dev';

    // Get URI for the icon image
    const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'icon.png'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: https:;">
    <title>Draagon AI Chat</title>
    <style>
        ${getStyles()}
    </style>
</head>
<body>
    <div id="app">
        <header id="header">
            <div class="header-left">
                <img class="logo" src="${iconUri}" alt="Draagon AI">
                <span class="title">Draagon AI Code</span>
                <span class="version" id="version">v${displayVersion}</span>
                <span class="plan-mode-badge hidden" id="planModeBadge">📋 Plan Mode</span>
            </div>
            <div class="header-center">
                <span class="routing-indicator" id="routingIndicator">
                    <span class="indicator-dot"></span>
                    <span class="indicator-text">Ready</span>
                </span>
            </div>
            <div class="header-right">
                <button class="header-btn" id="historyBtn" title="Chat History (Ctrl+Shift+H)">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
                </button>
                <button class="header-btn" id="settingsBtn" title="Settings">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                </button>
                <button class="header-btn header-btn-primary" id="newChatBtn" title="New Chat (Ctrl+Shift+N)">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                </button>
            </div>
        </header>

        <div id="backgroundAgentsPanel" class="background-agents-panel hidden">
            <div class="agents-header">
                <span>🔄 Background Agents</span>
                <span class="agents-count" id="agentsCount">0</span>
            </div>
            <div class="agents-list" id="agentsList"></div>
        </div>

        <div id="todoPanel" class="todo-panel hidden">
            <div class="todo-header">
                <span>Tasks</span>
                <span class="todo-progress" id="todoProgress">0/0</span>
            </div>
            <div class="todo-list" id="todoList"></div>
        </div>

        <div id="messages" class="messages"></div>

        <div id="checkpointPanel" class="checkpoint-panel hidden">
            <div class="checkpoint-header">
                <span>🔄 Checkpoints</span>
                <div class="checkpoint-controls">
                    <span class="checkpoint-size" id="checkpointSize">0 KB</span>
                    <button class="btn-icon" id="closeCheckpoints" title="Close">✕</button>
                </div>
            </div>
            <div class="checkpoint-list" id="checkpointList"></div>
        </div>

        <div id="questionPanel" class="question-panel hidden">
            <div class="question-header" id="questionHeader"></div>
            <div class="question-options" id="questionOptions"></div>
            <div class="question-actions">
                <button class="btn btn-primary" id="submitAnswer">Submit</button>
            </div>
        </div>

        <footer id="footer">
            <div class="input-toolbar">
                <div class="toolbar-left">
                    <button class="toolbar-btn" id="modelSelectBtn" title="Select Model">
                        <span class="model-icon">🤖</span>
                        <span class="model-name" id="currentModel">Claude Sonnet</span>
                        <svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>
                    </button>
                    <button class="toolbar-btn" id="slashCmdBtn" title="Slash Commands">
                        <span>/</span>
                    </button>
                    <button class="toolbar-btn" id="filePickerBtn" title="Add File Context (@)">
                        <span>@</span>
                    </button>
                    <button class="toolbar-btn" id="imageBtn" title="Attach Image (Ctrl+Shift+I)">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                    </button>
                </div>
                <div class="toolbar-right">
                    <div class="permission-wrapper" style="position: relative;">
                        <button class="toolbar-btn permission-btn" id="permissionBtn" title="Permission Mode" data-mode="acceptEdits">
                            <span class="permission-icon" id="permissionBtnIcon">🛡️</span>
                            <span class="permission-label" id="permissionBtnLabel">Safe</span>
                        </button>
                        <div class="permission-dropdown" id="permissionDropdown">
                            <div class="permission-option" data-mode="acceptEdits">
                                <span class="option-icon">🛡️</span>
                                <div class="option-info">
                                    <div class="option-name">Safe Mode</div>
                                    <div class="option-desc">Auto-approve file edits only</div>
                                </div>
                            </div>
                            <div class="permission-option" data-mode="bypassPermissions">
                                <span class="option-icon">🚀</span>
                                <div class="option-info">
                                    <div class="option-name">YOLO Mode</div>
                                    <div class="option-desc">Bypass ALL permissions</div>
                                </div>
                            </div>
                            <div class="permission-option" data-mode="dontAsk">
                                <span class="option-icon">🔒</span>
                                <div class="option-info">
                                    <div class="option-name">Strict Mode</div>
                                    <div class="option-desc">Skip unapproved tools silently</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="toggle-group">
                        <button class="toggle-btn" id="planModeToggle" title="Plan First">
                            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                            <span>Plan</span>
                        </button>
                        <button class="toggle-btn" id="thinkingModeToggle" title="Thinking Mode">
                            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                            <span id="thinkingModeLabel">Think</span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="input-container">
                <div class="input-attachments hidden" id="inputAttachments"></div>
                <!-- @-Mentions autocomplete popup -->
                <div class="mention-popup" id="mentionPopup">
                    <div class="mention-header" id="mentionHeader">Files</div>
                    <div class="mention-list" id="mentionList"></div>
                </div>
                <textarea
                    id="input"
                    placeholder="Ask Draagon anything... (/ for commands, @ for files)"
                    rows="1"
                ></textarea>
                <button id="sendBtn" class="send-btn" title="Send message">
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                </button>
                <button id="stopBtn" class="stop-btn hidden" title="Stop (Escape)">
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
                    </svg>
                </button>
            </div>
            <div class="footer-info">
                <span class="memory-status" id="memoryStatus">Memory: Disconnected</span>
                <button class="checkpoint-btn" id="checkpointBtn" title="View checkpoints">
                    <span class="checkpoint-icon">⏱️</span>
                    <span class="checkpoint-count" id="checkpointCount">0</span>
                </button>
                <span class="token-usage" id="tokenUsage"></span>
                <button class="context-usage-btn" id="contextUsageBtn" title="Click to compact context">
                    <span class="context-bar">
                        <span class="context-bar-fill" id="contextBarFill"></span>
                    </span>
                    <span class="context-text" id="contextText">0%</span>
                </button>
                <span class="model-info" id="modelInfo"></span>
            </div>
        </footer>

        <!-- Model Selection Modal -->
        <div id="modelModal" class="modal hidden">
            <div class="modal-content modal-sm">
                <div class="modal-header">
                    <span>Select Model</span>
                    <button class="btn-icon modal-close" data-modal="modelModal">✕</button>
                </div>
                <div class="modal-body">
                    <div class="model-option" data-model="claude-sonnet-4">
                        <div class="model-option-icon">🟢</div>
                        <div class="model-option-content">
                            <div class="model-option-name">Claude Sonnet 4</div>
                            <div class="model-option-desc">Fast and capable for most tasks</div>
                        </div>
                    </div>
                    <div class="model-option" data-model="claude-opus-4">
                        <div class="model-option-icon">🟣</div>
                        <div class="model-option-content">
                            <div class="model-option-name">Claude Opus 4</div>
                            <div class="model-option-desc">Most powerful for complex reasoning</div>
                        </div>
                    </div>
                    <div class="model-option" data-model="claude-haiku-3.5">
                        <div class="model-option-icon">⚡</div>
                        <div class="model-option-content">
                            <div class="model-option-name">Claude Haiku 3.5</div>
                            <div class="model-option-desc">Fastest, best for simple tasks</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Slash Commands Modal -->
        <div id="slashModal" class="modal hidden">
            <div class="modal-content modal-sm">
                <div class="modal-header">
                    <span>Commands</span>
                    <button class="btn-icon modal-close" data-modal="slashModal">✕</button>
                </div>
                <div class="modal-body">
                    <div class="slash-list" id="slashList">
                        <div class="slash-loading">Loading commands...</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- File Picker Modal -->
        <div id="fileModal" class="modal hidden">
            <div class="modal-content">
                <div class="modal-header">
                    <span>Add File Context</span>
                    <button class="btn-icon modal-close" data-modal="fileModal">✕</button>
                </div>
                <div class="modal-body">
                    <input type="text" class="file-search" id="fileSearch" placeholder="Search files...">
                    <div class="file-list" id="fileList">
                        <div class="file-loading">Loading files...</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Settings Modal -->
        <div id="settingsModal" class="modal hidden">
            <div class="modal-content">
                <div class="modal-header">
                    <span>Settings</span>
                    <button class="btn-icon modal-close" data-modal="settingsModal">✕</button>
                </div>
                <div class="modal-body">
                    <div class="settings-section">
                        <div class="settings-section-title">Model</div>
                        <div class="settings-row">
                            <span>Default Model</span>
                            <select id="settingsModel" class="settings-select">
                                <option value="default">Default (Sonnet)</option>
                                <option value="sonnet">Claude Sonnet 4</option>
                                <option value="opus">Claude Opus 4</option>
                                <option value="haiku">Claude Haiku 3.5</option>
                            </select>
                        </div>
                    </div>
                    <div class="settings-section">
                        <div class="settings-section-title">Thinking</div>
                        <div class="settings-row">
                            <span>Default Mode</span>
                            <select id="settingsThinkingMode" class="settings-select">
                                <option value="default">Default</option>
                                <option value="think">Think</option>
                                <option value="thinkHard">Think Hard</option>
                                <option value="thinkHarder">Think Harder</option>
                                <option value="ultrathink">Ultrathink</option>
                            </select>
                        </div>
                        <div class="settings-row">
                            <span>Show chain-of-thought</span>
                            <input type="checkbox" id="settingsShowThinking" checked>
                        </div>
                    </div>
                    <div class="settings-section">
                        <div class="settings-section-title">Display</div>
                        <div class="settings-row">
                            <span>Show token usage</span>
                            <input type="checkbox" id="settingsShowTokens" checked>
                        </div>
                        <div class="settings-row">
                            <span>Show routing info</span>
                            <input type="checkbox" id="settingsShowRouting">
                        </div>
                    </div>
                    <div class="settings-actions">
                        <button class="btn btn-secondary" id="openVSCodeSettings">Open VS Code Settings</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- History Modal -->
        <div id="historyModal" class="modal hidden">
            <div class="modal-content modal-lg">
                <div class="modal-header">
                    <span>Chat History</span>
                    <button class="btn-icon modal-close" data-modal="historyModal">✕</button>
                </div>
                <div class="modal-body">
                    <input type="text" class="history-search" id="historySearch" placeholder="Search conversations...">
                    <div class="history-list" id="historyList">
                        <div class="history-loading">Loading history...</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Permission Dialog (REQ-001) -->
        <div id="permissionDialog" class="permission-dialog hidden">
            <div class="permission-header">
                <span class="permission-icon" id="permissionIcon">⚠️</span>
                <span class="permission-title" id="permissionTitle">Permission Required</span>
            </div>
            <div class="permission-tool" id="permissionTool"></div>

            <!-- Quick Allow Patterns Section -->
            <div class="permission-patterns" id="permissionPatterns">
                <div class="permission-section-label">Always allow:</div>
                <div class="permission-pattern-list" id="permissionPatternList"></div>
            </div>

            <!-- Main Action Buttons -->
            <div class="permission-actions-main">
                <button class="permission-action-btn allow-once" id="permissionAllowOnce">
                    <span class="action-icon">✓</span>
                    <span class="action-label">Allow Once</span>
                </button>
                <button class="permission-action-btn allow-always" id="permissionAllowAlways">
                    <span class="action-icon">✓✓</span>
                    <span class="action-label">Always Allow</span>
                    <span class="action-hint" id="alwaysAllowHint"></span>
                </button>
            </div>

            <!-- Secondary Actions -->
            <div class="permission-actions-secondary">
                <button class="permission-secondary-btn" id="permissionDeny">
                    <span>✕</span> Deny
                </button>
                <button class="permission-secondary-btn yolo-btn" id="permissionYolo">
                    <span>🚀</span> YOLO Mode
                </button>
            </div>

            <!-- YOLO Warning (hidden by default) -->
            <div class="yolo-warning hidden" id="yoloWarning">
                <div class="yolo-warning-header">⚠️ YOLO Mode</div>
                <div class="yolo-warning-text">This will auto-approve ALL tool executions. Only use in sandboxed environments!</div>
                <div class="yolo-warning-actions">
                    <button class="btn btn-secondary" id="yoloCancelBtn">Cancel</button>
                    <button class="btn btn-danger" id="yoloConfirmBtn">Enable YOLO</button>
                </div>
            </div>
        </div>

        <!-- Thinking Mode Selector -->
        <div id="thinkingModal" class="modal hidden">
            <div class="modal-content modal-sm">
                <div class="modal-header">
                    <span>Thinking Intensity</span>
                    <button class="btn-icon modal-close" data-modal="thinkingModal">✕</button>
                </div>
                <div class="modal-body">
                    <div class="thinking-option" data-mode="default">
                        <div class="thinking-icon">💬</div>
                        <div class="thinking-content">
                            <div class="thinking-name">Default</div>
                            <div class="thinking-desc">Standard responses</div>
                        </div>
                    </div>
                    <div class="thinking-option" data-mode="think">
                        <div class="thinking-icon">💭</div>
                        <div class="thinking-content">
                            <div class="thinking-name">Think</div>
                            <div class="thinking-desc">Show reasoning process</div>
                        </div>
                    </div>
                    <div class="thinking-option" data-mode="thinkHard">
                        <div class="thinking-icon">🧠</div>
                        <div class="thinking-content">
                            <div class="thinking-name">Think Hard</div>
                            <div class="thinking-desc">Deeper analysis (10K tokens)</div>
                        </div>
                    </div>
                    <div class="thinking-option" data-mode="thinkHarder">
                        <div class="thinking-icon">🔬</div>
                        <div class="thinking-content">
                            <div class="thinking-name">Think Harder</div>
                            <div class="thinking-desc">Extended reasoning (30K tokens)</div>
                        </div>
                    </div>
                    <div class="thinking-option" data-mode="ultrathink">
                        <div class="thinking-icon">🌟</div>
                        <div class="thinking-content">
                            <div class="thinking-name">Ultrathink</div>
                            <div class="thinking-desc">Maximum depth (100K+ tokens)</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        ${getScript()}
    </script>
</body>
</html>`;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function getStyles(): string {
    return `
        :root {
            --bg-primary: var(--vscode-editor-background);
            --bg-secondary: var(--vscode-sideBar-background);
            --text-primary: var(--vscode-editor-foreground);
            --text-secondary: var(--vscode-descriptionForeground);
            --accent: var(--vscode-textLink-foreground);
            --border: var(--vscode-panel-border);
            --input-bg: var(--vscode-input-background);
            --input-border: var(--vscode-input-border);
            --btn-bg: var(--vscode-button-background);
            --btn-fg: var(--vscode-button-foreground);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background: var(--bg-primary);
            color: var(--text-primary);
            height: 100vh;
            overflow: hidden;
        }

        #app {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        /* Header */
        #header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .header-center {
            display: flex;
            align-items: center;
        }

        .header-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: transparent;
            border: none;
            border-radius: 6px;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .header-btn:hover {
            background: var(--bg-primary);
            color: var(--text-primary);
        }

        .header-btn:active {
            transform: scale(0.95);
        }

        .header-btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 6px;
        }

        .header-btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
            color: var(--vscode-button-foreground);
        }

        .logo {
            width: 24px;
            height: 24px;
            border-radius: 4px;
        }

        .title {
            font-weight: 500;
        }

        .version {
            font-size: 11px;
            color: var(--text-secondary);
            background: var(--bg-primary);
            padding: 2px 6px;
            border-radius: 4px;
        }

        .header-right {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .routing-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--text-secondary);
        }

        .indicator-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #22c55e;
        }

        .indicator-dot.idle { background: #22c55e; }
        .indicator-dot.fast { background: #f59e0b; }
        .indicator-dot.standard { background: #3b82f6; }
        .indicator-dot.deep { background: #8b5cf6; }
        .indicator-dot.active { animation: pulse 1.5s infinite; }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        /* Todo Panel */
        .todo-panel {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            max-height: 200px;
            overflow-y: auto;
        }

        .todo-panel.hidden {
            display: none;
        }

        .todo-header {
            display: flex;
            justify-content: space-between;
            padding: 8px 12px;
            font-weight: 600;
            font-size: 12px;
            border-bottom: 1px solid var(--border);
        }

        .todo-list {
            padding: 8px 12px;
        }

        .todo-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
            font-size: 13px;
        }

        .todo-item.completed { color: var(--text-secondary); text-decoration: line-through; }
        .todo-item.in_progress { color: var(--accent); }

        /* Plan Mode Badge */
        .plan-mode-badge {
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            margin-left: 8px;
            animation: planPulse 2s infinite;
        }

        .plan-mode-badge.hidden {
            display: none;
        }

        @keyframes planPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        /* Background Agents Panel */
        .background-agents-panel {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 8px 12px;
        }

        .background-agents-panel.hidden {
            display: none;
        }

        .agents-header {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 6px;
        }

        .agents-count {
            background: var(--accent);
            color: white;
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 10px;
        }

        .agents-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .agent-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 8px;
            background: var(--bg-primary);
            border-radius: 4px;
            font-size: 12px;
        }

        .agent-item .agent-spinner {
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .agent-item.completed .agent-status { color: #22c55e; }
        .agent-item.failed .agent-status { color: #ef4444; }

        /* Checkpoint Panel */
        .checkpoint-panel {
            position: absolute;
            bottom: 100px;
            right: 12px;
            width: 320px;
            max-height: 400px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 100;
            overflow: hidden;
        }

        .checkpoint-panel.hidden {
            display: none;
        }

        .checkpoint-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            border-bottom: 1px solid var(--border);
            font-weight: 600;
            font-size: 13px;
        }

        .checkpoint-controls {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .checkpoint-size {
            font-size: 11px;
            color: var(--text-secondary);
        }

        .btn-icon {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 2px 6px;
            font-size: 14px;
        }

        .btn-icon:hover {
            color: var(--text-primary);
        }

        .checkpoint-list {
            max-height: 340px;
            overflow-y: auto;
            padding: 8px;
        }

        .checkpoint-item {
            display: flex;
            flex-direction: column;
            padding: 10px;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 6px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: border-color 0.2s;
        }

        .checkpoint-item:hover {
            border-color: var(--accent);
        }

        .checkpoint-item.pre-restore {
            border-left: 3px solid #f59e0b;
        }

        .checkpoint-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 6px;
        }

        .checkpoint-desc {
            font-size: 13px;
            font-weight: 500;
            flex: 1;
        }

        .checkpoint-time {
            font-size: 11px;
            color: var(--text-secondary);
            white-space: nowrap;
            margin-left: 8px;
        }

        .checkpoint-stats {
            display: flex;
            gap: 12px;
            font-size: 11px;
            color: var(--text-secondary);
        }

        .checkpoint-stat.additions { color: #22c55e; }
        .checkpoint-stat.deletions { color: #ef4444; }

        .checkpoint-actions {
            display: flex;
            gap: 6px;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--border);
        }

        .checkpoint-btn-restore {
            background: var(--btn-bg);
            color: var(--btn-fg);
            border: none;
            border-radius: 4px;
            padding: 4px 10px;
            font-size: 11px;
            cursor: pointer;
        }

        .checkpoint-btn-restore:hover {
            opacity: 0.9;
        }

        /* Footer checkpoint button */
        .checkpoint-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 2px 8px;
            cursor: pointer;
            font-size: 11px;
            color: var(--text-secondary);
        }

        .checkpoint-btn:hover {
            border-color: var(--accent);
            color: var(--text-primary);
        }

        .checkpoint-count {
            background: var(--accent);
            color: white;
            padding: 0 5px;
            border-radius: 8px;
            font-size: 10px;
            min-width: 16px;
            text-align: center;
        }

        /* Image Display */
        .message-image {
            max-width: 100%;
            border-radius: 6px;
            margin: 8px 0;
            cursor: pointer;
        }

        .message-image:hover {
            opacity: 0.9;
        }

        .image-caption {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 4px;
        }

        /* Messages */
        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }

        .message {
            margin-bottom: 6px;
            padding: 6px 10px;
            border-radius: 6px;
            max-width: 90%;
        }

        .message.user {
            background: var(--btn-bg);
            color: var(--btn-fg);
            margin-left: auto;
        }

        .message.assistant {
            background: var(--bg-secondary);
        }

        .message.tool {
            background: rgba(59, 130, 246, 0.1);
            border-left: 3px solid #3b82f6;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            padding: 4px 8px;
            margin-bottom: 2px;
        }

        .message.tool-container {
            padding: 0;
            margin-bottom: 2px;
            background: transparent;
        }

        .message.thinking {
            background: rgba(139, 92, 246, 0.1);
            border-left: 3px solid #8b5cf6;
            font-style: italic;
            font-size: 13px;
            padding: 4px 8px;
            margin-bottom: 4px;
        }

        .message.error {
            background: rgba(239, 68, 68, 0.1);
            border-left: 3px solid #ef4444;
            color: #ef4444;
            padding: 6px 10px;
        }

        .message.system {
            background: rgba(34, 197, 94, 0.1);
            border-left: 3px solid #22c55e;
            font-size: 12px;
            padding: 4px 8px;
            margin-bottom: 4px;
        }

        /* Loading/Thinking Indicator - Enhanced */
        .loading-indicator {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            margin: 8px 0;
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
            border: 1px solid rgba(59, 130, 246, 0.2);
            border-radius: 8px;
            color: var(--text-primary);
            font-size: 13px;
            animation: loadingFadeIn 0.3s ease;
        }

        @keyframes loadingFadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .loading-indicator .loading-icon {
            font-size: 18px;
            animation: loadingBounce 1s infinite;
        }

        @keyframes loadingBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-3px); }
        }

        .loading-indicator .loading-text {
            flex: 1;
        }

        .loading-indicator .loading-status {
            font-size: 11px;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .loading-dots {
            display: flex;
            gap: 4px;
        }

        .loading-dots span {
            width: 6px;
            height: 6px;
            background: var(--accent);
            border-radius: 50%;
            animation: loadingPulse 1.4s infinite ease-in-out both;
        }

        .loading-dots span:nth-child(1) { animation-delay: -0.32s; }
        .loading-dots span:nth-child(2) { animation-delay: -0.16s; }
        .loading-dots span:nth-child(3) { animation-delay: 0; }

        @keyframes loadingPulse {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
            40% { transform: scale(1); opacity: 1; }
        }

        /* Loading phases */
        .loading-indicator[data-phase="connecting"] .loading-icon::before { content: '🔌'; }
        .loading-indicator[data-phase="thinking"] .loading-icon::before { content: '🧠'; }
        .loading-indicator[data-phase="writing"] .loading-icon::before { content: '✍️'; }
        .loading-indicator[data-phase="tool"] .loading-icon::before { content: '🔧'; }

        /* REQ-012: Enhanced markdown rendering styles */
        .inline-code {
            background: var(--vscode-textCodeBlock-background, rgba(0, 0, 0, 0.2));
            padding: 2px 6px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
        }

        .code-block {
            margin: 6px 0;
            border-radius: 6px;
            overflow: hidden;
            background: var(--vscode-textCodeBlock-background, #1e1e1e);
            border: 1px solid var(--border);
        }

        .code-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 10px;
            background: rgba(0, 0, 0, 0.2);
            border-bottom: 1px solid var(--border);
        }

        .code-lang {
            font-size: 11px;
            color: var(--text-secondary);
            text-transform: uppercase;
            font-weight: 500;
        }

        .code-copy-btn {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--text-secondary);
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .code-copy-btn:hover {
            background: var(--bg-secondary);
            color: var(--text-primary);
        }

        .code-pre {
            margin: 0;
            padding: 8px 10px;
            overflow-x: auto;
        }

        .code-content {
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            line-height: 1.4;
            white-space: pre;
        }

        /* Syntax highlighting colors */
        .hl-keyword { color: #c586c0; }
        .hl-string { color: #ce9178; }
        .hl-number { color: #b5cea8; }
        .hl-comment { color: #6a9955; font-style: italic; }
        .hl-literal { color: #569cd6; }
        .hl-property { color: #9cdcfe; }
        .hl-variable { color: #9cdcfe; }
        .hl-decorator { color: #dcdcaa; }
        .hl-tag { color: #569cd6; }
        .hl-attr { color: #9cdcfe; }
        .hl-selector { color: #d7ba7d; }
        .hl-unit { color: #b5cea8; }
        .hl-color { color: #ce9178; }

        /* Markdown elements - tighter spacing for chat */
        .md-h1, .md-h2, .md-h3, .md-h4, .md-h5, .md-h6 {
            margin: 8px 0 4px 0;
            font-weight: 600;
            line-height: 1.25;
        }
        .md-h1 { font-size: 1.4em; border-bottom: 1px solid var(--border); padding-bottom: 2px; }
        .md-h2 { font-size: 1.25em; border-bottom: 1px solid var(--border); padding-bottom: 2px; }
        .md-h3 { font-size: 1.1em; }
        .md-h4 { font-size: 1.0em; }
        .md-h5 { font-size: 0.95em; }
        .md-h6 { font-size: 0.9em; color: var(--text-secondary); }

        .md-li {
            display: block;
            margin-left: 20px;
            padding: 1px 0;
        }

        .md-li::before {
            content: "•";
            display: inline-block;
            width: 1em;
            margin-left: -1em;
            color: var(--text-secondary);
        }

        .md-li.md-ol::before {
            content: none;
        }

        .md-quote {
            display: block;
            margin: 4px 0;
            padding: 4px 10px;
            border-left: 3px solid var(--accent);
            background: rgba(0, 0, 0, 0.1);
            color: var(--text-secondary);
            font-style: italic;
        }

        .md-hr {
            border: none;
            border-top: 1px solid var(--border);
            margin: 8px 0;
        }

        .md-link {
            color: var(--accent);
            text-decoration: none;
            cursor: pointer;
        }

        .md-link:hover {
            text-decoration: underline;
        }

        /* Markdown table styling */
        .md-table {
            border-collapse: collapse;
            width: 100%;
            margin: 6px 0;
            font-size: 12px;
            background: var(--bg);
        }

        .md-table th,
        .md-table td {
            border: 1px solid #333;
            padding: 4px 8px;
        }

        .md-table thead {
            background: rgba(128, 128, 128, 0.2);
        }

        .md-table th {
            font-weight: 600;
            background: rgba(128, 128, 128, 0.25);
        }

        .md-table tbody tr:nth-child(even) {
            background: rgba(128, 128, 128, 0.05);
        }

        .md-table tbody tr:hover {
            background: rgba(128, 128, 128, 0.1);
        }

        /* REQ-012: Enhanced tool use display */
        .tool-block {
            margin: 4px 0;
            border-radius: 6px;
            overflow: hidden;
            background: rgba(59, 130, 246, 0.05);
            border: 1px solid rgba(59, 130, 246, 0.2);
        }

        .tool-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 10px;
            background: rgba(59, 130, 246, 0.1);
            cursor: pointer;
            user-select: none;
        }

        .tool-header:hover {
            background: rgba(59, 130, 246, 0.15);
        }

        .tool-name {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
        }

        .tool-icon {
            font-size: 14px;
        }

        .tool-expand {
            font-size: 12px;
            color: var(--text-secondary);
            transition: transform 0.2s ease;
        }

        .tool-block.expanded .tool-expand {
            transform: rotate(180deg);
        }

        .tool-content {
            display: none;
            padding: 12px;
            border-top: 1px solid rgba(59, 130, 246, 0.2);
            max-height: 300px;
            overflow-y: auto;
        }

        .tool-block.expanded .tool-content {
            display: block;
        }

        .tool-input {
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            white-space: pre-wrap;
            word-break: break-all;
        }

        /* Tool result display (Bash output, Read content, etc.) */
        .tool-result {
            margin-top: 8px;
            padding: 8px 12px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 4px;
            border-top: 1px solid rgba(59, 130, 246, 0.2);
        }

        .tool-result.error {
            background: rgba(239, 68, 68, 0.1);
            border-color: rgba(239, 68, 68, 0.3);
        }

        .tool-result-content {
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            line-height: 1.4;
            white-space: pre-wrap;
            word-break: break-word;
            color: var(--vscode-foreground);
            opacity: 0.9;
            margin: 0;
            max-height: 200px;
            overflow-y: auto;
        }

        .tool-result.collapsed .tool-result-content {
            max-height: 100px;
            overflow: hidden;
            position: relative;
        }

        .tool-result.collapsed .tool-result-content::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 40px;
            background: linear-gradient(transparent, rgba(0, 0, 0, 0.3));
            pointer-events: none;
        }

        .tool-result-expand {
            display: none;
            margin-top: 8px;
            padding: 4px 8px;
            font-size: 11px;
            color: var(--accent);
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .tool-result.collapsed .tool-result-expand {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .tool-result-expand:hover {
            background: rgba(59, 130, 246, 0.2);
        }

        .tool-result-stats {
            display: flex;
            gap: 8px;
            margin-top: 6px;
            font-size: 10px;
            color: var(--text-secondary);
        }

        .tool-result-stat {
            display: flex;
            align-items: center;
            gap: 3px;
        }

        /* Background agent/Task display */
        .agent-container {
            margin: 8px 0;
        }

        .agent-block {
            border-radius: 6px;
            overflow: hidden;
            background: rgba(139, 92, 246, 0.05);
            border: 1px solid rgba(139, 92, 246, 0.2);
        }

        .agent-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: rgba(139, 92, 246, 0.1);
        }

        .agent-icon {
            font-size: 14px;
        }

        .agent-type {
            font-size: 10px;
            padding: 2px 6px;
            background: rgba(139, 92, 246, 0.2);
            border-radius: 4px;
            color: rgba(139, 92, 246, 0.9);
            text-transform: uppercase;
            font-weight: 500;
        }

        .agent-description {
            flex: 1;
            font-size: 12px;
            color: var(--vscode-foreground);
        }

        .agent-status {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .agent-status.running {
            color: rgba(59, 130, 246, 0.9);
        }

        .agent-status.completed {
            color: rgba(34, 197, 94, 0.9);
        }

        /* REQ-012: Enhanced error display */
        .error-block {
            margin: 8px 0;
            padding: 12px;
            border-radius: 6px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .error-header {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
            margin-bottom: 8px;
        }

        .error-icon {
            font-size: 16px;
        }

        .error-type {
            font-size: 12px;
            padding: 2px 6px;
            border-radius: 4px;
            background: rgba(239, 68, 68, 0.2);
        }

        .error-message {
            color: var(--text-primary);
        }

        .error-details {
            margin-top: 8px;
            padding: 8px;
            background: rgba(0, 0, 0, 0.1);
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            color: var(--text-secondary);
            white-space: pre-wrap;
        }

        /* Error type specific colors */
        .error-block[data-type="rate-limit"] {
            background: rgba(245, 158, 11, 0.1);
            border-color: rgba(245, 158, 11, 0.3);
        }
        .error-block[data-type="rate-limit"] .error-type {
            background: rgba(245, 158, 11, 0.2);
        }
        .error-block[data-type="timeout"] {
            background: rgba(139, 92, 246, 0.1);
            border-color: rgba(139, 92, 246, 0.3);
        }
        .error-block[data-type="timeout"] .error-type {
            background: rgba(139, 92, 246, 0.2);
        }
        .error-block[data-type="network"] {
            background: rgba(59, 130, 246, 0.1);
            border-color: rgba(59, 130, 246, 0.3);
        }
        .error-block[data-type="network"] .error-type {
            background: rgba(59, 130, 246, 0.2);
        }

        .error-suggestion {
            margin-top: 8px;
            padding: 8px 10px;
            background: rgba(34, 197, 94, 0.1);
            border-left: 3px solid rgba(34, 197, 94, 0.5);
            border-radius: 0 4px 4px 0;
            font-size: 12px;
            color: var(--text-secondary);
        }

        .error-retry-btn {
            margin-top: 8px;
            padding: 6px 12px;
            font-size: 12px;
            background: rgba(59, 130, 246, 0.2);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 4px;
            color: var(--accent);
            cursor: pointer;
        }

        .error-retry-btn:hover {
            background: rgba(59, 130, 246, 0.3);
        }

        /* REQ-012: Collapsible thinking blocks */
        .thinking-block {
            margin: 8px 0;
            border-radius: 6px;
            overflow: hidden;
            background: rgba(139, 92, 246, 0.05);
            border: 1px solid rgba(139, 92, 246, 0.2);
        }

        .thinking-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: rgba(139, 92, 246, 0.1);
            cursor: pointer;
            user-select: none;
        }

        .thinking-header:hover {
            background: rgba(139, 92, 246, 0.15);
        }

        .thinking-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
            font-style: italic;
        }

        .thinking-expand {
            font-size: 12px;
            color: var(--text-secondary);
            transition: transform 0.2s ease;
        }

        .thinking-block.expanded .thinking-expand {
            transform: rotate(180deg);
        }

        .thinking-content {
            display: none;
            padding: 12px;
            border-top: 1px solid rgba(139, 92, 246, 0.2);
            font-style: italic;
            color: var(--text-secondary);
            max-height: 400px;
            overflow-y: auto;
        }

        .thinking-block.expanded .thinking-content {
            display: block;
        }

        /* REQ-012: Message timestamps */
        .message-timestamp {
            font-size: 10px;
            color: var(--text-secondary);
            margin-top: 4px;
            text-align: right;
            opacity: 0.6;
        }

        .message:hover .message-timestamp {
            opacity: 1;
        }

        /* User message timestamp needs to be lighter since bg is dark */
        .message.user .message-timestamp {
            color: rgba(255, 255, 255, 0.7);
            opacity: 0.8;
        }

        .message.user:hover .message-timestamp {
            opacity: 1;
        }

        /* Question Panel */
        .question-panel {
            background: var(--bg-secondary);
            border-top: 1px solid var(--border);
            padding: 12px;
        }

        .question-panel.hidden {
            display: none;
        }

        .question-header {
            font-weight: 600;
            margin-bottom: 12px;
        }

        .question-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 12px;
        }

        .question-option {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding: 8px;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 6px;
            cursor: pointer;
        }

        .question-option:hover {
            border-color: var(--accent);
        }

        .question-option.selected {
            border-color: var(--accent);
            background: rgba(59, 130, 246, 0.1);
        }

        .question-option input {
            margin-top: 3px;
        }

        .option-content {
            flex: 1;
        }

        .option-label {
            font-weight: 500;
        }

        .option-description {
            font-size: 12px;
            color: var(--text-secondary);
            margin-top: 2px;
        }

        .question-actions {
            display: flex;
            justify-content: flex-end;
        }

        .other-option {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 6px;
        }

        .other-option.selected {
            border-color: var(--accent);
            background: rgba(59, 130, 246, 0.1);
        }

        .other-input {
            flex: 1;
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 4px;
            padding: 4px 8px;
            color: var(--text-primary);
            font-size: 13px;
        }

        .other-input:focus {
            outline: none;
            border-color: var(--accent);
        }

        .question-badge {
            display: inline-block;
            background: var(--vscode-badge-background, #4d4d4d);
            color: var(--vscode-badge-foreground, #fff);
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .btn {
            padding: 6px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }

        .btn-primary {
            background: var(--btn-bg);
            color: var(--btn-fg);
        }

        .btn-primary:hover {
            opacity: 0.9;
        }

        /* Footer */
        #footer {
            padding: 12px;
            background: var(--bg-secondary);
            border-top: 1px solid var(--border);
        }

        /* Input Toolbar */
        .input-toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border);
        }

        .toolbar-left, .toolbar-right {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .toolbar-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 4px;
            color: var(--text-secondary);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .toolbar-btn:hover {
            border-color: var(--accent);
            color: var(--text-primary);
        }

        .toggle-group {
            display: flex;
            gap: 4px;
        }

        .toggle-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 4px;
            color: var(--text-secondary);
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .toggle-btn:hover {
            border-color: var(--accent);
            color: var(--text-primary);
        }

        .toggle-btn.active {
            background: var(--accent);
            border-color: var(--accent);
            color: white;
        }

        /* Permission button styles */
        .permission-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            font-size: 11px;
            border-radius: 4px;
            margin-right: 8px;
        }

        .permission-btn .permission-icon {
            font-size: 12px;
        }

        .permission-btn .permission-label {
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 500;
        }

        .permission-btn[data-mode="acceptEdits"] {
            background: rgba(34, 197, 94, 0.15);
            border-color: rgba(34, 197, 94, 0.4);
            color: #22c55e;
        }

        .permission-btn[data-mode="bypassPermissions"] {
            background: rgba(239, 68, 68, 0.15);
            border-color: rgba(239, 68, 68, 0.4);
            color: #ef4444;
        }

        .permission-btn[data-mode="dontAsk"] {
            background: rgba(59, 130, 246, 0.15);
            border-color: rgba(59, 130, 246, 0.4);
            color: #3b82f6;
        }

        /* Permission dropdown */
        .permission-dropdown {
            position: absolute;
            bottom: 100%;
            right: 0;
            margin-bottom: 4px;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            min-width: 200px;
            z-index: 1000;
            display: none;
        }

        .permission-dropdown.visible {
            display: block;
        }

        .permission-option {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid var(--border);
        }

        .permission-option:last-child {
            border-bottom: none;
        }

        .permission-option:hover {
            background: var(--bg-secondary);
        }

        .permission-option.selected {
            background: rgba(59, 130, 246, 0.1);
        }

        .permission-option .option-icon {
            font-size: 16px;
        }

        .permission-option .option-info {
            flex: 1;
        }

        .permission-option .option-name {
            font-size: 12px;
            font-weight: 500;
            color: var(--text-primary);
        }

        .permission-option .option-desc {
            font-size: 10px;
            color: var(--text-secondary);
            margin-top: 2px;
        }

        .input-attachments {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 8px 0;
        }

        .input-attachments.hidden {
            display: none;
        }

        .attachment-chip {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 12px;
            font-size: 11px;
            color: var(--text-secondary);
        }

        .attachment-chip .remove-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 14px;
            height: 14px;
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 10px;
        }

        .attachment-chip .remove-btn:hover {
            color: #ef4444;
        }

        .input-container {
            display: flex;
            gap: 8px;
            align-items: flex-end;
        }

        #input {
            flex: 1;
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 6px;
            padding: 8px 12px;
            color: var(--text-primary);
            font-family: inherit;
            font-size: 14px;
            resize: none;
            min-height: 36px;
            max-height: 150px;
        }

        #input:focus {
            outline: none;
            border-color: var(--accent);
        }

        .send-btn {
            background: var(--btn-bg);
            color: var(--btn-fg);
            border: none;
            border-radius: 6px;
            width: 36px;
            height: 36px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .send-btn:hover {
            opacity: 0.9;
        }

        .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .stop-btn {
            background: #dc2626;
            color: white;
            border: none;
            border-radius: 6px;
            width: 36px;
            height: 36px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: pulse-stop 1.5s ease-in-out infinite;
        }

        .stop-btn:hover {
            background: #b91c1c;
        }

        @keyframes pulse-stop {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        .stop-btn.hidden {
            display: none;
        }

        /* Processing state - show stop, allow input for injection */
        .input-container.processing .send-btn {
            display: none;
        }

        .input-container.processing .stop-btn {
            display: flex;
        }

        .input-container.processing #input {
            border-color: var(--accent);
        }

        .input-container.processing #input::placeholder {
            content: "Inject message into conversation...";
        }

        .footer-info {
            display: flex;
            justify-content: space-between;
            margin-top: 8px;
            font-size: 11px;
            color: var(--text-secondary);
        }

        .memory-status.connected {
            color: #22c55e;
        }

        /* Code blocks */
        pre {
            background: var(--bg-primary);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
        }

        code {
            font-family: var(--vscode-editor-font-family);
        }

        /* Token usage */
        .token-usage {
            font-size: 11px;
            color: var(--text-secondary);
        }

        /* Modal styles */
        .modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .modal.hidden {
            display: none;
        }

        .modal-content {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .modal-content.modal-sm {
            max-width: 360px;
        }

        .modal-content.modal-lg {
            max-width: 700px;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
            font-weight: 600;
        }

        .modal-body {
            padding: 12px;
            max-height: 60vh;
            overflow-y: auto;
        }

        /* Model selector modal */
        .model-option {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.15s;
        }

        .model-option:hover {
            background: var(--bg-primary);
        }

        .model-option.selected {
            background: rgba(59, 130, 246, 0.15);
            border: 1px solid var(--accent);
        }

        .model-option-icon {
            font-size: 20px;
        }

        .model-option-name {
            font-weight: 500;
        }

        .model-option-desc {
            font-size: 12px;
            color: var(--text-secondary);
        }

        /* Slash commands modal */
        .slash-option {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.15s;
        }

        .slash-option:hover {
            background: var(--bg-primary);
        }

        .slash-cmd {
            font-family: var(--vscode-editor-font-family);
            font-weight: 600;
            color: var(--accent);
            min-width: 80px;
        }

        .slash-desc {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .slash-loading {
            text-align: center;
            padding: 20px;
            color: var(--text-secondary);
        }

        .slash-list {
            max-height: 400px;
            overflow-y: auto;
        }

        .slash-section-title {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--text-secondary);
            padding: 8px 12px 4px;
            letter-spacing: 0.5px;
        }

        /* Thinking mode modal */
        .thinking-option {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.15s;
        }

        .thinking-option:hover {
            background: var(--bg-primary);
        }

        .thinking-option.selected {
            background: rgba(139, 92, 246, 0.15);
            border: 1px solid #8b5cf6;
        }

        .thinking-icon {
            font-size: 18px;
        }

        .thinking-name {
            font-weight: 500;
        }

        .thinking-desc {
            font-size: 12px;
            color: var(--text-secondary);
        }

        /* File picker modal */
        .file-search, .history-search {
            width: 100%;
            padding: 8px 12px;
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 13px;
            margin-bottom: 12px;
        }

        .file-search:focus, .history-search:focus {
            outline: none;
            border-color: var(--accent);
        }

        .file-list, .history-list {
            max-height: 400px;
            overflow-y: auto;
        }

        .file-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }

        .file-item:hover {
            background: var(--bg-primary);
        }

        .file-item-icon {
            color: var(--text-secondary);
        }

        .file-item-path {
            color: var(--text-secondary);
            font-size: 11px;
            margin-left: auto;
        }

        .file-loading, .history-loading {
            text-align: center;
            padding: 20px;
            color: var(--text-secondary);
        }

        /* History modal */
        .history-item {
            display: flex;
            flex-direction: column;
            padding: 12px;
            border: 1px solid var(--border);
            border-radius: 6px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: border-color 0.15s;
        }

        .history-item:hover {
            border-color: var(--accent);
        }

        .history-item-title {
            font-weight: 500;
            margin-bottom: 4px;
        }

        .history-item-preview {
            font-size: 12px;
            color: var(--text-secondary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .history-item-meta {
            display: flex;
            gap: 12px;
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 8px;
        }

        /* Settings modal */
        .settings-section {
            margin-bottom: 16px;
        }

        .settings-section-title {
            font-weight: 600;
            font-size: 12px;
            color: var(--text-secondary);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .settings-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
        }

        .settings-select {
            padding: 4px 8px;
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 4px;
            color: var(--text-primary);
            font-size: 12px;
        }

        .settings-actions {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid var(--border);
        }

        .btn-secondary {
            background: var(--bg-primary);
            color: var(--text-primary);
            border: 1px solid var(--border);
        }

        .btn-secondary:hover {
            border-color: var(--accent);
        }

        /* @-Mentions Autocomplete Popup */
        .mention-popup {
            position: absolute;
            bottom: 100%;
            left: 0;
            right: 0;
            max-height: 250px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
            overflow: hidden;
            z-index: 1000;
            display: none;
        }

        .mention-popup.visible {
            display: block;
            animation: mentionSlideIn 0.15s ease;
        }

        @keyframes mentionSlideIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .mention-header {
            padding: 8px 12px;
            font-size: 11px;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid var(--border);
            background: var(--bg-primary);
        }

        .mention-list {
            max-height: 200px;
            overflow-y: auto;
        }

        .mention-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            cursor: pointer;
            transition: background 0.1s;
        }

        .mention-item:hover,
        .mention-item.selected {
            background: rgba(59, 130, 246, 0.1);
        }

        .mention-item.selected {
            border-left: 2px solid var(--accent);
        }

        .mention-item-icon {
            width: 20px;
            text-align: center;
            font-size: 14px;
        }

        .mention-item-text {
            flex: 1;
            font-size: 13px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .mention-item-path {
            font-size: 11px;
            color: var(--text-secondary);
        }

        .mention-item-type {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 4px;
            background: rgba(139, 92, 246, 0.2);
            color: #a78bfa;
        }

        .mention-empty {
            padding: 16px;
            text-align: center;
            color: var(--text-secondary);
            font-size: 12px;
        }

        /* REQ-001: Permission Dialog */
        .permission-dialog {
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
            z-index: 200;
            width: 90%;
            max-width: 450px;
            padding: 16px;
        }

        .permission-dialog.hidden {
            display: none;
        }

        .permission-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }

        .permission-icon {
            font-size: 20px;
        }

        .permission-icon.dangerous {
            color: #ef4444;
        }

        .permission-title {
            font-weight: 600;
        }

        .permission-tool {
            font-family: var(--vscode-editor-font-family);
            background: var(--bg-primary);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            margin-bottom: 12px;
            word-break: break-all;
        }

        /* Permission Pattern Section */
        .permission-patterns {
            margin-bottom: 12px;
        }

        .permission-section-label {
            font-size: 11px;
            color: var(--text-secondary);
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .permission-pattern-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .permission-pattern {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.15s ease;
        }

        .permission-pattern:hover {
            border-color: var(--accent);
            background: var(--bg-hover);
        }

        .permission-pattern.selected {
            border-color: var(--accent);
            background: rgba(99, 102, 241, 0.1);
        }

        .permission-pattern-icon {
            font-size: 14px;
        }

        .permission-pattern-text {
            flex: 1;
            font-family: var(--vscode-editor-font-family);
        }

        .permission-pattern-check {
            opacity: 0;
            transition: opacity 0.15s;
        }

        .permission-pattern.selected .permission-pattern-check {
            opacity: 1;
            color: var(--accent);
        }

        /* Main Action Buttons */
        .permission-actions-main {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 12px;
        }

        .permission-action-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            padding: 12px 8px;
            border-radius: 6px;
            cursor: pointer;
            border: 1px solid var(--border);
            background: var(--bg-primary);
            transition: all 0.15s ease;
        }

        .permission-action-btn:hover {
            background: var(--bg-hover);
        }

        .permission-action-btn .action-icon {
            font-size: 18px;
        }

        .permission-action-btn .action-label {
            font-size: 12px;
            font-weight: 500;
            color: var(--text-primary);
        }

        .permission-action-btn .action-hint {
            font-size: 10px;
            color: var(--text-secondary);
            text-align: center;
        }

        .permission-action-btn.allow-once {
            border-color: #22c55e;
        }

        .permission-action-btn.allow-once:hover {
            background: rgba(34, 197, 94, 0.1);
        }

        .permission-action-btn.allow-always {
            border-color: #6366f1;
        }

        .permission-action-btn.allow-always:hover {
            background: rgba(99, 102, 241, 0.1);
        }

        /* Secondary Actions */
        .permission-actions-secondary {
            display: flex;
            gap: 8px;
            justify-content: space-between;
            padding-top: 12px;
            border-top: 1px solid var(--border);
        }

        .permission-secondary-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 12px;
            background: transparent;
            border: none;
            color: var(--text-secondary);
            font-size: 12px;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.15s;
        }

        .permission-secondary-btn:hover {
            background: var(--bg-primary);
            color: var(--text-primary);
        }

        .permission-secondary-btn.yolo-btn:hover {
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
        }

        /* YOLO Warning Modal */
        .yolo-warning {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--bg-secondary);
            border-radius: 8px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }

        .yolo-warning.hidden {
            display: none;
        }

        .yolo-warning-header {
            font-size: 16px;
            font-weight: 600;
            color: #ef4444;
            margin-bottom: 8px;
        }

        .yolo-warning-text {
            font-size: 13px;
            color: var(--text-secondary);
            margin-bottom: 16px;
            line-height: 1.5;
        }

        .yolo-warning-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }

        /* Legacy permission-actions for backwards compatibility */
        .permission-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }

        .btn-danger {
            background: #ef4444;
            color: white;
        }

        .btn-success {
            background: #22c55e;
            color: white;
        }

        /* REQ-002: Diff Display */
        .diff-container {
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 6px;
            margin: 8px 0;
            overflow: hidden;
        }

        .diff-file-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            font-size: 12px;
            font-weight: 500;
        }

        .diff-content {
            padding: 8px 12px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            line-height: 1.4;
            overflow-x: auto;
            margin: 0;
        }

        .diff-add {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
        }

        .diff-remove {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }

        .diff-hunk {
            color: #8b5cf6;
        }

        .diff-header {
            color: var(--text-secondary);
        }

        .diff-context {
            color: var(--text-secondary);
        }

        .diff-truncated {
            padding: 8px 12px;
            font-size: 11px;
            color: var(--text-secondary);
            border-top: 1px solid var(--border);
        }

        .diff-actions {
            display: flex;
            gap: 8px;
            padding: 8px 12px;
            border-top: 1px solid var(--border);
        }

        .diff-btn {
            padding: 4px 10px;
            background: var(--btn-bg);
            color: var(--btn-fg);
            border: none;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
        }

        /* REQ-004: Token Display */
        .token-display {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 11px;
        }

        .input-tokens {
            color: var(--vscode-charts-blue, #3b82f6);
        }

        .output-tokens {
            color: var(--vscode-charts-green, #22c55e);
        }

        .total-cost {
            color: var(--vscode-charts-yellow, #f59e0b);
        }

        .cache-info {
            opacity: 0.8;
        }

        .token-count.updating {
            animation: tokenPulse 0.3s ease-out;
        }

        @keyframes tokenPulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }

        /* Context Usage Indicator */
        .context-usage-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            background: transparent;
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 2px 8px;
            cursor: pointer;
            font-size: 11px;
            color: var(--text-secondary);
            transition: all 0.15s ease;
        }

        .context-usage-btn:hover {
            background: var(--bg-secondary);
            border-color: var(--accent);
            color: var(--text-primary);
        }

        .context-bar {
            width: 40px;
            height: 6px;
            background: var(--bg-secondary);
            border-radius: 3px;
            overflow: hidden;
        }

        .context-bar-fill {
            height: 100%;
            background: var(--vscode-charts-green, #22c55e);
            border-radius: 3px;
            transition: width 0.3s ease, background 0.3s ease;
            width: 0%;
        }

        .context-bar-fill.warning {
            background: var(--vscode-charts-yellow, #f59e0b);
        }

        .context-bar-fill.critical {
            background: var(--vscode-charts-red, #ef4444);
        }

        .context-text {
            min-width: 28px;
            text-align: right;
        }

        .context-usage-btn.compacting {
            opacity: 0.7;
            pointer-events: none;
        }

        .context-usage-btn.compacting .context-text::after {
            content: '...';
            animation: compactDots 1s infinite;
        }

        @keyframes compactDots {
            0%, 20% { content: '.'; }
            40% { content: '..'; }
            60%, 100% { content: '...'; }
        }

        /* REQ-003: Image Drop Zone */
        .input-container.drag-over {
            border: 2px dashed var(--accent);
            background: rgba(59, 130, 246, 0.1);
        }

        .image-preview {
            max-width: 120px;
            max-height: 90px;
            border-radius: 4px;
            object-fit: cover;
        }

        .image-attachment {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            padding: 8px;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 6px;
            position: relative;
        }

        .image-attachment .remove-btn {
            position: absolute;
            top: 2px;
            right: 2px;
            width: 18px;
            height: 18px;
            background: rgba(0, 0, 0, 0.6);
            border: none;
            border-radius: 50%;
            color: white;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .image-attachment .image-name {
            font-size: 10px;
            color: var(--text-secondary);
            max-width: 100px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* REQ-005: History Grouping */
        .history-group-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--text-secondary);
            padding: 12px 12px 6px;
            letter-spacing: 0.5px;
        }

        .history-item-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }

        .history-item-actions button {
            padding: 4px 8px;
            font-size: 10px;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 4px;
            cursor: pointer;
            color: var(--text-secondary);
        }

        .history-item-actions button:hover {
            border-color: var(--accent);
            color: var(--text-primary);
        }

        .history-item-actions .delete-btn:hover {
            border-color: #ef4444;
            color: #ef4444;
        }
    `;
}

function getScript(): string {
    return `
        const vscode = acquireVsCodeApi();
        const state = vscode.getState() || { messages: [] };

        const messagesEl = document.getElementById('messages');
        const inputEl = document.getElementById('input');
        const sendBtn = document.getElementById('sendBtn');
        const stopBtn = document.getElementById('stopBtn');
        const inputContainerEl = document.querySelector('.input-container');
        const todoPanel = document.getElementById('todoPanel');
        const todoList = document.getElementById('todoList');
        const todoProgress = document.getElementById('todoProgress');
        const questionPanel = document.getElementById('questionPanel');
        const questionHeader = document.getElementById('questionHeader');
        const questionOptions = document.getElementById('questionOptions');
        const submitAnswer = document.getElementById('submitAnswer');
        const routingIndicator = document.getElementById('routingIndicator');
        const checkpointPanel = document.getElementById('checkpointPanel');
        const checkpointList = document.getElementById('checkpointList');
        const checkpointBtn = document.getElementById('checkpointBtn');
        const checkpointCount = document.getElementById('checkpointCount');
        const checkpointSize = document.getElementById('checkpointSize');
        const closeCheckpoints = document.getElementById('closeCheckpoints');
        const memoryStatus = document.getElementById('memoryStatus');
        const planModeBadge = document.getElementById('planModeBadge');
        const backgroundAgentsPanel = document.getElementById('backgroundAgentsPanel');
        const agentsList = document.getElementById('agentsList');
        const agentsCount = document.getElementById('agentsCount');

        // New header buttons
        const newChatBtn = document.getElementById('newChatBtn');
        const historyBtn = document.getElementById('historyBtn');
        const settingsBtn = document.getElementById('settingsBtn');

        // Toolbar elements
        const modelSelectBtn = document.getElementById('modelSelectBtn');
        const currentModelEl = document.getElementById('currentModel');
        const slashCmdBtn = document.getElementById('slashCmdBtn');
        const filePickerBtn = document.getElementById('filePickerBtn');
        const imageBtn = document.getElementById('imageBtn');
        const permissionBtn = document.getElementById('permissionBtn');
        const permissionDropdown = document.getElementById('permissionDropdown');
        const permissionBtnIcon = document.getElementById('permissionBtnIcon');
        const permissionBtnLabel = document.getElementById('permissionBtnLabel');
        const planModeToggle = document.getElementById('planModeToggle');
        const thinkingModeToggle = document.getElementById('thinkingModeToggle');
        const thinkingModeLabel = document.getElementById('thinkingModeLabel');
        const inputAttachments = document.getElementById('inputAttachments');
        const tokenUsage = document.getElementById('tokenUsage');
        const contextUsageBtn = document.getElementById('contextUsageBtn');
        const contextBarFill = document.getElementById('contextBarFill');
        const contextText = document.getElementById('contextText');

        // Modals
        const modelModal = document.getElementById('modelModal');
        const slashModal = document.getElementById('slashModal');
        const fileModal = document.getElementById('fileModal');
        const settingsModal = document.getElementById('settingsModal');
        const historyModal = document.getElementById('historyModal');
        const thinkingModal = document.getElementById('thinkingModal');

        let currentQuestion = null;
        let selectedOptions = [];
        let otherText = '';
        let backgroundAgents = [];
        let checkpoints = [];
        let currentModel = 'claude-sonnet-4';
        let currentThinkingMode = 'default';
        let currentPermissionMode = 'acceptEdits';
        let planModeActive = false;
        let attachedFiles = [];
        let attachedImages = [];
        let currentPermissionRequest = null;
        let currentContextUsage = 0;  // Percentage 0-100
        let totalContextTokens = 0;   // Total tokens used
        let maxContextTokens = 200000; // Claude's context window (default)

        // Permission dialog elements
        const permissionDialog = document.getElementById('permissionDialog');
        const permissionIcon = document.getElementById('permissionIcon');
        const permissionTitle = document.getElementById('permissionTitle');
        const permissionTool = document.getElementById('permissionTool');
        const permissionPatterns = document.getElementById('permissionPatterns');
        const permissionPatternList = document.getElementById('permissionPatternList');
        const permissionAllowOnce = document.getElementById('permissionAllowOnce');
        const permissionAllowAlways = document.getElementById('permissionAllowAlways');
        const alwaysAllowHint = document.getElementById('alwaysAllowHint');
        const permissionDeny = document.getElementById('permissionDeny');
        const permissionYolo = document.getElementById('permissionYolo');
        const yoloWarning = document.getElementById('yoloWarning');
        const yoloCancelBtn = document.getElementById('yoloCancelBtn');
        const yoloConfirmBtn = document.getElementById('yoloConfirmBtn');
        const inputContainer = document.querySelector('.input-container');
        let selectedPattern = null;

        // Checkpoint panel toggle
        checkpointBtn.addEventListener('click', () => {
            checkpointPanel.classList.toggle('hidden');
            if (!checkpointPanel.classList.contains('hidden')) {
                vscode.postMessage({ type: 'getCheckpoints' });
            }
        });

        closeCheckpoints.addEventListener('click', () => {
            checkpointPanel.classList.add('hidden');
        });

        function updateCheckpoints(data) {
            checkpoints = data.checkpoints || [];
            checkpointCount.textContent = checkpoints.length;
            if (data.size) {
                checkpointSize.textContent = data.size;
            }

            if (checkpoints.length === 0) {
                checkpointList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No checkpoints yet.<br>Checkpoints are created automatically before AI makes changes.</div>';
                return;
            }

            checkpointList.innerHTML = checkpoints.map((cp, i) => {
                const date = new Date(cp.timestamp);
                const timeAgo = formatTimeAgo(date);
                const isPreRestore = cp.isPreRestore ? 'pre-restore' : '';

                return '<div class="checkpoint-item ' + isPreRestore + '" data-sha="' + cp.sha + '">' +
                    '<div class="checkpoint-top">' +
                        '<span class="checkpoint-desc">' + escapeHtml(cp.description) + '</span>' +
                        '<span class="checkpoint-time">' + timeAgo + '</span>' +
                    '</div>' +
                    '<div class="checkpoint-stats">' +
                        '<span class="checkpoint-stat">' + cp.stats.filesChanged + ' files</span>' +
                        '<span class="checkpoint-stat additions">+' + cp.stats.insertions + '</span>' +
                        '<span class="checkpoint-stat deletions">-' + cp.stats.deletions + '</span>' +
                    '</div>' +
                    '<div class="checkpoint-actions">' +
                        '<button class="checkpoint-btn-restore" onclick="restoreCheckpoint(\\'' + cp.sha + '\\')">Restore</button>' +
                        (cp.isPreRestore ? '<span style="font-size:10px;color:var(--text-secondary)">⚠️ Undo point</span>' : '') +
                    '</div>' +
                '</div>';
            }).join('');
        }

        function restoreCheckpoint(sha) {
            if (!confirm('Restore to this checkpoint?\\n\\nA backup of current state will be created first so you can undo this.')) {
                return;
            }
            vscode.postMessage({ type: 'restoreCheckpoint', sha: sha });
            checkpointPanel.classList.add('hidden');
        }

        // Make restoreCheckpoint available globally for onclick
        window.restoreCheckpoint = restoreCheckpoint;

        // ═══════════════════════════════════════════
        // REQ-001: Permission Dialog Handlers
        // ═══════════════════════════════════════════
        function showPermissionDialog(request) {
            currentPermissionRequest = request;
            selectedPattern = null;
            yoloWarning.classList.add('hidden');
            permissionDialog.classList.remove('hidden');

            // Set icon based on tool type
            const isDangerous = request.toolName === 'Bash' ||
                               request.toolName === 'Write' ||
                               request.toolName === 'Edit';
            permissionIcon.textContent = isDangerous ? '🚨' : '⚠️';
            permissionIcon.classList.toggle('dangerous', isDangerous);

            // Set title based on tool
            const titles = {
                'Bash': 'Run Command',
                'Write': 'Create File',
                'Edit': 'Edit File',
                'default': 'Permission Required'
            };
            permissionTitle.textContent = titles[request.toolName] || titles.default;

            // Format tool info with full details
            let toolInfo = '';
            if (request.toolInput) {
                if (request.toolName === 'Bash' && request.toolInput.command) {
                    toolInfo = request.toolInput.command;
                } else if (request.toolInput.file_path) {
                    toolInfo = request.toolInput.file_path;
                    if (request.toolName === 'Edit' && request.toolInput.old_string) {
                        toolInfo += '\\n\\nChanging:\\n' + request.toolInput.old_string.substring(0, 100) + '...';
                    }
                } else {
                    toolInfo = JSON.stringify(request.toolInput, null, 2).substring(0, 300);
                }
            } else {
                toolInfo = request.toolName;
            }
            permissionTool.textContent = toolInfo;

            // Build pattern suggestions for "Always Allow"
            const patterns = [];

            if (request.toolName === 'Bash' && request.toolInput?.command) {
                const cmd = request.toolInput.command.trim();
                const parts = cmd.split(/\\s+/);
                const baseCmd = parts[0];

                // Add patterns in order of specificity
                patterns.push({
                    pattern: cmd,
                    label: 'This exact command',
                    icon: '📌'
                });

                if (parts.length > 1) {
                    patterns.push({
                        pattern: baseCmd + ' *',
                        label: 'All ' + baseCmd + ' commands',
                        icon: '📦'
                    });
                }

                // Add common pattern suggestions
                if (request.suggestions) {
                    request.suggestions.forEach(s => {
                        if (!patterns.find(p => p.pattern === s)) {
                            patterns.push({
                                pattern: s,
                                label: s,
                                icon: '⚡'
                            });
                        }
                    });
                }
            } else if (request.toolName === 'Edit' || request.toolName === 'Write') {
                const filePath = request.toolInput?.file_path || '';
                const ext = filePath.split('.').pop();
                const dir = filePath.substring(0, filePath.lastIndexOf('/'));

                patterns.push({
                    pattern: filePath,
                    label: 'This file only',
                    icon: '📄'
                });

                if (ext) {
                    patterns.push({
                        pattern: '*.' + ext,
                        label: 'All .' + ext + ' files',
                        icon: '📁'
                    });
                }

                if (dir) {
                    patterns.push({
                        pattern: dir + '/*',
                        label: 'Files in ' + dir.split('/').pop() + '/',
                        icon: '📂'
                    });
                }

                patterns.push({
                    pattern: '*',
                    label: 'All ' + request.toolName + ' operations',
                    icon: '🔓'
                });
            } else {
                patterns.push({
                    pattern: '*',
                    label: 'All ' + request.toolName + ' operations',
                    icon: '🔓'
                });
            }

            // Render patterns (max 4)
            const displayPatterns = patterns.slice(0, 4);
            if (displayPatterns.length > 0) {
                permissionPatterns.classList.remove('hidden');
                permissionPatternList.innerHTML = displayPatterns.map((p, i) =>
                    '<div class="permission-pattern' + (i === 0 ? ' selected' : '') + '" data-pattern="' + escapeHtml(p.pattern) + '">' +
                        '<span class="permission-pattern-icon">' + p.icon + '</span>' +
                        '<span class="permission-pattern-text">' + escapeHtml(p.label) + '</span>' +
                        '<span class="permission-pattern-check">✓</span>' +
                    '</div>'
                ).join('');

                // Select first pattern by default
                selectedPattern = displayPatterns[0].pattern;
                alwaysAllowHint.textContent = displayPatterns[0].label;

                // Handle pattern clicks
                permissionPatternList.querySelectorAll('.permission-pattern').forEach(el => {
                    el.addEventListener('click', () => {
                        permissionPatternList.querySelectorAll('.permission-pattern').forEach(p => p.classList.remove('selected'));
                        el.classList.add('selected');
                        selectedPattern = el.dataset.pattern;
                        const patternData = displayPatterns.find(p => p.pattern === selectedPattern);
                        alwaysAllowHint.textContent = patternData ? patternData.label : selectedPattern;
                    });
                });
            } else {
                permissionPatterns.classList.add('hidden');
                alwaysAllowHint.textContent = request.toolName;
            }
        }

        // Deny button
        permissionDeny.addEventListener('click', () => {
            if (currentPermissionRequest) {
                vscode.postMessage({
                    type: 'permissionResponse',
                    data: {
                        requestId: currentPermissionRequest.requestId,
                        allowed: false
                    }
                });
            }
            permissionDialog.classList.add('hidden');
            currentPermissionRequest = null;
        });

        // Allow Once button
        permissionAllowOnce.addEventListener('click', () => {
            if (currentPermissionRequest) {
                vscode.postMessage({
                    type: 'permissionResponse',
                    data: {
                        requestId: currentPermissionRequest.requestId,
                        allowed: true,
                        scope: 'once'
                    }
                });
            }
            permissionDialog.classList.add('hidden');
            currentPermissionRequest = null;
        });

        // Always Allow button (with selected pattern)
        permissionAllowAlways.addEventListener('click', () => {
            if (currentPermissionRequest) {
                vscode.postMessage({
                    type: 'permissionResponse',
                    data: {
                        requestId: currentPermissionRequest.requestId,
                        allowed: true,
                        alwaysAllow: true,
                        pattern: selectedPattern || '*'
                    }
                });
            }
            permissionDialog.classList.add('hidden');
            currentPermissionRequest = null;
        });

        // YOLO Mode button
        permissionYolo.addEventListener('click', () => {
            yoloWarning.classList.remove('hidden');
        });

        // YOLO Cancel
        yoloCancelBtn.addEventListener('click', () => {
            yoloWarning.classList.add('hidden');
        });

        // YOLO Confirm
        yoloConfirmBtn.addEventListener('click', () => {
            vscode.postMessage({
                type: 'permissionResponse',
                data: {
                    requestId: currentPermissionRequest?.requestId,
                    allowed: true,
                    enableYolo: true
                }
            });
            permissionDialog.classList.add('hidden');
            currentPermissionRequest = null;
        });

        // ═══════════════════════════════════════════
        // REQ-002: Diff Rendering
        // ═══════════════════════════════════════════
        function renderDiff(diffData) {
            const div = document.createElement('div');
            div.className = 'message tool';

            const fileName = diffData.filePath.split('/').pop();
            const truncated = diffData.truncated ? '<div class="diff-truncated">Diff truncated. Click to view full diff.</div>' : '';

            div.innerHTML = '<div class="diff-container" data-file="' + escapeHtml(diffData.filePath) + '">' +
                '<div class="diff-file-header">' +
                    '<span>📄 ' + escapeHtml(fileName) + '</span>' +
                    '<span class="diff-stats">' +
                        '<span style="color:#22c55e">+' + diffData.additions + '</span> ' +
                        '<span style="color:#ef4444">-' + diffData.deletions + '</span>' +
                    '</span>' +
                '</div>' +
                '<pre class="diff-content">' + formatDiffLines(diffData.diff) + '</pre>' +
                truncated +
                '<div class="diff-actions">' +
                    '<button class="diff-btn" onclick="openDiff(\\'' + escapeHtml(diffData.filePath) + '\\')">View Full Diff</button>' +
                '</div>' +
            '</div>';

            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        function formatDiffLines(diff) {
            if (!diff) return '';
            return diff.split('\\n').map(line => {
                if (line.startsWith('+') && !line.startsWith('+++')) {
                    return '<span class="diff-add">' + escapeHtml(line) + '</span>';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    return '<span class="diff-remove">' + escapeHtml(line) + '</span>';
                } else if (line.startsWith('@@')) {
                    return '<span class="diff-hunk">' + escapeHtml(line) + '</span>';
                } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
                    return '<span class="diff-header">' + escapeHtml(line) + '</span>';
                }
                return '<span class="diff-context">' + escapeHtml(line) + '</span>';
            }).join('\\n');
        }

        function openDiff(filePath) {
            vscode.postMessage({ type: 'openDiff', data: { filePath } });
        }
        window.openDiff = openDiff;

        // ═══════════════════════════════════════════
        // REQ-003: Image Drag-Drop and Paste
        // ═══════════════════════════════════════════
        inputContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            inputContainer.classList.add('drag-over');
        });

        inputContainer.addEventListener('dragleave', (e) => {
            e.preventDefault();
            inputContainer.classList.remove('drag-over');
        });

        inputContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            inputContainer.classList.remove('drag-over');

            const files = e.dataTransfer.files;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        vscode.postMessage({
                            type: 'imageDropped',
                            data: {
                                name: file.name,
                                base64: reader.result,
                                mimeType: file.type
                            }
                        });
                    };
                    reader.readAsDataURL(file);
                }
            }
        });

        // Paste handler for images
        document.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    e.preventDefault();
                    const file = items[i].getAsFile();
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                            vscode.postMessage({
                                type: 'imagePasted',
                                data: {
                                    name: 'pasted-image-' + Date.now() + '.png',
                                    base64: reader.result,
                                    mimeType: file.type
                                }
                            });
                        };
                        reader.readAsDataURL(file);
                    }
                    break;
                }
            }
        });

        // ═══════════════════════════════════════════
        // REQ-004: Token Display Updates
        // ═══════════════════════════════════════════
        function updateTokenDisplay(stats) {
            if (!stats) return;

            let html = '<span class="token-display">';
            html += '<span class="input-tokens token-count">↓ ' + stats.inputTokens.toLocaleString() + '</span>';
            html += '<span class="output-tokens token-count">↑ ' + stats.outputTokens.toLocaleString() + '</span>';

            if (stats.cacheReadTokens > 0 || stats.cacheWriteTokens > 0) {
                html += '<span class="cache-info">💾 ' + stats.cacheReadTokens.toLocaleString() + ' read</span>';
            }

            if (stats.estimatedCost) {
                html += '<span class="total-cost">$' + stats.estimatedCost.toFixed(4) + '</span>';
            }

            html += '</span>';
            tokenUsage.innerHTML = html;

            // Trigger animation
            const counts = tokenUsage.querySelectorAll('.token-count');
            counts.forEach(el => {
                el.classList.add('updating');
                setTimeout(() => el.classList.remove('updating'), 300);
            });

            // Update context usage based on total tokens
            totalContextTokens = (stats.inputTokens || 0) + (stats.outputTokens || 0);
            updateContextUsage();
        }

        // ═══════════════════════════════════════════
        // Context Usage Display & Compaction
        // ═══════════════════════════════════════════
        function updateContextUsage() {
            currentContextUsage = Math.min(100, Math.round((totalContextTokens / maxContextTokens) * 100));

            // Update bar fill
            contextBarFill.style.width = currentContextUsage + '%';

            // Update color based on usage level
            contextBarFill.classList.remove('warning', 'critical');
            if (currentContextUsage >= 80) {
                contextBarFill.classList.add('critical');
            } else if (currentContextUsage >= 60) {
                contextBarFill.classList.add('warning');
            }

            // Update text
            contextText.textContent = currentContextUsage + '%';

            // Update tooltip
            const remaining = maxContextTokens - totalContextTokens;
            contextUsageBtn.title = 'Context: ' + totalContextTokens.toLocaleString() + ' / ' + maxContextTokens.toLocaleString() + ' tokens (' + remaining.toLocaleString() + ' remaining)\\nClick to compact context';
        }

        function requestCompactContext() {
            if (contextUsageBtn.classList.contains('compacting')) return;

            contextUsageBtn.classList.add('compacting');
            contextText.textContent = 'Compacting';

            // Request context compaction from extension
            vscode.postMessage({ type: 'compactContext' });
        }

        // Context usage button click handler
        contextUsageBtn.addEventListener('click', () => {
            if (currentContextUsage < 20) {
                // Don't compact if context usage is low
                vscode.postMessage({
                    type: 'showInfo',
                    message: 'Context usage is low (' + currentContextUsage + '%). Compaction not needed.'
                });
                return;
            }
            requestCompactContext();
        });

        // ═══════════════════════════════════════════
        // REQ-005: History with Date Grouping
        // ═══════════════════════════════════════════
        function renderGroupedHistory(conversations) {
            if (!conversations || conversations.length === 0) {
                historyList.innerHTML = '<div class="history-loading">No conversations found</div>';
                return;
            }

            // Group by date
            const groups = {};
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);

            conversations.forEach(conv => {
                const date = new Date(conv.timestamp);
                date.setHours(0, 0, 0, 0);

                let groupKey;
                if (date.getTime() === today.getTime()) {
                    groupKey = 'Today';
                } else if (date.getTime() === yesterday.getTime()) {
                    groupKey = 'Yesterday';
                } else if (date >= weekAgo) {
                    groupKey = 'This Week';
                } else {
                    groupKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                }

                if (!groups[groupKey]) {
                    groups[groupKey] = [];
                }
                groups[groupKey].push(conv);
            });

            let html = '';
            for (const [groupTitle, items] of Object.entries(groups)) {
                html += '<div class="history-group-title">' + groupTitle + '</div>';
                html += items.map(item => {
                    const date = new Date(item.timestamp);
                    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    return '<div class="history-item" data-id="' + item.id + '">' +
                        '<div class="history-item-title">' + escapeHtml(item.title || 'Untitled') + '</div>' +
                        '<div class="history-item-preview">' + escapeHtml(item.preview || '') + '</div>' +
                        '<div class="history-item-meta">' +
                            '<span>' + timeStr + '</span>' +
                            '<span>' + (item.messageCount || 0) + ' messages</span>' +
                        '</div>' +
                        '<div class="history-item-actions">' +
                            '<button class="load-btn" data-id="' + item.id + '">Load</button>' +
                            '<button class="delete-btn" data-id="' + item.id + '">Delete</button>' +
                        '</div>' +
                    '</div>';
                }).join('');
            }

            historyList.innerHTML = html;

            // Add event handlers
            historyList.querySelectorAll('.load-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    vscode.postMessage({ type: 'loadConversation', id: btn.dataset.id });
                    historyModal.classList.add('hidden');
                });
            });

            historyList.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm('Delete this conversation?')) {
                        vscode.postMessage({ type: 'deleteConversation', id: btn.dataset.id });
                    }
                });
            });

            historyList.querySelectorAll('.history-item').forEach(item => {
                item.addEventListener('click', () => {
                    vscode.postMessage({ type: 'loadConversation', id: item.dataset.id });
                    historyModal.classList.add('hidden');
                });
            });
        }

        // ═══════════════════════════════════════════
        // Header button handlers
        // ═══════════════════════════════════════════
        newChatBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'newSession' });
        });

        historyBtn.addEventListener('click', () => {
            historyModal.classList.remove('hidden');
            vscode.postMessage({ type: 'getHistory' });
        });

        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
        });

        // ═══════════════════════════════════════════
        // Toolbar button handlers
        // ═══════════════════════════════════════════
        modelSelectBtn.addEventListener('click', () => {
            modelModal.classList.remove('hidden');
            updateModelSelection();
        });

        slashCmdBtn.addEventListener('click', () => {
            slashModal.classList.remove('hidden');
            vscode.postMessage({ type: 'getCommands' });
        });

        filePickerBtn.addEventListener('click', () => {
            fileModal.classList.remove('hidden');
            vscode.postMessage({ type: 'getFiles' });
        });

        imageBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'attachImage' });
        });

        // Permission mode toggle
        permissionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            permissionDropdown.classList.toggle('visible');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!permissionBtn.contains(e.target) && !permissionDropdown.contains(e.target)) {
                permissionDropdown.classList.remove('visible');
            }
        });

        // Permission option selection
        permissionDropdown.querySelectorAll('.permission-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const mode = opt.dataset.mode;
                setPermissionMode(mode);
                permissionDropdown.classList.remove('visible');
            });
        });

        function setPermissionMode(mode) {
            currentPermissionMode = mode;
            permissionBtn.dataset.mode = mode;

            const modes = {
                'acceptEdits': { icon: '🛡️', label: 'Safe' },
                'bypassPermissions': { icon: '🚀', label: 'YOLO' },
                'dontAsk': { icon: '🔒', label: 'Strict' }
            };

            const config = modes[mode] || modes.acceptEdits;
            permissionBtnIcon.textContent = config.icon;
            permissionBtnLabel.textContent = config.label;

            // Update selected state in dropdown
            permissionDropdown.querySelectorAll('.permission-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.mode === mode);
            });

            // Send to extension
            vscode.postMessage({ type: 'setPermissionMode', mode: mode });
        }

        // Initialize permission mode display
        setPermissionMode(currentPermissionMode);

        planModeToggle.addEventListener('click', () => {
            planModeActive = !planModeActive;
            planModeToggle.classList.toggle('active', planModeActive);
            vscode.postMessage({ type: 'setPlanMode', active: planModeActive });
        });

        thinkingModeToggle.addEventListener('click', () => {
            thinkingModal.classList.remove('hidden');
            updateThinkingSelection();
        });

        // ═══════════════════════════════════════════
        // Modal handlers
        // ═══════════════════════════════════════════

        // Close modals when clicking outside or on close button
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });

        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.modal;
                document.getElementById(modalId).classList.add('hidden');
            });
        });

        // Model selection
        function updateModelSelection() {
            modelModal.querySelectorAll('.model-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.model === currentModel);
            });
        }

        modelModal.querySelectorAll('.model-option').forEach(opt => {
            opt.addEventListener('click', () => {
                currentModel = opt.dataset.model;
                const modelNames = {
                    'claude-sonnet-4': 'Claude Sonnet',
                    'claude-opus-4': 'Claude Opus',
                    'claude-haiku-3.5': 'Claude Haiku'
                };
                currentModelEl.textContent = modelNames[currentModel] || currentModel;
                vscode.postMessage({ type: 'setModel', model: currentModel });
                modelModal.classList.add('hidden');
            });
        });

        // Slash commands - dynamic rendering
        const slashList = document.getElementById('slashList');
        let allCommands = [];

        function renderSlashCommands(commands) {
            if (commands.length === 0) {
                slashList.innerHTML = '<div class="slash-loading">No commands available</div>';
                return;
            }

            // Group by source (builtin vs custom)
            const builtin = commands.filter(c => c.source === 'builtin');
            const custom = commands.filter(c => c.source === 'custom');

            let html = '';

            if (builtin.length > 0) {
                html += '<div class="slash-section-title">Built-in Commands</div>';
                html += builtin.map(cmd =>
                    '<div class="slash-option" data-command="' + escapeHtml(cmd.command) + '">' +
                        '<div class="slash-cmd">' + escapeHtml(cmd.command) + '</div>' +
                        '<div class="slash-desc">' + escapeHtml(cmd.description) + '</div>' +
                    '</div>'
                ).join('');
            }

            if (custom.length > 0) {
                html += '<div class="slash-section-title">Custom Commands (.claude/commands)</div>';
                html += custom.map(cmd =>
                    '<div class="slash-option" data-command="' + escapeHtml(cmd.command) + '">' +
                        '<div class="slash-cmd">' + escapeHtml(cmd.command) + '</div>' +
                        '<div class="slash-desc">' + escapeHtml(cmd.description) + '</div>' +
                    '</div>'
                ).join('');
            }

            slashList.innerHTML = html;

            // Add click handlers
            slashList.querySelectorAll('.slash-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    const cmd = opt.dataset.command;
                    inputEl.value = cmd + ' ';
                    inputEl.focus();
                    slashModal.classList.add('hidden');
                });
            });
        }

        // Thinking mode selection
        function updateThinkingSelection() {
            thinkingModal.querySelectorAll('.thinking-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.mode === currentThinkingMode);
            });
        }

        thinkingModal.querySelectorAll('.thinking-option').forEach(opt => {
            opt.addEventListener('click', () => {
                currentThinkingMode = opt.dataset.mode;
                const modeLabels = {
                    'default': 'Think',
                    'think': 'Think',
                    'thinkHard': 'Think Hard',
                    'thinkHarder': 'Think Harder',
                    'ultrathink': 'Ultrathink'
                };
                thinkingModeLabel.textContent = modeLabels[currentThinkingMode];
                thinkingModeToggle.classList.toggle('active', currentThinkingMode !== 'default');
                vscode.postMessage({ type: 'setThinkingMode', mode: currentThinkingMode });
                thinkingModal.classList.add('hidden');
            });
        });

        // File search
        const fileSearch = document.getElementById('fileSearch');
        const fileList = document.getElementById('fileList');
        let allFiles = [];

        fileSearch.addEventListener('input', () => {
            const query = fileSearch.value.toLowerCase();
            renderFileList(allFiles.filter(f => f.toLowerCase().includes(query)));
        });

        function renderFileList(files) {
            if (files.length === 0) {
                fileList.innerHTML = '<div class="file-loading">No files found</div>';
                return;
            }
            fileList.innerHTML = files.slice(0, 50).map(file => {
                const name = file.split('/').pop();
                const path = file.split('/').slice(0, -1).join('/');
                return '<div class="file-item" data-file="' + escapeHtml(file) + '">' +
                    '<span class="file-item-icon">📄</span>' +
                    '<span class="file-item-name">' + escapeHtml(name) + '</span>' +
                    '<span class="file-item-path">' + escapeHtml(path) + '</span>' +
                '</div>';
            }).join('');

            fileList.querySelectorAll('.file-item').forEach(item => {
                item.addEventListener('click', () => {
                    const file = item.dataset.file;
                    addFileAttachment(file);
                    fileModal.classList.add('hidden');
                });
            });
        }

        function addFileAttachment(file) {
            if (attachedFiles.includes(file)) return;
            attachedFiles.push(file);
            updateAttachments();
        }

        function addImageAttachment(src, name) {
            attachedImages.push({ src, name });
            updateAttachments();
        }

        function updateAttachments() {
            if (attachedFiles.length === 0 && attachedImages.length === 0) {
                inputAttachments.classList.add('hidden');
                return;
            }

            inputAttachments.classList.remove('hidden');
            inputAttachments.innerHTML = '';

            attachedFiles.forEach((file, i) => {
                const name = file.split('/').pop();
                const chip = document.createElement('div');
                chip.className = 'attachment-chip';
                chip.innerHTML = '📄 ' + escapeHtml(name) + '<button class="remove-btn" data-type="file" data-index="' + i + '">×</button>';
                inputAttachments.appendChild(chip);
            });

            attachedImages.forEach((img, i) => {
                const chip = document.createElement('div');
                chip.className = 'attachment-chip';
                chip.innerHTML = '🖼️ ' + escapeHtml(img.name) + '<button class="remove-btn" data-type="image" data-index="' + i + '">×</button>';
                inputAttachments.appendChild(chip);
            });

            // Add remove handlers
            inputAttachments.querySelectorAll('.remove-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const type = btn.dataset.type;
                    const index = parseInt(btn.dataset.index);
                    if (type === 'file') {
                        attachedFiles.splice(index, 1);
                    } else {
                        attachedImages.splice(index, 1);
                    }
                    updateAttachments();
                });
            });
        }

        // History search
        const historySearch = document.getElementById('historySearch');
        const historyList = document.getElementById('historyList');
        let allHistory = [];

        historySearch.addEventListener('input', () => {
            const query = historySearch.value.toLowerCase();
            renderHistoryList(allHistory.filter(h =>
                h.title.toLowerCase().includes(query) ||
                h.preview.toLowerCase().includes(query)
            ));
        });

        function renderHistoryList(items) {
            if (items.length === 0) {
                historyList.innerHTML = '<div class="history-loading">No conversations found</div>';
                return;
            }
            historyList.innerHTML = items.map(item => {
                const date = new Date(item.timestamp);
                const timeAgo = formatTimeAgo(date);
                return '<div class="history-item" data-id="' + item.id + '">' +
                    '<div class="history-item-title">' + escapeHtml(item.title) + '</div>' +
                    '<div class="history-item-preview">' + escapeHtml(item.preview) + '</div>' +
                    '<div class="history-item-meta">' +
                        '<span>' + timeAgo + '</span>' +
                        '<span>' + item.messageCount + ' messages</span>' +
                    '</div>' +
                '</div>';
            }).join('');

            historyList.querySelectorAll('.history-item').forEach(item => {
                item.addEventListener('click', () => {
                    vscode.postMessage({ type: 'loadConversation', id: item.dataset.id });
                    historyModal.classList.add('hidden');
                });
            });
        }

        // Settings modal
        const openVSCodeSettings = document.getElementById('openVSCodeSettings');
        openVSCodeSettings.addEventListener('click', () => {
            vscode.postMessage({ type: 'openSettings' });
            settingsModal.classList.add('hidden');
        });

        // ═══════════════════════════════════════════
        // Input handling with slash and @ detection
        // ═══════════════════════════════════════════
        inputEl.addEventListener('keydown', (e) => {
            // Show slash commands on /
            if (e.key === '/' && inputEl.value === '') {
                slashModal.classList.remove('hidden');
            }
            // Show file picker on @
            if (e.key === '@' && (inputEl.value === '' || inputEl.value.endsWith(' '))) {
                e.preventDefault();
                fileModal.classList.remove('hidden');
                vscode.postMessage({ type: 'getFiles' });
            }
        });

        function formatTimeAgo(date) {
            const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
            if (seconds < 60) return 'just now';
            if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
            if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
            return Math.floor(seconds / 86400) + 'd ago';
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Auto-resize textarea
        inputEl.addEventListener('input', () => {
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';

            // @-mentions autocomplete
            checkForMentions();
        });

        // @-mentions state
        const mentionPopup = document.getElementById('mentionPopup');
        const mentionList = document.getElementById('mentionList');
        const mentionHeader = document.getElementById('mentionHeader');
        let mentionActive = false;
        let mentionStartPos = -1;
        let mentionSelectedIndex = 0;
        let mentionItems = [];

        // Cache for files/functions (populated on first @)
        let fileCache = [];
        let functionCache = [];

        function checkForMentions() {
            const text = inputEl.value;
            const cursorPos = inputEl.selectionStart;

            // Find @ before cursor
            const beforeCursor = text.substring(0, cursorPos);
            const atMatch = beforeCursor.match(/@([\\w./\\-]*)$/);

            if (atMatch) {
                mentionActive = true;
                mentionStartPos = cursorPos - atMatch[1].length - 1;
                const query = atMatch[1].toLowerCase();

                // Request file/function list if cache is empty
                if (fileCache.length === 0) {
                    vscode.postMessage({ type: 'getMentionItems' });
                }

                // Filter and show matches
                filterMentionItems(query);
            } else {
                hideMentionPopup();
            }
        }

        function filterMentionItems(query) {
            mentionItems = [];

            // Filter files
            const matchingFiles = fileCache
                .filter(f => f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query))
                .slice(0, 5);

            // Filter functions
            const matchingFunctions = functionCache
                .filter(f => f.name.toLowerCase().includes(query))
                .slice(0, 5);

            if (matchingFiles.length > 0) {
                mentionItems.push(...matchingFiles.map(f => ({ type: 'file', ...f })));
            }
            if (matchingFunctions.length > 0) {
                mentionItems.push(...matchingFunctions.map(f => ({ type: 'function', ...f })));
            }

            if (mentionItems.length > 0) {
                showMentionPopup();
            } else {
                hideMentionPopup();
            }
        }

        function showMentionPopup() {
            mentionList.innerHTML = '';
            mentionSelectedIndex = 0;

            mentionItems.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'mention-item' + (index === mentionSelectedIndex ? ' selected' : '');
                div.dataset.index = index;

                const icon = item.type === 'file' ? '📄' : '🔧';
                const name = item.name;
                const detail = item.type === 'file' ? item.path : (item.file + ':' + item.line);

                div.innerHTML =
                    '<span class="mention-item-icon">' + icon + '</span>' +
                    '<span class="mention-item-name">' + escapeHtml(name) + '</span>' +
                    '<span class="mention-item-detail">' + escapeHtml(detail) + '</span>';

                div.addEventListener('click', () => selectMention(index));
                div.addEventListener('mouseenter', () => {
                    mentionSelectedIndex = index;
                    updateMentionSelection();
                });

                mentionList.appendChild(div);
            });

            // Update header based on items
            const hasFiles = mentionItems.some(i => i.type === 'file');
            const hasFunctions = mentionItems.some(i => i.type === 'function');
            if (hasFiles && hasFunctions) {
                mentionHeader.textContent = 'Files & Functions';
            } else if (hasFiles) {
                mentionHeader.textContent = 'Files';
            } else {
                mentionHeader.textContent = 'Functions';
            }

            mentionPopup.classList.add('visible');
        }

        function hideMentionPopup() {
            mentionActive = false;
            mentionStartPos = -1;
            mentionPopup.classList.remove('visible');
        }

        function updateMentionSelection() {
            const items = mentionList.querySelectorAll('.mention-item');
            items.forEach((item, i) => {
                item.classList.toggle('selected', i === mentionSelectedIndex);
            });
        }

        function selectMention(index) {
            const item = mentionItems[index];
            if (!item) return;

            const text = inputEl.value;
            const before = text.substring(0, mentionStartPos);
            const after = text.substring(inputEl.selectionStart);

            // Insert the mention
            const mention = item.type === 'file'
                ? '@' + item.path
                : '@' + item.name + '(' + item.file + ':' + item.line + ')';

            inputEl.value = before + mention + ' ' + after;
            inputEl.selectionStart = inputEl.selectionEnd = before.length + mention.length + 1;
            inputEl.focus();

            hideMentionPopup();
        }

        // Handle mention items response from extension
        function handleMentionItems(data) {
            if (data.files) fileCache = data.files;
            if (data.functions) functionCache = data.functions;

            // Re-filter if mention is active
            if (mentionActive) {
                const text = inputEl.value;
                const cursorPos = inputEl.selectionStart;
                const beforeCursor = text.substring(0, cursorPos);
                const atMatch = beforeCursor.match(/@([\\w./\\-]*)$/);
                if (atMatch) {
                    filterMentionItems(atMatch[1].toLowerCase());
                }
            }
        }

        // Track processing state
        let isCurrentlyProcessing = false;

        // Send on Enter (Shift+Enter for newline)
        inputEl.addEventListener('keydown', (e) => {
            // Handle mention navigation
            if (mentionActive) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    mentionSelectedIndex = Math.min(mentionSelectedIndex + 1, mentionItems.length - 1);
                    updateMentionSelection();
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    mentionSelectedIndex = Math.max(mentionSelectedIndex - 1, 0);
                    updateMentionSelection();
                    return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    selectMention(mentionSelectedIndex);
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    hideMentionPopup();
                    return;
                }
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
            // Escape to stop processing
            if (e.key === 'Escape' && isCurrentlyProcessing) {
                e.preventDefault();
                stopProcessing();
            }
        });

        sendBtn.addEventListener('click', sendMessage);
        stopBtn.addEventListener('click', stopProcessing);

        function sendMessage() {
            const text = inputEl.value.trim();
            if (!text) return;

            if (isCurrentlyProcessing) {
                // Inject message into ongoing conversation
                addMessage('user', '↪ ' + text);  // Arrow indicates injection
                vscode.postMessage({ type: 'injectMessage', text });
            } else {
                // Build message with attachments
                let fullText = text;

                // Prepend file references if any files attached
                if (attachedFiles.length > 0) {
                    const fileRefs = attachedFiles.map(f => '@' + f).join(' ');
                    fullText = fileRefs + '\n\n' + text;
                }

                // Display with attachment indicator
                const displayText = attachedFiles.length > 0
                    ? '📎 ' + attachedFiles.length + ' file(s)\n' + text
                    : text;
                addMessage('user', displayText);

                vscode.postMessage({
                    type: 'sendMessage',
                    text: fullText,
                    files: attachedFiles.slice()
                });

                // Clear attachments after sending
                attachedFiles = [];
                attachedImages = [];
                updateAttachments();
            }

            inputEl.value = '';
            inputEl.style.height = 'auto';
        }

        function stopProcessing() {
            vscode.postMessage({ type: 'stopRequest' });
            addMessage('system', '⏹ Stopping...');
        }

        // Loading indicator functions
        let loadingIndicatorEl = null;

        function showLoadingIndicator(phase = 'thinking') {
            hideLoadingIndicator(); // Remove any existing
            loadingIndicatorEl = document.createElement('div');
            loadingIndicatorEl.className = 'loading-indicator';
            loadingIndicatorEl.id = 'loadingIndicator';
            loadingIndicatorEl.dataset.phase = phase;

            const phaseTexts = {
                connecting: 'Connecting to Claude...',
                thinking: 'Claude is thinking...',
                writing: 'Claude is writing...',
                tool: 'Executing tool...'
            };

            loadingIndicatorEl.innerHTML =
                '<span class="loading-icon"></span>' +
                '<span class="loading-text">' + (phaseTexts[phase] || phaseTexts.thinking) + '</span>' +
                '<div class="loading-status"><div class="loading-dots"><span></span><span></span><span></span></div></div>';
            messagesEl.appendChild(loadingIndicatorEl);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        function updateLoadingPhase(phase) {
            const indicator = document.getElementById('loadingIndicator');
            if (indicator) {
                indicator.dataset.phase = phase;
                const phaseTexts = {
                    connecting: 'Connecting to Claude...',
                    thinking: 'Claude is thinking...',
                    writing: 'Claude is writing...',
                    tool: 'Executing tool...'
                };
                const textEl = indicator.querySelector('.loading-text');
                if (textEl) {
                    textEl.textContent = phaseTexts[phase] || phaseTexts.thinking;
                }
            }
        }

        function hideLoadingIndicator() {
            const existing = document.getElementById('loadingIndicator');
            if (existing) {
                existing.remove();
            }
            loadingIndicatorEl = null;
        }

        // Ensure loading indicator is always at the bottom of messages
        function moveLoadingIndicatorToBottom() {
            const indicator = document.getElementById('loadingIndicator');
            if (indicator && messagesEl.lastElementChild !== indicator) {
                messagesEl.appendChild(indicator);
                messagesEl.scrollTop = messagesEl.scrollHeight;
            }
        }

        function addMessage(role, content) {
            const div = document.createElement('div');
            div.className = 'message ' + role;

            // REQ-012: Add formatted content with timestamp
            const timestamp = getTimestamp();
            div.innerHTML = formatContent(content) +
                '<div class="message-timestamp">' + timestamp + '</div>';

            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;

            state.messages.push({ role, content, timestamp });
            vscode.setState(state);
        }

        function formatContent(content, options = {}) {
            // REQ-012: Enhanced markdown rendering with XSS protection
            const { skipEscape = false, preserveHtml = false } = options;

            // Step 1: Escape HTML to prevent XSS (unless content is pre-sanitized)
            let text = skipEscape ? content : escapeHtml(content);

            // Step 2: Extract code blocks first to protect them from other formatting
            const codeBlocks = [];
            text = text.replace(/\`\`\`(\\w*)(\\n)?([\\s\\S]*?)\`\`\`/g, (match, lang, newline, code) => {
                const placeholder = '___CODEBLOCK_' + codeBlocks.length + '___';
                codeBlocks.push({ lang: lang || '', code: code.trim() });
                return placeholder;
            });

            // Step 3: Format inline code (before other formatting)
            text = text.replace(/\`([^\`]+)\`/g, '<code class="inline-code">$1</code>');

            // Step 4: Format bold and italic
            text = text.replace(/\\*\\*\\*([^*]+)\\*\\*\\*/g, '<strong><em>$1</em></strong>');
            text = text.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
            text = text.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
            text = text.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');
            text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
            text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

            // Step 5: Format links [text](url)
            text = text.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" class="md-link" onclick="handleLink(event, \\'$2\\')">$1</a>');

            // Step 6: Format headers (at start of line)
            text = text.replace(/(^|\\n)######\\s+(.+)/g, '$1<h6 class="md-h6">$2</h6>');
            text = text.replace(/(^|\\n)#####\\s+(.+)/g, '$1<h5 class="md-h5">$2</h5>');
            text = text.replace(/(^|\\n)####\\s+(.+)/g, '$1<h4 class="md-h4">$2</h4>');
            text = text.replace(/(^|\\n)###\\s+(.+)/g, '$1<h3 class="md-h3">$2</h3>');
            text = text.replace(/(^|\\n)##\\s+(.+)/g, '$1<h2 class="md-h2">$2</h2>');
            text = text.replace(/(^|\\n)#\\s+(.+)/g, '$1<h1 class="md-h1">$2</h1>');

            // Step 7: Format unordered lists (-, *, +)
            text = text.replace(/(^|\\n)[-*+]\\s+(.+)/g, '$1<li class="md-li">$2</li>');

            // Step 8: Format ordered lists (1., 2., etc.)
            text = text.replace(/(^|\\n)(\\d+)\\.\\s+(.+)/g, '$1<li class="md-li md-ol" value="$2">$2. $3</li>');

            // Step 9: Format blockquotes
            text = text.replace(/(^|\\n)>\\s+(.+)/g, '$1<blockquote class="md-quote">$2</blockquote>');

            // Step 10: Format horizontal rules
            text = text.replace(/(^|\\n)---+/g, '$1<hr class="md-hr">');

            // Step 10.5: Format markdown tables
            text = formatMarkdownTables(text);

            // Step 11: Format newlines to <br> (but clean up excessive breaks)
            text = text.replace(/\\n/g, '<br>');
            // Remove redundant <br> after block elements
            text = text.replace(/(<\\/h[1-6]>)<br>/gi, '$1');
            text = text.replace(/(<\\/li>)<br>/gi, '$1');
            text = text.replace(/(<\\/blockquote>)<br>/gi, '$1');
            text = text.replace(/(<hr[^>]*>)<br>/gi, '$1');
            text = text.replace(/(<\\/table>)<br>/gi, '$1');
            text = text.replace(/(<\\/div>)<br>/gi, '$1');
            // Remove multiple consecutive <br> tags
            text = text.replace(/(<br>){3,}/g, '<br><br>');

            // Step 12: Restore code blocks with syntax highlighting
            codeBlocks.forEach((block, i) => {
                const highlightedCode = highlightCode(block.code, block.lang);
                const langLabel = block.lang ? '<span class="code-lang">' + block.lang + '</span>' : '';
                const copyBtn = '<button class="code-copy-btn" onclick="copyCode(this)">Copy</button>';
                const codeHtml = '<div class="code-block">' +
                    '<div class="code-header">' + langLabel + copyBtn + '</div>' +
                    '<pre class="code-pre"><code class="code-content lang-' + (block.lang || 'text') + '">' + highlightedCode + '</code></pre>' +
                '</div>';
                text = text.replace('___CODEBLOCK_' + i + '___', codeHtml);
            });

            return text;
        }

        // Format markdown tables into HTML tables with styling
        function formatMarkdownTables(text) {
            // Match markdown table pattern:
            // | Header1 | Header2 | Header3 |
            // |---------|---------|---------|
            // | Cell1   | Cell2   | Cell3   |

            const lines = text.split('\\n');
            const result = [];
            let i = 0;

            while (i < lines.length) {
                const line = lines[i];

                // Check if this line looks like a table row (starts and ends with |)
                if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
                    // Look ahead to see if next line is a separator row
                    const nextLine = lines[i + 1];
                    if (nextLine && /^\\|[-:|\\s]+\\|$/.test(nextLine.trim())) {
                        // This is a table! Parse it
                        const tableLines = [];
                        let j = i;

                        // Collect all table rows
                        while (j < lines.length && lines[j].trim().startsWith('|') && lines[j].trim().endsWith('|')) {
                            tableLines.push(lines[j]);
                            j++;
                        }

                        if (tableLines.length >= 2) {
                            // Parse and convert to HTML table
                            const tableHtml = parseMarkdownTable(tableLines);
                            result.push(tableHtml);
                            i = j;
                            continue;
                        }
                    }
                }

                result.push(line);
                i++;
            }

            return result.join('\\n');
        }

        function parseMarkdownTable(lines) {
            if (lines.length < 2) return lines.join('\\n');

            try {
                // Parse header row
                const headerRow = lines[0];
                const headers = headerRow.split('|').filter(cell => cell.trim() !== '').map(cell => cell.trim());

                // Parse separator row to get alignment
                const separatorRow = lines[1];
                const separators = separatorRow.split('|').filter(cell => cell.trim() !== '');
                const alignments = separators.map(sep => {
                    const trimmed = sep.trim();
                    if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
                    if (trimmed.endsWith(':')) return 'right';
                    return 'left';
                });

                // Parse data rows
                const dataRows = [];
                for (let i = 2; i < lines.length; i++) {
                    const cells = lines[i].split('|').filter(cell => cell.trim() !== '').map(cell => cell.trim());
                    dataRows.push(cells);
                }

                // Build HTML table
                let html = '<table class="md-table">';

                // Header
                html += '<thead><tr>';
                headers.forEach((header, idx) => {
                    const align = alignments[idx] || 'left';
                    html += '<th style="text-align: ' + align + '">' + header + '</th>';
                });
                html += '</tr></thead>';

                // Body
                html += '<tbody>';
                dataRows.forEach(row => {
                    html += '<tr>';
                    row.forEach((cell, idx) => {
                        const align = alignments[idx] || 'left';
                        html += '<td style="text-align: ' + align + '">' + cell + '</td>';
                    });
                    // Fill in missing cells if row is shorter than headers
                    for (let k = row.length; k < headers.length; k++) {
                        html += '<td></td>';
                    }
                    html += '</tr>';
                });
                html += '</tbody>';

                html += '</table>';
                return html;

            } catch (e) {
                // If parsing fails, return original text
                return lines.join('\\n');
            }
        }

        // REQ-012: Basic syntax highlighting for common languages
        function highlightCode(code, lang) {
            // Escape HTML in code first
            let highlighted = escapeHtml(code);

            if (!lang) return highlighted;

            const langLower = lang.toLowerCase();

            // Common patterns for syntax highlighting
            if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(langLower)) {
                highlighted = highlightJS(highlighted);
            } else if (['python', 'py'].includes(langLower)) {
                highlighted = highlightPython(highlighted);
            } else if (['json'].includes(langLower)) {
                highlighted = highlightJSON(highlighted);
            } else if (['bash', 'sh', 'shell', 'zsh'].includes(langLower)) {
                highlighted = highlightBash(highlighted);
            } else if (['html', 'xml'].includes(langLower)) {
                highlighted = highlightHTML(highlighted);
            } else if (['css', 'scss', 'less'].includes(langLower)) {
                highlighted = highlightCSS(highlighted);
            }

            return highlighted;
        }

        function highlightJS(code) {
            // Keywords
            code = code.replace(/\\b(const|let|var|function|return|if|else|for|while|class|extends|import|export|from|async|await|try|catch|throw|new|this|super|static|get|set|typeof|instanceof|in|of|default|break|continue|switch|case|yield)\\b/g, '<span class="hl-keyword">$1</span>');
            // Strings (double and single quoted)
            code = code.replace(/(&quot;[^&]*&quot;|&#39;[^&]*&#39;)/g, '<span class="hl-string">$1</span>');
            // Template literals (backtick)
            code = code.replace(/(\`[^\`]*\`)/g, '<span class="hl-string">$1</span>');
            // Numbers
            code = code.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="hl-number">$1</span>');
            // Comments (single line)
            code = code.replace(/(\\/{2}.*)/g, '<span class="hl-comment">$1</span>');
            // Boolean and null
            code = code.replace(/\\b(true|false|null|undefined|NaN|Infinity)\\b/g, '<span class="hl-literal">$1</span>');
            return code;
        }

        function highlightPython(code) {
            // Keywords
            code = code.replace(/\\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|raise|with|in|is|not|and|or|True|False|None|lambda|yield|pass|break|continue|global|nonlocal|assert)\\b/g, '<span class="hl-keyword">$1</span>');
            // Strings
            code = code.replace(/(&quot;[^&]*&quot;|&#39;[^&]*&#39;)/g, '<span class="hl-string">$1</span>');
            // Numbers
            code = code.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="hl-number">$1</span>');
            // Comments
            code = code.replace(/(#.*)/g, '<span class="hl-comment">$1</span>');
            // Decorators
            code = code.replace(/(@\\w+)/g, '<span class="hl-decorator">$1</span>');
            return code;
        }

        function highlightJSON(code) {
            // Property names
            code = code.replace(/(&quot;\\w+&quot;)\\s*:/g, '<span class="hl-property">$1</span>:');
            // String values
            code = code.replace(/:[ ]*(&quot;[^&]*&quot;)/g, ': <span class="hl-string">$1</span>');
            // Numbers
            code = code.replace(/:\\s*(\\d+\\.?\\d*)/g, ': <span class="hl-number">$1</span>');
            // Boolean and null
            code = code.replace(/\\b(true|false|null)\\b/g, '<span class="hl-literal">$1</span>');
            return code;
        }

        function highlightBash(code) {
            // Comments
            code = code.replace(/(#.*)/g, '<span class="hl-comment">$1</span>');
            // Variables
            code = code.replace(/(\\$\\w+|\\$\\{[^}]+\\})/g, '<span class="hl-variable">$1</span>');
            // Strings
            code = code.replace(/(&quot;[^&]*&quot;|&#39;[^&]*&#39;)/g, '<span class="hl-string">$1</span>');
            // Common commands
            code = code.replace(/^(\\s*)(cd|ls|grep|find|sed|awk|cat|echo|npm|yarn|git|docker|curl|wget|chmod|chown|mkdir|rm|cp|mv|sudo)\\b/gm, '$1<span class="hl-keyword">$2</span>');
            return code;
        }

        function highlightHTML(code) {
            // Tags
            code = code.replace(/(&lt;\\/?)(\\w+)/g, '$1<span class="hl-tag">$2</span>');
            // Attributes
            code = code.replace(/(\\w+)=(&quot;)/g, '<span class="hl-attr">$1</span>=$2');
            // Attribute values
            code = code.replace(/=(&quot;[^&]*&quot;)/g, '=<span class="hl-string">$1</span>');
            return code;
        }

        function highlightCSS(code) {
            // Selectors (basic)
            code = code.replace(/([\\.#]?[\\w-]+)\\s*\\{/g, '<span class="hl-selector">$1</span> {');
            // Properties
            code = code.replace(/(\\w[\\w-]*)\\s*:/g, '<span class="hl-property">$1</span>:');
            // Values with units
            code = code.replace(/:\\s*(\\d+)(px|em|rem|%|vh|vw)/g, ': <span class="hl-number">$1</span><span class="hl-unit">$2</span>');
            // Colors
            code = code.replace(/(#[0-9a-fA-F]{3,8})\\b/g, '<span class="hl-color">$1</span>');
            return code;
        }

        // Helper for copying code
        function copyCode(btn) {
            const codeBlock = btn.closest('.code-block');
            const code = codeBlock.querySelector('.code-content').textContent;
            navigator.clipboard.writeText(code).then(() => {
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
            });
        }
        window.copyCode = copyCode;

        // Helper for handling links
        function handleLink(event, url) {
            event.preventDefault();
            // Check if it's a file reference (path-like)
            if (url.match(/^[\\w\\/\\\\.-]+\\.(ts|js|py|json|md|txt|html|css)$/i) || url.startsWith('./') || url.startsWith('../')) {
                vscode.postMessage({ type: 'openFile', path: url });
            } else if (url.startsWith('http://') || url.startsWith('https://')) {
                vscode.postMessage({ type: 'openExternal', url: url });
            } else {
                // Could be a local file path
                vscode.postMessage({ type: 'openFile', path: url });
            }
        }
        window.handleLink = handleLink;

        function updateTodos(todos) {
            if (!todos || todos.length === 0) {
                todoPanel.classList.add('hidden');
                return;
            }

            todoPanel.classList.remove('hidden');

            const completed = todos.filter(t => t.status === 'completed').length;
            todoProgress.textContent = completed + '/' + todos.length;

            todoList.innerHTML = todos.map(todo => {
                const icon = todo.status === 'completed' ? '✅' :
                             todo.status === 'in_progress' ? '🔄' : '⏳';
                return '<div class="todo-item ' + todo.status + '">' + icon + ' ' + todo.content + '</div>';
            }).join('');
        }

        function showQuestion(question) {
            currentQuestion = question;
            selectedOptions = [];
            otherText = '';

            questionPanel.classList.remove('hidden');

            // Show header badge if present
            const badgeHtml = question.header ? '<div class="question-badge">' + question.header + '</div>' : '';
            questionHeader.innerHTML = badgeHtml + '<div>' + question.question + '</div>';

            const type = question.multiSelect ? 'checkbox' : 'radio';

            // Build options HTML including "Other"
            let optionsHtml = question.options.map((opt, i) => {
                return '<label class="question-option" data-index="' + i + '">' +
                    '<input type="' + type + '" name="answer" value="' + i + '">' +
                    '<div class="option-content">' +
                        '<div class="option-label">' + opt.label + '</div>' +
                        '<div class="option-description">' + (opt.description || '') + '</div>' +
                    '</div>' +
                '</label>';
            }).join('');

            // Add "Other" option
            optionsHtml += '<div class="other-option" data-index="other">' +
                '<input type="' + type + '" name="answer" value="other">' +
                '<span>Other:</span>' +
                '<input type="text" class="other-input" placeholder="Type your answer...">' +
            '</div>';

            questionOptions.innerHTML = optionsHtml;

            // Handle regular option selection
            questionOptions.querySelectorAll('.question-option').forEach(opt => {
                opt.addEventListener('click', (e) => {
                    const index = parseInt(opt.dataset.index);
                    const otherOpt = questionOptions.querySelector('.other-option');

                    if (question.multiSelect) {
                        if (selectedOptions.includes(index)) {
                            selectedOptions = selectedOptions.filter(i => i !== index);
                            opt.classList.remove('selected');
                        } else {
                            selectedOptions.push(index);
                            opt.classList.add('selected');
                        }
                    } else {
                        questionOptions.querySelectorAll('.question-option').forEach(o => o.classList.remove('selected'));
                        otherOpt.classList.remove('selected');
                        opt.classList.add('selected');
                        selectedOptions = [index];
                        otherText = '';
                    }
                });
            });

            // Handle "Other" option
            const otherOpt = questionOptions.querySelector('.other-option');
            const otherInput = otherOpt.querySelector('.other-input');

            otherOpt.addEventListener('click', (e) => {
                if (e.target === otherInput) return;

                if (!question.multiSelect) {
                    questionOptions.querySelectorAll('.question-option').forEach(o => o.classList.remove('selected'));
                    selectedOptions = [];
                }
                otherOpt.classList.add('selected');
                otherInput.focus();
            });

            otherInput.addEventListener('input', (e) => {
                otherText = e.target.value;
                if (otherText && !otherOpt.classList.contains('selected')) {
                    if (!question.multiSelect) {
                        questionOptions.querySelectorAll('.question-option').forEach(o => o.classList.remove('selected'));
                        selectedOptions = [];
                    }
                    otherOpt.classList.add('selected');
                }
            });
        }

        submitAnswer.addEventListener('click', () => {
            const otherOpt = questionOptions.querySelector('.other-option');
            const hasOther = otherOpt && otherOpt.classList.contains('selected') && otherText.trim();

            if (selectedOptions.length === 0 && !hasOther) return;

            let answers = selectedOptions.map(i => currentQuestion.options[i].label);

            // Add "Other" answer if selected
            if (hasOther) {
                answers.push('Other: ' + otherText.trim());
            }

            vscode.postMessage({
                type: 'answerQuestion',
                toolUseId: currentQuestion.toolUseId,
                answers: currentQuestion.multiSelect ? answers : answers[0]
            });

            questionPanel.classList.add('hidden');
            currentQuestion = null;
        });

        function updateRouting(tier) {
            const dot = routingIndicator.querySelector('.indicator-dot');
            const text = routingIndicator.querySelector('.indicator-text');

            dot.className = 'indicator-dot ' + tier;
            if (tier !== 'idle') {
                dot.classList.add('active');
            }

            switch (tier) {
                case 'fast':
                    text.textContent = 'Groq';
                    break;
                case 'standard':
                    text.textContent = 'Claude';
                    break;
                case 'deep':
                    text.textContent = 'Draagon';
                    break;
                default:
                    text.textContent = 'Ready';
            }
        }

        // Plan mode toggle
        function updatePlanMode(active) {
            if (active) {
                planModeBadge.classList.remove('hidden');
            } else {
                planModeBadge.classList.add('hidden');
            }
        }

        // Background agents management
        function updateBackgroundAgents(agents) {
            backgroundAgents = agents || [];

            if (backgroundAgents.length === 0) {
                backgroundAgentsPanel.classList.add('hidden');
                return;
            }

            backgroundAgentsPanel.classList.remove('hidden');
            agentsCount.textContent = backgroundAgents.length;

            agentsList.innerHTML = backgroundAgents.map(agent => {
                const statusIcon = agent.status === 'running' ? '⚙️' :
                                   agent.status === 'completed' ? '✅' : '❌';
                const elapsed = agent.status === 'running' ?
                    Math.round((Date.now() - agent.startTime) / 1000) + 's' : '';
                return '<div class="agent-item ' + agent.status + '">' +
                    '<span class="agent-status">' + statusIcon + '</span>' +
                    '<span class="agent-desc">' + agent.description + '</span>' +
                    (elapsed ? '<span class="agent-time">' + elapsed + '</span>' : '') +
                '</div>';
            }).join('');
        }

        // Image display helper
        function addImage(src, alt, caption) {
            const div = document.createElement('div');
            div.className = 'message assistant';

            let html = '<img class="message-image" src="' + src + '" alt="' + (alt || 'Image') + '" onclick="vscode.postMessage({type:\\'openImage\\', src:\\'' + src + '\\'})">';
            if (caption) {
                html += '<div class="image-caption">' + caption + '</div>';
            }
            div.innerHTML = html;

            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        // REQ-012: Enhanced tool use display with collapsible sections
        function addToolUseMessage(toolName, toolInput, toolUseId) {
            const div = document.createElement('div');
            div.className = 'message tool-container';
            div.dataset.toolUseId = toolUseId;

            const toolIcons = {
                'Read': '📖',
                'Write': '✏️',
                'Edit': '📝',
                'Bash': '💻',
                'Glob': '🔍',
                'Grep': '🔎',
                'Task': '📋',
                'WebFetch': '🌐',
                'WebSearch': '🔍',
                'TodoWrite': '✅',
                'AskUserQuestion': '❓',
                'EnterPlanMode': '📋',
                'ExitPlanMode': '✅'
            };
            const icon = toolIcons[toolName] || '🔧';

            // Format input for display
            const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput, null, 2);
            const preview = inputStr.length > 80 ? inputStr.substring(0, 80) + '...' : inputStr;

            div.innerHTML = '<div class="tool-block">' +
                '<div class="tool-header">' +
                    '<div class="tool-name">' +
                        '<span class="tool-icon">' + icon + '</span>' +
                        '<span>' + escapeHtml(toolName) + '</span>' +
                        '<span style="color: var(--text-secondary); font-weight: normal; font-size: 12px;">' + escapeHtml(preview) + '</span>' +
                    '</div>' +
                    '<span class="tool-expand">▼</span>' +
                '</div>' +
                '<div class="tool-content">' +
                    '<pre class="tool-input">' + escapeHtml(inputStr) + '</pre>' +
                '</div>' +
            '</div>';

            // Add click handler for toggle (CSP blocks inline onclick)
            const header = div.querySelector('.tool-header');
            header.addEventListener('click', function() {
                this.parentElement.classList.toggle('expanded');
            });

            messagesEl.appendChild(div);
            moveLoadingIndicatorToBottom();
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        // REQ-012: Enhanced error display with categorization
        function addErrorMessage(errorText, errorDetails) {
            const div = document.createElement('div');
            div.className = 'message error-container';

            // Categorize error
            let errorType = 'Error';
            let errorTypeClass = 'error';
            let errorIcon = '❌';
            let suggestion = '';
            let showRetry = false;
            let details = '';

            if (errorText.includes('rate limit') || errorText.includes('429')) {
                errorType = 'Rate Limit';
                errorTypeClass = 'rate-limit';
                errorIcon = '⏳';
                suggestion = 'Wait a moment before trying again. Consider using a simpler query.';
                showRetry = true;
            } else if (errorText.includes('timeout') || errorText.includes('timed out')) {
                errorType = 'Timeout';
                errorTypeClass = 'timeout';
                errorIcon = '⏱️';
                suggestion = 'The request took too long. Try breaking your request into smaller parts.';
                showRetry = true;
            } else if (errorText.includes('network') || errorText.includes('connection') || errorText.includes('ECONNREFUSED')) {
                errorType = 'Network';
                errorTypeClass = 'network';
                errorIcon = '🌐';
                suggestion = 'Check your internet connection. Make sure Claude CLI is properly installed.';
                showRetry = true;
            } else if (errorText.includes('permission') || errorText.includes('denied') || errorText.includes('401') || errorText.includes('403')) {
                errorType = 'Permission';
                errorIcon = '🔒';
                suggestion = 'Authentication required. Check your API key or login status.';
            } else if (errorText.includes('not found') || errorText.includes('404')) {
                errorType = 'Not Found';
                errorIcon = '🔍';
                suggestion = 'The requested resource could not be found.';
            } else if (errorText.includes('validation') || errorText.includes('invalid')) {
                errorType = 'Validation';
                errorIcon = '⚠️';
                suggestion = 'Check your input and try again.';
            } else if (errorText.includes('cancelled') || errorText.includes('stopped')) {
                errorType = 'Cancelled';
                errorIcon = '🛑';
            }

            // Extract stack trace or additional details if present
            const stackMatch = errorText.match(/\\n(at .+)/s);
            if (stackMatch) {
                details = stackMatch[1];
                errorText = errorText.replace(stackMatch[0], '');
            }

            const errorBlock = document.createElement('div');
            errorBlock.className = 'error-block';
            errorBlock.dataset.type = errorTypeClass;

            errorBlock.innerHTML =
                '<div class="error-header">' +
                    '<span class="error-icon">' + errorIcon + '</span>' +
                    '<span class="error-type">' + errorType + '</span>' +
                '</div>' +
                '<div class="error-message">' + escapeHtml(errorText) + '</div>' +
                (suggestion ? '<div class="error-suggestion">💡 ' + suggestion + '</div>' : '') +
                (details ? '<div class="error-details">' + escapeHtml(details) + '</div>' : '');

            if (showRetry) {
                const retryBtn = document.createElement('button');
                retryBtn.className = 'error-retry-btn';
                retryBtn.textContent = '🔄 Retry';
                retryBtn.addEventListener('click', () => {
                    vscode.postMessage({ type: 'retryLastMessage' });
                });
                errorBlock.appendChild(retryBtn);
            }

            div.appendChild(errorBlock);
            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        // REQ-012: Enhanced thinking display with collapsible sections
        function addThinkingMessage(thinkingText) {
            const div = document.createElement('div');
            div.className = 'message thinking-container';

            // Preview first 100 chars
            const preview = thinkingText.length > 100 ? thinkingText.substring(0, 100) + '...' : thinkingText;

            div.innerHTML = '<div class="thinking-block">' +
                '<div class="thinking-header">' +
                    '<div class="thinking-title">' +
                        '<span>💭</span>' +
                        '<span>Thinking...</span>' +
                    '</div>' +
                    '<span class="thinking-expand">▼</span>' +
                '</div>' +
                '<div class="thinking-content">' + formatContent(thinkingText) + '</div>' +
            '</div>';

            // Add click handler for toggle (CSP blocks inline onclick)
            const header = div.querySelector('.thinking-header');
            header.addEventListener('click', function() {
                this.parentElement.classList.toggle('expanded');
            });

            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        // REQ-012: Add timestamp to messages
        function getTimestamp() {
            const now = new Date();
            return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        // Display tool execution result (Bash output, file content, etc.)
        function addToolResultMessage(toolUseId, content, isError) {
            // Find the tool use message with this ID and append result
            const toolContainer = document.querySelector('[data-tool-use-id="' + toolUseId + '"]');
            if (toolContainer) {
                const resultDiv = document.createElement('div');
                resultDiv.className = 'tool-result' + (isError ? ' error' : '');

                // Calculate content stats
                const lines = content.split('\\n').length;
                const chars = content.length;
                const truncateThreshold = 2000;
                const needsTruncation = chars > truncateThreshold;

                // Store full content for expansion
                resultDiv.dataset.fullContent = content;

                // Show truncated preview if content is long
                const displayContent = needsTruncation
                    ? content.substring(0, truncateThreshold)
                    : content;

                resultDiv.innerHTML =
                    '<pre class="tool-result-content">' + escapeHtml(displayContent) + '</pre>' +
                    (needsTruncation ?
                        '<button class="tool-result-expand">' +
                            '<span>📄</span>' +
                            '<span>Show ' + (chars - truncateThreshold).toLocaleString() + ' more characters</span>' +
                        '</button>' : '') +
                    '<div class="tool-result-stats">' +
                        '<span class="tool-result-stat">📊 ' + lines.toLocaleString() + ' lines</span>' +
                        '<span class="tool-result-stat">📝 ' + chars.toLocaleString() + ' chars</span>' +
                    '</div>';

                // Add expand/collapse functionality
                if (needsTruncation) {
                    resultDiv.classList.add('collapsed');
                    const expandBtn = resultDiv.querySelector('.tool-result-expand');
                    expandBtn.addEventListener('click', function() {
                        const isCollapsed = resultDiv.classList.contains('collapsed');
                        if (isCollapsed) {
                            // Show full content
                            resultDiv.querySelector('.tool-result-content').textContent = resultDiv.dataset.fullContent;
                            resultDiv.classList.remove('collapsed');
                            this.querySelector('span:last-child').textContent = 'Show less';
                        } else {
                            // Show truncated content
                            resultDiv.querySelector('.tool-result-content').textContent = displayContent;
                            resultDiv.classList.add('collapsed');
                            this.querySelector('span:last-child').textContent = 'Show ' + (chars - truncateThreshold).toLocaleString() + ' more characters';
                        }
                    });
                }

                const toolBlock = toolContainer.querySelector('.tool-block');
                if (toolBlock) {
                    toolBlock.appendChild(resultDiv);
                    // Auto-expand if there's a result
                    toolBlock.classList.add('expanded');
                }
            }
        }

        // Display background agent/Task started
        function addAgentMessage(agentId, description, subagentType) {
            const div = document.createElement('div');
            div.className = 'message agent-container';
            div.dataset.agentId = agentId;

            const typeIcons = {
                'general-purpose': '🤖',
                'Explore': '🔍',
                'Plan': '📋',
                'claude-code-guide': '📚'
            };
            const icon = typeIcons[subagentType] || '🤖';

            div.innerHTML = '<div class="agent-block">' +
                '<div class="agent-header">' +
                    '<span class="agent-icon">' + icon + '</span>' +
                    '<span class="agent-type">' + escapeHtml(subagentType) + '</span>' +
                    '<span class="agent-status running">Running...</span>' +
                '</div>' +
                '<div class="agent-description">' + escapeHtml(description) + '</div>' +
            '</div>';

            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        // Handle messages from extension
        window.addEventListener('message', (event) => {
            const message = event.data;

            switch (message.type) {
                case 'ready':
                    updateRouting('idle');
                    console.log('Chat ready');
                    break;
                case 'addMessage':
                    addMessage(message.role, message.content);
                    break;
                case 'userMessage':
                    addMessage('user', message.data);
                    break;
                case 'output':
                    updateLoadingPhase('writing'); // Claude is responding, keep indicator but update phase
                    addMessage('assistant', message.data);
                    break;
                case 'thinking':
                    updateLoadingPhase('thinking'); // Claude is thinking
                    // REQ-012: Enhanced collapsible thinking display
                    addThinkingMessage(message.data);
                    break;
                case 'error':
                    hideLoadingIndicator();
                    // REQ-012: Enhanced error categorization
                    addErrorMessage(message.data);
                    break;
                case 'setProcessing':
                    isCurrentlyProcessing = message.data?.isProcessing;
                    if (isCurrentlyProcessing) {
                        inputContainerEl.classList.add('processing');
                        inputEl.placeholder = 'Type to inject message into conversation... (Escape to stop)';
                        showLoadingIndicator('connecting');
                    } else {
                        inputContainerEl.classList.remove('processing');
                        inputEl.placeholder = 'Ask Draagon anything... (/ for commands, @ for files)';
                        hideLoadingIndicator();
                    }
                    updateRouting(isCurrentlyProcessing ? 'standard' : 'idle');
                    break;
                case 'toolUse':
                    updateLoadingPhase('tool'); // Claude is using a tool
                    // REQ-012: Enhanced collapsible tool use display
                    addToolUseMessage(message.data.toolName, message.data.toolInput, message.data.toolUseId);
                    break;
                case 'toolResult':
                    // Display tool execution results (Bash output, Read content, etc.)
                    addToolResultMessage(message.data.toolUseId, message.data.content, message.data.isError);
                    break;
                case 'agentStarted':
                    // Track background agent/Task tool
                    addAgentMessage(message.data.id, message.data.description, message.data.subagentType);
                    break;
                case 'userQuestion':
                    showQuestion({ ...message.data.questions[0], toolUseId: message.data.toolUseId });
                    break;
                case 'planModeChanged':
                    updatePlanMode(message.data?.active);
                    break;
                case 'addImage':
                    addImage(message.src, message.alt, message.caption);
                    break;
                case 'updateTodos':
                    updateTodos(message.todos);
                    break;
                case 'showQuestion':
                    showQuestion(message.question);
                    break;
                case 'updateRouting':
                    updateRouting(message.tier);
                    break;
                case 'updateMemoryStatus':
                    memoryStatus.textContent = 'Memory: ' + (message.connected ? 'Connected' : 'Disconnected');
                    memoryStatus.classList.toggle('connected', message.connected);
                    break;
                case 'updatePlanMode':
                    updatePlanMode(message.active);
                    break;
                case 'updateBackgroundAgents':
                    updateBackgroundAgents(message.agents);
                    break;
                case 'updateCheckpoints':
                    updateCheckpoints(message);
                    break;
                case 'checkpointCreated':
                    addMessage('system', '✅ Checkpoint created: ' + message.description);
                    checkpointCount.textContent = message.count;
                    break;
                case 'checkpointRestored':
                    addMessage('system', '🔄 Restored to checkpoint: ' + message.description);
                    break;
                case 'clearMessages':
                    messagesEl.innerHTML = '';
                    state.messages = [];
                    vscode.setState(state);
                    break;
                case 'updateFiles':
                    allFiles = message.files || [];
                    renderFileList(allFiles);
                    break;
                case 'mentionItems':
                    handleMentionItems(message.data);
                    break;
                case 'updateCommands':
                    allCommands = message.commands || [];
                    renderSlashCommands(allCommands);
                    break;
                case 'updateHistory':
                    allHistory = message.conversations || [];
                    renderHistoryList(allHistory);
                    break;
                case 'updateTokens':
                    if (message.tokens) {
                        tokenUsage.textContent = message.tokens.input.toLocaleString() + ' in / ' + message.tokens.output.toLocaleString() + ' out';
                        if (message.cost) {
                            tokenUsage.textContent += ' ($' + message.cost.toFixed(4) + ')';
                        }
                    }
                    break;
                case 'imageAttached':
                    addImageAttachment(message.src, message.name);
                    break;
                case 'updateModel':
                    currentModel = message.model;
                    const modelNames = {
                        'claude-sonnet-4': 'Claude Sonnet',
                        'claude-opus-4': 'Claude Opus',
                        'claude-haiku-3.5': 'Claude Haiku'
                    };
                    currentModelEl.textContent = modelNames[currentModel] || currentModel;
                    break;
                case 'updateThinkingMode':
                    currentThinkingMode = message.mode;
                    const modeLabels = {
                        'default': 'Think',
                        'think': 'Think',
                        'thinkHard': 'Think Hard',
                        'thinkHarder': 'Think Harder',
                        'ultrathink': 'Ultrathink'
                    };
                    thinkingModeLabel.textContent = modeLabels[currentThinkingMode];
                    thinkingModeToggle.classList.toggle('active', currentThinkingMode !== 'default');
                    break;

                // REQ-001: Permission requests
                case 'permissionRequest':
                    showPermissionDialog(message.data);
                    break;

                // REQ-002: Diff results
                case 'diffResult':
                    renderDiff(message.data);
                    break;

                // REQ-004: Token updates
                case 'tokenUpdate':
                    updateTokenDisplay(message.data);
                    break;

                // REQ-005: History with grouping
                case 'historyData':
                    renderGroupedHistory(message.conversations);
                    break;

                case 'conversationDeleted':
                    // Refresh history list after deletion
                    vscode.postMessage({ type: 'getHistory' });
                    break;

                // REQ-003: Image attachment confirmations
                case 'imageAttachmentAdded':
                    attachedImages.push({
                        id: message.id,
                        src: message.src,
                        name: message.name
                    });
                    updateImageAttachments();
                    break;

                case 'imageAttachmentRemoved':
                    attachedImages = attachedImages.filter(img => img.id !== message.id);
                    updateImageAttachments();
                    break;

                // Context compaction response
                case 'contextCompacted':
                    contextUsageBtn.classList.remove('compacting');
                    if (message.success) {
                        totalContextTokens = message.newTokenCount || 0;
                        updateContextUsage();
                        addMessage('system', '✨ Context compacted: ' + message.summary);
                    } else {
                        contextText.textContent = currentContextUsage + '%';
                        addMessage('error', 'Failed to compact context: ' + (message.error || 'Unknown error'));
                    }
                    break;

                // Update max context based on model
                case 'updateMaxContext':
                    maxContextTokens = message.maxTokens || 200000;
                    updateContextUsage();
                    break;
            }
        });

        // REQ-003: Update image attachments display
        function updateImageAttachments() {
            if (attachedFiles.length === 0 && attachedImages.length === 0) {
                inputAttachments.classList.add('hidden');
                return;
            }

            inputAttachments.classList.remove('hidden');
            inputAttachments.innerHTML = '';

            // File attachments
            attachedFiles.forEach((file, i) => {
                const name = file.split('/').pop();
                const chip = document.createElement('div');
                chip.className = 'attachment-chip';
                chip.innerHTML = '📄 ' + escapeHtml(name) + '<button class="remove-btn" data-type="file" data-index="' + i + '">×</button>';
                inputAttachments.appendChild(chip);
            });

            // Image attachments with preview
            attachedImages.forEach((img, i) => {
                const chip = document.createElement('div');
                chip.className = 'image-attachment';
                chip.innerHTML = '<img class="image-preview" src="' + img.src + '" alt="' + escapeHtml(img.name) + '">' +
                    '<span class="image-name">' + escapeHtml(img.name) + '</span>' +
                    '<button class="remove-btn" data-type="image" data-id="' + (img.id || i) + '">×</button>';
                inputAttachments.appendChild(chip);
            });

            // Add remove handlers
            inputAttachments.querySelectorAll('.remove-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const type = btn.dataset.type;
                    if (type === 'file') {
                        const index = parseInt(btn.dataset.index);
                        attachedFiles.splice(index, 1);
                        updateImageAttachments();
                    } else {
                        const id = btn.dataset.id;
                        vscode.postMessage({ type: 'removeImage', data: { id } });
                    }
                });
            });
        }

        // Restore messages from state
        state.messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = 'message ' + msg.role;
            div.innerHTML = formatContent(msg.content);
            messagesEl.appendChild(div);
        });
    `;
}
