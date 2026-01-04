import * as vscode from 'vscode';

export function getWebviewContent(
    webview: vscode.Webview,
    _extensionUri: vscode.Uri
): string {
    const nonce = getNonce();

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
                <span class="logo">🐉</span>
                <span class="title">Draagon AI</span>
                <span class="version" id="version">v0.0.1</span>
                <span class="plan-mode-badge hidden" id="planModeBadge">📋 Plan Mode</span>
            </div>
            <div class="header-right">
                <span class="routing-indicator" id="routingIndicator">
                    <span class="indicator-dot"></span>
                    <span class="indicator-text">Ready</span>
                </span>
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
            <div class="input-container">
                <textarea
                    id="input"
                    placeholder="Ask Draagon anything..."
                    rows="1"
                ></textarea>
                <button id="sendBtn" class="send-btn" title="Send message">
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                </button>
            </div>
            <div class="footer-info">
                <span class="memory-status" id="memoryStatus">Memory: Disconnected</span>
                <button class="checkpoint-btn" id="checkpointBtn" title="View checkpoints">
                    <span class="checkpoint-icon">⏱️</span>
                    <span class="checkpoint-count" id="checkpointCount">0</span>
                </button>
                <span class="model-info" id="modelInfo"></span>
            </div>
        </footer>
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

        .logo {
            font-size: 20px;
        }

        .title {
            font-weight: 600;
        }

        .version {
            font-size: 11px;
            color: var(--text-secondary);
            background: var(--bg-primary);
            padding: 2px 6px;
            border-radius: 4px;
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
            background: #888;
        }

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
            padding: 12px;
        }

        .message {
            margin-bottom: 16px;
            padding: 12px;
            border-radius: 8px;
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
    `;
}

function getScript(): string {
    return `
        const vscode = acquireVsCodeApi();
        const state = vscode.getState() || { messages: [] };

        const messagesEl = document.getElementById('messages');
        const inputEl = document.getElementById('input');
        const sendBtn = document.getElementById('sendBtn');
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

        let currentQuestion = null;
        let selectedOptions = [];
        let otherText = '';
        let backgroundAgents = [];
        let checkpoints = [];

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
        });

        // Send on Enter (Shift+Enter for newline)
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        sendBtn.addEventListener('click', sendMessage);

        function sendMessage() {
            const text = inputEl.value.trim();
            if (!text) return;

            addMessage('user', text);
            vscode.postMessage({ type: 'sendMessage', text });

            inputEl.value = '';
            inputEl.style.height = 'auto';
        }

        function addMessage(role, content) {
            const div = document.createElement('div');
            div.className = 'message ' + role;
            div.innerHTML = formatContent(content);
            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;

            state.messages.push({ role, content });
            vscode.setState(state);
        }

        function formatContent(content) {
            // Simple markdown-like formatting
            return content
                .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre>$1</pre>')
                .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
                .replace(/\\n/g, '<br>');
        }

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

        // Handle messages from extension
        window.addEventListener('message', (event) => {
            const message = event.data;

            switch (message.type) {
                case 'addMessage':
                    addMessage(message.role, message.content);
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
            }
        });

        // Restore messages from state
        state.messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = 'message ' + msg.role;
            div.innerHTML = formatContent(msg.content);
            messagesEl.appendChild(div);
        });
    `;
}
