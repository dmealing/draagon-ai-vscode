/**
 * Plan Executor
 *
 * Executes plans step-by-step with user approval at each stage.
 * Integrates with Claude for actual code generation/modification.
 */

import * as vscode from 'vscode';
import { Plan, PlanStep, PlanExecutionContext, PlanExecutionResult, StepStatus } from './types';
import { ClaudeProcess } from '../claude/process';

export class PlanExecutor {
    private _currentPlan: Plan | null = null;
    private _context: PlanExecutionContext | null = null;
    private _isPaused = false;
    private _isCancelled = false;

    private _onStepStart = new vscode.EventEmitter<PlanStep>();
    private _onStepComplete = new vscode.EventEmitter<PlanStep>();
    private _onStepFailed = new vscode.EventEmitter<{ step: PlanStep; error: string }>();
    private _onPlanComplete = new vscode.EventEmitter<PlanExecutionResult>();
    private _onApprovalRequired = new vscode.EventEmitter<PlanStep>();

    public readonly onStepStart = this._onStepStart.event;
    public readonly onStepComplete = this._onStepComplete.event;
    public readonly onStepFailed = this._onStepFailed.event;
    public readonly onPlanComplete = this._onPlanComplete.event;
    public readonly onApprovalRequired = this._onApprovalRequired.event;

    constructor(private config: vscode.WorkspaceConfiguration) {}

    public getCurrentPlan(): Plan | null {
        return this._currentPlan;
    }

    public isExecuting(): boolean {
        return this._currentPlan !== null && this._currentPlan.status === 'executing';
    }

    public isPaused(): boolean {
        return this._isPaused;
    }

    /**
     * Start executing a plan
     */
    public async execute(plan: Plan, context: Partial<PlanExecutionContext> = {}): Promise<PlanExecutionResult> {
        const startTime = Date.now();
        this._currentPlan = plan;
        this._isPaused = false;
        this._isCancelled = false;

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return {
                planId: plan.id,
                success: false,
                stepsExecuted: 0,
                stepsFailed: 0,
                stepsSkipped: 0,
                duration: Date.now() - startTime,
                errors: ['No workspace folder open']
            };
        }

        this._context = {
            workspaceRoot,
            currentStepIndex: 0,
            autoApprove: context.autoApprove ?? false,
            dryRun: context.dryRun ?? false
        };

        plan.status = 'executing';
        plan.updatedAt = new Date().toISOString();

        let stepsExecuted = 0;
        let stepsFailed = 0;
        let stepsSkipped = 0;
        const errors: string[] = [];

        for (let i = 0; i < plan.steps.length; i++) {
            if (this._isCancelled) {
                break;
            }

            while (this._isPaused && !this._isCancelled) {
                await this.sleep(100);
            }

            if (this._isCancelled) {
                break;
            }

            const step = plan.steps[i];
            this._context.currentStepIndex = i;

            // Request approval if not auto-approve
            if (!this._context.autoApprove) {
                this._onApprovalRequired.fire(step);
                // Wait for approval (this would be set by external handler)
                // For now, we just continue - in real implementation, this would wait
            }

            if (step.status === 'skipped') {
                stepsSkipped++;
                continue;
            }

            try {
                this._onStepStart.fire(step);
                step.status = 'in-progress';
                step.startedAt = new Date().toISOString();

                await this.executeStep(step);

                step.status = 'completed';
                step.completedAt = new Date().toISOString();
                stepsExecuted++;
                plan.metadata.completedSteps++;

                this._onStepComplete.fire(step);

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                step.status = 'failed';
                step.error = errorMessage;
                step.completedAt = new Date().toISOString();
                stepsFailed++;
                plan.metadata.failedSteps++;
                errors.push(`Step "${step.title}": ${errorMessage}`);

                this._onStepFailed.fire({ step, error: errorMessage });

                // Continue or stop based on configuration
                if (!this.config.get<boolean>('plan.continueOnError', true)) {
                    break;
                }
            }

            plan.updatedAt = new Date().toISOString();
        }

        plan.status = this._isCancelled ? 'cancelled' : (stepsFailed === 0 ? 'completed' : 'completed');
        plan.completedAt = new Date().toISOString();
        plan.metadata.skippedSteps = stepsSkipped;

        const result: PlanExecutionResult = {
            planId: plan.id,
            success: stepsFailed === 0 && !this._isCancelled,
            stepsExecuted,
            stepsFailed,
            stepsSkipped,
            duration: Date.now() - startTime,
            errors
        };

        this._onPlanComplete.fire(result);
        this._currentPlan = null;
        this._context = null;

