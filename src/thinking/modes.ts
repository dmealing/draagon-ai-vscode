import * as vscode from 'vscode';

export type ThinkingMode = 'default' | 'think' | 'thinkHard' | 'thinkHarder' | 'ultrathink';

export interface ThinkingModeConfig {
    id: ThinkingMode;
    label: string;
    emoji: string;
    instruction: string | null;
    description: string;
}

export const THINKING_MODES: ThinkingModeConfig[] = [
    {
        id: 'default',
        label: 'Default',
        emoji: '🧠',
        instruction: null,
        description: 'Standard reasoning mode'
    },
    {
        id: 'think',
        label: 'Think',
        emoji: '🤔',
        instruction: 'Think step by step before responding.',
        description: 'Extended thinking for better reasoning'
    },
    {
        id: 'thinkHard',
        label: 'Think Hard',
        emoji: '💭',
        instruction: 'Think very carefully, considering multiple approaches before responding. Break down the problem systematically.',
        description: 'More thorough analysis with multiple perspectives'
    },
    {
        id: 'thinkHarder',
        label: 'Think Harder',
        emoji: '🧩',
        instruction: 'Engage in deep, multi-step reasoning. Consider edge cases, alternative solutions, and potential issues. Validate your reasoning before responding.',
        description: 'Deep multi-step reasoning with validation'
    },
    {
        id: 'ultrathink',
        label: 'Ultrathink',
        emoji: '🔮',
        instruction: 'Use maximum reasoning depth. Break down the problem systematically into components. Consider all implications, edge cases, and alternative approaches. Verify each step of your reasoning. Challenge your own assumptions. Only respond after thorough analysis.',
        description: 'Maximum reasoning depth with thorough analysis'
    }
];

export class ThinkingModeManager {
    private currentMode: ThinkingMode = 'default';
    private _onModeChange = new vscode.EventEmitter<ThinkingMode>();
    public readonly onModeChange = this._onModeChange.event;
    private _context?: vscode.ExtensionContext;

    /**
     * Create a ThinkingModeManager.
     * @param context Optional ExtensionContext for persisting mode. If not provided, mode is not persisted.
     */
    constructor(context?: vscode.ExtensionContext) {
        this._context = context;
        // Load saved mode if context is available
        this.currentMode = context?.workspaceState.get<ThinkingMode>('thinkingMode', 'default') ?? 'default';
    }

    /**
     * Get current thinking mode
     */
    public getMode(): ThinkingMode {
        return this.currentMode;
    }

    /**
     * Get current mode configuration
     */
    public getModeConfig(): ThinkingModeConfig {
        return THINKING_MODES.find(m => m.id === this.currentMode) || THINKING_MODES[0];
    }

    /**
     * Set thinking mode
     */
    public setMode(mode: ThinkingMode): void {
        this.currentMode = mode;
        this._context?.workspaceState.update('thinkingMode', mode);
        this._onModeChange.fire(mode);
    }

    /**
     * Get all available modes
     */
    public getModes(): ThinkingModeConfig[] {
        return THINKING_MODES;
    }

    /**
     * Get instruction to prepend to user message
     */
    public getInstruction(): string | null {
        const config = this.getModeConfig();
        return config.instruction;
    }

    /**
     * Wrap user message with thinking instruction
     */
    public wrapMessage(message: string): string {
        const instruction = this.getInstruction();
        if (!instruction) {
            return message;
        }
        return `${instruction}\n\n${message}`;
    }

    /**
     * Show mode selection quick pick
     */
    public async showModePicker(): Promise<ThinkingMode | undefined> {
        const items = THINKING_MODES.map(mode => ({
            label: `${mode.emoji} ${mode.label}`,
            description: mode.description,
            picked: mode.id === this.currentMode,
            mode: mode.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select thinking intensity',
            title: 'Thinking Mode'
        });

        if (selected) {
            this.setMode(selected.mode);
            return selected.mode;
        }

        return undefined;
    }

    /**
     * Get HTML for mode selector
     */
    public getModeSelectorHtml(): string {
        const options = THINKING_MODES.map(mode => {
            const selected = mode.id === this.currentMode ? 'selected' : '';
            return `<option value="${mode.id}" ${selected}>${mode.emoji} ${mode.label}</option>`;
        }).join('\n');

        return `
<select id="thinking-mode" class="thinking-selector" title="Thinking Mode">
    ${options}
</select>`;
    }

    /**
     * Cycle to next mode
     */
    public nextMode(): ThinkingMode {
        const currentIndex = THINKING_MODES.findIndex(m => m.id === this.currentMode);
        const nextIndex = (currentIndex + 1) % THINKING_MODES.length;
        const nextMode = THINKING_MODES[nextIndex].id;
        this.setMode(nextMode);
        return nextMode;
    }

    /**
     * Get status bar text for current mode
     */
    public getStatusText(): string {
        const config = this.getModeConfig();
        return `${config.emoji} ${config.label}`;
    }

    public dispose(): void {
        this._onModeChange.dispose();
    }
}
