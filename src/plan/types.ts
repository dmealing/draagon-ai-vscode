/**
 * Plan Mode Types
 *
 * Defines the structure for implementation plans that Claude generates
 * and the user can review, modify, and execute step-by-step.
 */

export type PlanStatus = 'draft' | 'approved' | 'executing' | 'completed' | 'cancelled';
export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'skipped' | 'failed';
export type StepType = 'file-edit' | 'file-create' | 'file-delete' | 'command' | 'research' | 'review' | 'other';

export interface PlanStep {
    id: string;
    title: string;
    description: string;
    type: StepType;
    target?: string; // File path or command
    status: StepStatus;
    estimatedComplexity?: 'low' | 'medium' | 'high';
    substeps?: PlanStep[];
    output?: string;
    error?: string;
    startedAt?: string;
    completedAt?: string;
}

export interface Plan {
    id: string;
    title: string;
    description: string;
    goal: string;
    status: PlanStatus;
    steps: PlanStep[];
    createdAt: string;
    updatedAt: string;
    approvedAt?: string;
    completedAt?: string;
    metadata: {
        estimatedSteps: number;
        completedSteps: number;
        failedSteps: number;
        skippedSteps: number;
        filesAffected: string[];
    };
}

export interface PlanExecutionContext {
    workspaceRoot: string;
    currentStepIndex: number;
    autoApprove: boolean;
    dryRun: boolean;
}

export interface PlanExecutionResult {
    planId: string;
    success: boolean;
    stepsExecuted: number;
    stepsFailed: number;
    stepsSkipped: number;
    duration: number;
    errors: string[];
}

/**
 * Parsed step before ID and status are assigned
 */
export interface ParsedPlanStep {
    title: string;
    description: string;
    type: StepType;
    target?: string;
    estimatedComplexity?: 'low' | 'medium' | 'high';
    substeps?: ParsedPlanStep[];
}

export interface ParsedPlanContent {
    title: string;
    description: string;
    goal: string;
    steps: ParsedPlanStep[];
}
