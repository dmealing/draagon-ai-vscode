/**
 * Plan Manager
 *
 * Manages plan lifecycle: creation, storage, retrieval, and execution coordination.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Plan, PlanStatus, PlanExecutionResult } from './types';
import { PlanParser } from './parser';
import { PlanExecutor } from './executor';

export class PlanManager {
    private _plans: Map<string, Plan> = new Map();
    private _parser: PlanParser;
    private _executor: PlanExecutor;
    private _activePlan: Plan | null = null;
    private _plansPath: string;

    private _onPlanCreated = new vscode.EventEmitter<Plan>();
    private _onPlanUpdated = new vscode.EventEmitter<Plan>();
    private _onPlanDeleted = new vscode.EventEmitter<string>();
    private _onActivePlanChanged = new vscode.EventEmitter<Plan | null>();

    public readonly onPlanCreated = this._onPlanCreated.event;
    public readonly onPlanUpdated = this._onPlanUpdated.event;
    public readonly onPlanDeleted = this._onPlanDeleted.event;
    public readonly onActivePlanChanged = this._onActivePlanChanged.event;

    // Forward executor events
    public readonly onStepStart: vscode.Event<any>;
    public readonly onStepComplete: vscode.Event<any>;
    public readonly onStepFailed: vscode.Event<any>;
    public readonly onPlanComplete: vscode.Event<PlanExecutionResult>;
    public readonly onApprovalRequired: vscode.Event<any>;

    constructor(
        private context: vscode.ExtensionContext,
        private config: vscode.WorkspaceConfiguration
    ) {
        this._parser = new PlanParser();
        this._executor = new PlanExecutor(config);

        // Forward events
        this.onStepStart = this._executor.onStepStart;
        this.onStepComplete = this._executor.onStepComplete;
        this.onStepFailed = this._executor.onStepFailed;
        this.onPlanComplete = this._executor.onPlanComplete;
        this.onApprovalRequired = this._executor.onApprovalRequired;

        // Setup storage
        const storagePath = context.storageUri?.fsPath || context.globalStorageUri.fsPath;
        this._plansPath = path.join(storagePath, 'plans');

        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            await fs.promises.mkdir(this._plansPath, { recursive: true });
            await this.loadPlans();
        } catch (error) {
            console.error('Failed to initialize plan manager:', error);
        }
    }

    /**
     * Load plans from disk
     */
    private async loadPlans(): Promise<void> {
        try {
            const files = await fs.promises.readdir(this._plansPath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this._plansPath, file);
                    const content = await fs.promises.readFile(filePath, 'utf-8');
                    const plan = JSON.parse(content) as Plan;
                    this._plans.set(plan.id, plan);
                }
            }
        } catch (error) {
            console.error('Failed to load plans:', error);
        }
    }

    /**
     * Save a plan to disk
     */
    private async savePlan(plan: Plan): Promise<void> {
        try {
            const filePath = path.join(this._plansPath, `${plan.id}.json`);
            await fs.promises.writeFile(filePath, JSON.stringify(plan, null, 2));
        } catch (error) {
            console.error('Failed to save plan:', error);
        }
    }

    /**
     * Parse Claude's output and create a new plan
     */
    public createPlanFromClaudeOutput(content: string): Plan | null {
        const plan = this._parser.parse(content);
        if (plan) {
            this._plans.set(plan.id, plan);
            this.savePlan(plan);
            this._onPlanCreated.fire(plan);
            return plan;
        }
        return null;
    }

    /**
     * Create a plan manually
     */
    public createPlan(title: string, description: string, goal: string): Plan {
        const now = new Date().toISOString();
        const plan: Plan = {
            id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            title,
            description,
            goal,
            status: 'draft',
            steps: [],
            createdAt: now,
            updatedAt: now,
            metadata: {
                estimatedSteps: 0,
                completedSteps: 0,
                failedSteps: 0,
                skippedSteps: 0,
                filesAffected: []
            }
        };

        this._plans.set(plan.id, plan);
        this.savePlan(plan);
        this._onPlanCreated.fire(plan);
        return plan;
    }

    /**
     * Get a plan by ID
     */
    public getPlan(id: string): Plan | null {
        return this._plans.get(id) || null;
    }

    /**
     * Get all plans
     */
    public getPlans(): Plan[] {
        return Array.from(this._plans.values())
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    /**
     * Get plans by status
     */
    public getPlansByStatus(status: PlanStatus): Plan[] {
        return this.getPlans().filter(p => p.status === status);
    }

    /**
     * Get the active plan
     */
    public getActivePlan(): Plan | null {
        return this._activePlan;
    }

    /**
     * Set the active plan
     */
    public setActivePlan(planId: string | null): boolean {
        if (planId === null) {
            this._activePlan = null;
            this._onActivePlanChanged.fire(null);
            return true;
        }

        const plan = this._plans.get(planId);
        if (plan) {
            this._activePlan = plan;
            this._onActivePlanChanged.fire(plan);
            return true;
        }
        return false;
    }

    /**
     * Update a plan
     */
    public updatePlan(id: string, updates: Partial<Plan>): Plan | null {
        const plan = this._plans.get(id);
        if (!plan) return null;

        Object.assign(plan, updates, { updatedAt: new Date().toISOString() });
        this.savePlan(plan);
        this._onPlanUpdated.fire(plan);
        return plan;
    }

    /**
     * Delete a plan
     */
    public async deletePlan(id: string): Promise<boolean> {
        const plan = this._plans.get(id);
        if (!plan) return false;

        // Can't delete executing plan
        if (plan.status === 'executing') {
            return false;
        }

        this._plans.delete(id);

        try {
            const filePath = path.join(this._plansPath, `${id}.json`);
            await fs.promises.unlink(filePath);
        } catch {
            // File may not exist
        }

        if (this._activePlan?.id === id) {
            this._activePlan = null;
            this._onActivePlanChanged.fire(null);
        }

        this._onPlanDeleted.fire(id);
        return true;
    }

    /**
     * Approve a plan for execution
     */
    public approvePlan(id: string): Plan | null {
        const plan = this._plans.get(id);
        if (!plan || plan.status !== 'draft') return null;

        plan.status = 'approved';
        plan.approvedAt = new Date().toISOString();
        plan.updatedAt = new Date().toISOString();
        this.savePlan(plan);
        this._onPlanUpdated.fire(plan);
        return plan;
    }

    /**
     * Execute a plan
     */
    public async executePlan(
        id: string,
        options: { autoApprove?: boolean; dryRun?: boolean } = {}
    ): Promise<PlanExecutionResult | null> {
        const plan = this._plans.get(id);
        if (!plan) return null;

        // Must be approved or draft
        if (plan.status !== 'approved' && plan.status !== 'draft') {
            return null;
        }

        this._activePlan = plan;
        this._onActivePlanChanged.fire(plan);

        const result = await this._executor.execute(plan, options);

        this.savePlan(plan);
        this._onPlanUpdated.fire(plan);
        this._activePlan = null;
        this._onActivePlanChanged.fire(null);

        return result;
    }

    /**
     * Pause execution
     */
    public pauseExecution(): void {
        this._executor.pause();
    }

    /**
     * Resume execution
     */
    public resumeExecution(): void {
        this._executor.resume();
    }

    /**
     * Cancel execution
     */
    public cancelExecution(): void {
        this._executor.cancel();
    }

    /**
     * Skip a step
     */
    public skipStep(stepId: string): boolean {
        return this._executor.skipStep(stepId);
    }

    /**
     * Approve a step
     */
    public approveStep(stepId: string): boolean {
        return this._executor.approveStep(stepId);
    }

    /**
     * Get execution progress
     */
    public getProgress(): { completed: number; total: number; percentage: number } | null {
        return this._executor.getProgress();
    }

    /**
     * Check if currently executing
     */
    public isExecuting(): boolean {
        return this._executor.isExecuting();
    }

    /**
     * Check if paused
     */
    public isPaused(): boolean {
        return this._executor.isPaused();
    }

    /**
     * Format plan as markdown
     */
    public formatPlanAsMarkdown(plan: Plan): string {
        const statusEmoji: Record<PlanStatus, string> = {
            draft: '📝',
            approved: '✅',
            executing: '▶️',
            completed: '🎉',
            cancelled: '❌'
        };

        const stepStatusEmoji: Record<string, string> = {
            pending: '⏳',
            'in-progress': '🔄',
            completed: '✅',
            skipped: '⏭️',
            failed: '❌'
        };

        const lines: string[] = [];
        lines.push(`# ${statusEmoji[plan.status]} ${plan.title}`);
        lines.push('');
        lines.push(`**Status:** ${plan.status}`);
        lines.push(`**Created:** ${new Date(plan.createdAt).toLocaleString()}`);
        if (plan.approvedAt) {
            lines.push(`**Approved:** ${new Date(plan.approvedAt).toLocaleString()}`);
        }
        lines.push('');

        if (plan.goal) {
            lines.push('## Goal');
            lines.push(plan.goal);
            lines.push('');
        }

        if (plan.description) {
            lines.push('## Description');
            lines.push(plan.description);
            lines.push('');
        }

        lines.push('## Steps');
        lines.push('');

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            const emoji = stepStatusEmoji[step.status] || '•';
            lines.push(`${i + 1}. ${emoji} **${step.title}**`);

            if (step.description) {
                lines.push(`   ${step.description}`);
            }

            if (step.target) {
                lines.push(`   *Target:* \`${step.target}\``);
            }

            if (step.error) {
                lines.push(`   ❌ Error: ${step.error}`);
            }

            if (step.substeps && step.substeps.length > 0) {
                for (const substep of step.substeps) {
                    const subEmoji = stepStatusEmoji[substep.status] || '•';
                    lines.push(`   - ${subEmoji} ${substep.title}`);
                }
            }

            lines.push('');
        }

        lines.push('## Progress');
        lines.push(`- Total steps: ${plan.metadata.estimatedSteps}`);
        lines.push(`- Completed: ${plan.metadata.completedSteps}`);
        lines.push(`- Failed: ${plan.metadata.failedSteps}`);
        lines.push(`- Skipped: ${plan.metadata.skippedSteps}`);

        if (plan.metadata.filesAffected.length > 0) {
            lines.push('');
            lines.push('## Files Affected');
            for (const file of plan.metadata.filesAffected) {
                lines.push(`- ${file}`);
            }
        }

        return lines.join('\n');
    }

    public dispose(): void {
        this._executor.dispose();
        this._onPlanCreated.dispose();
        this._onPlanUpdated.dispose();
        this._onPlanDeleted.dispose();
        this._onActivePlanChanged.dispose();
    }
}
