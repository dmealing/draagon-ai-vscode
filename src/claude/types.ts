// Claude Code CLI message types

export interface ClaudeMessage {
    type: 'assistant' | 'user' | 'system' | 'result';
    message?: AssistantMessage;
    tool_use_id?: string;
    content?: string;
}

export interface AssistantMessage {
    id: string;
    type: 'message';
    role: 'assistant';
    content: ContentBlock[];
    model: string;
    stop_reason: string | null;
    stop_sequence: string | null;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface TextBlock {
    type: 'text';
    text: string;
}

export interface ToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
}

export interface ToolResultBlock {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

// AskUserQuestion tool types
export interface AskUserQuestionInput {
    questions: Question[];
}

export interface Question {
    question: string;
    header: string;
    options: QuestionOption[];
    multiSelect: boolean;
}

export interface QuestionOption {
    label: string;
    description: string;
}

// TodoWrite tool types
export interface TodoWriteInput {
    todos: Todo[];
}

export interface Todo {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm: string;
}

// Plan mode types
export interface PlanModeState {
    active: boolean;
    planFile?: string;
    awaitingApproval: boolean;
}

// Background agent types
export interface BackgroundAgent {
    id: string;
    description: string;
    startTime: number;
    status: 'running' | 'completed' | 'failed';
}

// Image display types
export interface ImageReference {
    path: string;
    altText?: string;
    width?: number;
    height?: number;
}

// Routing types
export type RoutingTier = 'fast' | 'standard' | 'deep';

export interface RoutingDecision {
    tier: RoutingTier;
    provider: string;
    model: string;
    reason: string;
}

// Memory types
export interface Memory {
    id: string;
    content: string;
    memoryType: 'fact' | 'skill' | 'preference' | 'insight' | 'instruction';
    scope: string;
    createdAt: string;
    metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
    memory: Memory;
    score: number;
}

// Extension configuration
export interface DraagonConfig {
    routing: {
        enabled: boolean;
        fastPathPatterns: string[];
        groqApiKey?: string;
    };
    memory: {
        enabled: boolean;
        serverUrl: string;
        autoContext: boolean;
    };
    agents: {
        enabled: boolean;
        definitions: AgentDefinition[];
    };
}

export interface AgentDefinition {
    id: string;
    name: string;
    description: string;
    icon: string;
    systemPrompt: string;
    provider: 'groq' | 'claude' | 'draagon';
    model?: string;
}