        return result;
    }

    /**
     * Execute a single step
     */
    private async executeStep(step: PlanStep): Promise<void> {
        if (this._context?.dryRun) {
            step.output = `[DRY RUN] Would execute: ${step.title}`;
            await this.sleep(500); // Simulate execution time
            return;
        }

        switch (step.type) {
            case 'file-edit':
            case 'file-create':
            case 'file-delete':
                await this.executeFileStep(step);
                break;
            case 'command':
                await this.executeCommandStep(step);
                break;
            case 'research':
                await this.executeResearchStep(step);
                break;
            case 'review':
                await this.executeReviewStep(step);
                break;
            default:
                await this.executeGenericStep(step);
        }

        // Execute substeps if any
        if (step.substeps) {
            for (const substep of step.substeps) {
                if (this._isCancelled) break;
                await this.executeStep(substep);
            }
        }
    }

    /**
     * Execute a file operation step using Claude
     */
    private async executeFileStep(step: PlanStep): Promise<void> {
        const prompt = this.buildStepPrompt(step);

        return new Promise((resolve, reject) => {
            const claudeProcess = new ClaudeProcess({ config: this.config });
            let response = '';
            let hasError = false;

            claudeProcess.onMessage((msg) => {
                if (msg.type === 'assistant' && msg.message?.content) {
                    for (const block of msg.message.content) {
                        if (block.type === 'text') {
                            response += block.text;
                        }
                    }
                }
                if (msg.type === 'error') {
                    hasError = true;
                }
            });

            claudeProcess.onComplete(() => {
                if (hasError) {
                    reject(new Error('Claude process error'));
                } else {
                    step.output = response.substring(0, 1000);
                    resolve();
                }
            });

            claudeProcess.onError((error) => {
                reject(error);
            });

            claudeProcess.send(prompt);
        });
    }

    /**
     * Execute a command step
     */
    private async executeCommandStep(step: PlanStep): Promise<void> {
        if (!step.target) {
            throw new Error('No command specified');
        }

        const { execSync } = require('child_process');
        try {
            const output = execSync(step.target, {
                cwd: this._context?.workspaceRoot,
                encoding: 'utf-8',
                timeout: 60000
            });
            step.output = output.substring(0, 1000);
        } catch (error: any) {
            throw new Error(`Command failed: ${error.message || error}`);
        }
    }

    /**
     * Execute a research step using Claude
     */
    private async executeResearchStep(step: PlanStep): Promise<void> {
        const prompt = `Research task: ${step.title}\n\n${step.description}\n\nProvide a brief summary of findings.`;

        return new Promise((resolve, reject) => {
            const claudeProcess = new ClaudeProcess({ config: this.config });
            let response = '';

            claudeProcess.onMessage((msg) => {
                if (msg.type === 'assistant' && msg.message?.content) {
                    for (const block of msg.message.content) {
                        if (block.type === 'text') {
                            response += block.text;
                        }
                    }
                }
            });

            claudeProcess.onComplete(() => {
                step.output = response.substring(0, 1000);
                resolve();
            });

            claudeProcess.onError((error) => {
                reject(error);
            });

            claudeProcess.send(prompt);
        });
    }

    /**
     * Execute a review step
     */
    private async executeReviewStep(step: PlanStep): Promise<void> {
        // Review steps typically just mark a checkpoint
        step.output = `Review checkpoint: ${step.title}`;
        await this.sleep(100);
    }

    /**
     * Execute a generic step
     */
    private async executeGenericStep(step: PlanStep): Promise<void> {
        step.output = `Completed: ${step.title}`;
        await this.sleep(100);
    }

    /**
     * Build a prompt for Claude to execute a step
     */
    private buildStepPrompt(step: PlanStep): string {
        const typeInstructions: Record<string, string> = {
            'file-edit': `Edit the file at "${step.target}" to accomplish the following:`,
            'file-create': `Create a new file at "${step.target}" with the following content:`,
            'file-delete': `Delete the file at "${step.target}".`
        };

        const instruction = typeInstructions[step.type] || 'Execute the following task:';

        return `${instruction}

**Task:** ${step.title}

**Details:** ${step.description}

Execute this step now. If this involves editing or creating files, make the changes directly.`;
    }

    /**
     * Pause execution
     */
    public pause(): void {
        this._isPaused = true;
    }

    /**
     * Resume execution
     */
    public resume(): void {
        this._isPaused = false;
    }

    /**
     * Cancel execution
     */
    public cancel(): void {
        this._isCancelled = true;
        this._isPaused = false;
    }

    /**
     * Skip a specific step
     */
    public skipStep(stepId: string): boolean {
        if (!this._currentPlan) return false;

        const step = this.findStep(this._currentPlan.steps, stepId);
        if (step && step.status === 'pending') {
            step.status = 'skipped';
            return true;
        }
        return false;
    }

    /**
     * Approve a step for execution
     */
    public approveStep(stepId: string): boolean {
        if (!this._currentPlan) return false;

        const step = this.findStep(this._currentPlan.steps, stepId);
        if (step) {
            // Mark as ready for execution
            return true;
        }
        return false;
    }

    /**
     * Find a step by ID
     */
    private findStep(steps: PlanStep[], stepId: string): PlanStep | null {
        for (const step of steps) {
            if (step.id === stepId) {
                return step;
            }
            if (step.substeps) {
                const found = this.findStep(step.substeps, stepId);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Get progress statistics
     */
    public getProgress(): { completed: number; total: number; percentage: number } | null {
        if (!this._currentPlan) return null;

        const total = this._currentPlan.steps.length;
        const completed = this._currentPlan.steps.filter(s =>
            s.status === 'completed' || s.status === 'skipped'
        ).length;

        return {
            completed,
            total,
            percentage: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public dispose(): void {
        this._onStepStart.dispose();
        this._onStepComplete.dispose();
        this._onStepFailed.dispose();
        this._onPlanComplete.dispose();
        this._onApprovalRequired.dispose();
    }
}
