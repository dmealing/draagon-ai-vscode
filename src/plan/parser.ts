/**
 * Plan Parser
 *
 * Parses Claude's plan output into a structured Plan object.
 * Handles various formats that Claude might use when generating plans.
 */

import { Plan, PlanStep, StepType, ParsedPlanContent, ParsedPlanStep } from './types';

export class PlanParser {
    /**
     * Parse Claude's plan output into a structured Plan
     */
    public parse(content: string): Plan | null {
        try {
            // Try JSON format first
            const jsonPlan = this.tryParseJson(content);
            if (jsonPlan) {
                return this.createPlanFromParsed(jsonPlan);
            }

            // Try markdown format
            const markdownPlan = this.tryParseMarkdown(content);
            if (markdownPlan) {
                return this.createPlanFromParsed(markdownPlan);
            }

            // Try numbered list format
            const listPlan = this.tryParseNumberedList(content);
            if (listPlan) {
                return this.createPlanFromParsed(listPlan);
            }

            return null;
        } catch (error) {
            console.error('Failed to parse plan:', error);
            return null;
        }
    }

    /**
     * Try to parse JSON-formatted plan
     */
    private tryParseJson(content: string): ParsedPlanContent | null {
        // Look for JSON block
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
            try {
                const data = JSON.parse(jsonMatch[1]);
                return this.normalizeJsonPlan(data);
            } catch {
                // Not valid JSON
            }
        }

        // Try parsing entire content as JSON
        try {
            const data = JSON.parse(content);
            return this.normalizeJsonPlan(data);
        } catch {
            return null;
        }
    }

    /**
     * Normalize JSON plan to standard format
     */
    private normalizeJsonPlan(data: any): ParsedPlanContent {
        return {
            title: data.title || data.name || 'Implementation Plan',
            description: data.description || data.summary || '',
            goal: data.goal || data.objective || '',
            steps: (data.steps || data.tasks || []).map((step: any) => ({
                title: step.title || step.name || step.task || '',
                description: step.description || step.details || '',
                type: this.inferStepType(step),
                target: step.target || step.file || step.path || step.command,
                estimatedComplexity: step.complexity || step.difficulty || 'medium',
                substeps: step.substeps ? step.substeps.map((sub: any) => ({
                    title: sub.title || sub.name || '',
                    description: sub.description || '',
                    type: this.inferStepType(sub),
                    target: sub.target || sub.file
                })) : undefined
            }))
        };
    }

    /**
     * Try to parse markdown-formatted plan
     */
    private tryParseMarkdown(content: string): ParsedPlanContent | null {
        const lines = content.split('\n');
        let title = '';
        let description = '';
        let goal = '';
        const steps: ParsedPlanStep[] = [];
        let currentStep: ParsedPlanStep | null = null;
        let inDescription = false;
        let inGoal = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Parse title (# heading)
            if (line.match(/^#\s+(.+)$/)) {
                title = line.replace(/^#\s+/, '');
                continue;
            }

            // Parse description section
            if (line.match(/^##\s+(description|summary|overview)/i)) {
                inDescription = true;
                inGoal = false;
                continue;
            }

            // Parse goal section
            if (line.match(/^##\s+(goal|objective|purpose)/i)) {
                inGoal = true;
                inDescription = false;
                continue;
            }

            // Parse steps section
            if (line.match(/^##\s+(steps|tasks|implementation|plan)/i)) {
                inDescription = false;
                inGoal = false;
                continue;
            }

            // Collect description
            if (inDescription && line && !line.startsWith('#')) {
                description += (description ? ' ' : '') + line;
                continue;
            }

            // Collect goal
            if (inGoal && line && !line.startsWith('#')) {
                goal += (goal ? ' ' : '') + line;
                continue;
            }

            // Parse step (### heading or numbered list)
            const stepMatch = line.match(/^###\s+(?:\d+[\.\)]\s*)?(.+)$/) ||
                              line.match(/^(\d+)[\.\)]\s+\*\*(.+?)\*\*/) ||
                              line.match(/^(\d+)[\.\)]\s+(.+)$/);

            if (stepMatch) {
                if (currentStep) {
                    steps.push(currentStep);
                }
                const stepTitle = stepMatch[2] || stepMatch[1];
                currentStep = {
                    title: stepTitle,
                    description: '',
                    type: this.inferStepTypeFromTitle(stepTitle)
                };
                continue;
            }

            // Parse substep (- item under a step)
            if (currentStep && line.match(/^[-*]\s+(.+)$/)) {
                const substepTitle = line.replace(/^[-*]\s+/, '');
                if (!currentStep.substeps) {
                    currentStep.substeps = [];
                }
                currentStep.substeps.push({
                    title: substepTitle,
                    description: '',
                    type: this.inferStepTypeFromTitle(substepTitle)
                });
                continue;
            }

            // Add to current step description
            if (currentStep && line && !line.startsWith('#')) {
                currentStep.description += (currentStep.description ? ' ' : '') + line;
            }
        }

        // Don't forget the last step
        if (currentStep) {
            steps.push(currentStep);
        }

        if (steps.length === 0) {
            return null;
        }

        return { title: title || 'Implementation Plan', description, goal, steps };
    }

    /**
     * Try to parse simple numbered list format
     */
    private tryParseNumberedList(content: string): ParsedPlanContent | null {
        const lines = content.split('\n');
        const steps: ParsedPlanStep[] = [];

        for (const line of lines) {
            const match = line.match(/^\s*(\d+)[\.\)]\s+(.+)$/);
            if (match) {
                const stepTitle = match[2].replace(/^\*\*|\*\*$/g, '').trim();
                steps.push({
                    title: stepTitle,
                    description: '',
                    type: this.inferStepTypeFromTitle(stepTitle)
                });
            }
        }

        if (steps.length === 0) {
            return null;
        }

        return {
            title: 'Implementation Plan',
            description: '',
            goal: '',
            steps
        };
    }

    /**
     * Infer step type from step data
     */
    private inferStepType(step: any): StepType {
        if (step.type) {
            return step.type;
        }

        const text = `${step.title || ''} ${step.description || ''}`.toLowerCase();
        return this.inferStepTypeFromText(text);
    }

    /**
     * Infer step type from title
     */
    private inferStepTypeFromTitle(title: string): StepType {
        return this.inferStepTypeFromText(title.toLowerCase());
    }

    /**
     * Infer step type from text content
     */
    private inferStepTypeFromText(text: string): StepType {
        if (text.includes('create') && (text.includes('file') || text.includes('.ts') || text.includes('.js'))) {
            return 'file-create';
        }
        if (text.includes('edit') || text.includes('modify') || text.includes('update') || text.includes('change')) {
            return 'file-edit';
        }
        if (text.includes('delete') || text.includes('remove')) {
            return 'file-delete';
        }
        if (text.includes('run') || text.includes('execute') || text.includes('npm') || text.includes('command')) {
            return 'command';
        }
        if (text.includes('research') || text.includes('investigate') || text.includes('analyze') || text.includes('explore')) {
            return 'research';
        }
        if (text.includes('review') || text.includes('test') || text.includes('verify')) {
            return 'review';
        }
        return 'other';
    }

    /**
     * Create a Plan from parsed content
     */
    private createPlanFromParsed(parsed: ParsedPlanContent): Plan {
        const now = new Date().toISOString();
        const filesAffected = new Set<string>();

        const steps: PlanStep[] = parsed.steps.map((step, index) => {
            const id = `step_${Date.now()}_${index}`;
            if (step.target) {
                filesAffected.add(step.target);
            }

            return {
                id,
                title: step.title,
                description: step.description,
                type: step.type,
                target: step.target,
                status: 'pending',
                estimatedComplexity: step.estimatedComplexity || 'medium',
                substeps: step.substeps?.map((sub, subIndex) => ({
                    id: `${id}_sub_${subIndex}`,
                    title: sub.title,
                    description: sub.description || '',
                    type: sub.type,
                    target: sub.target,
                    status: 'pending' as const
                }))
            };
        });

        return {
            id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            title: parsed.title,
            description: parsed.description,
            goal: parsed.goal,
            status: 'draft',
            steps,
            createdAt: now,
            updatedAt: now,
            metadata: {
                estimatedSteps: steps.length,
                completedSteps: 0,
                failedSteps: 0,
                skippedSteps: 0,
                filesAffected: Array.from(filesAffected)
            }
        };
    }

    /**
     * Extract target file paths from plan
     */
    public extractFilePaths(plan: Plan): string[] {
        const paths = new Set<string>();

        for (const step of plan.steps) {
            if (step.target && (step.type === 'file-edit' || step.type === 'file-create' || step.type === 'file-delete')) {
                paths.add(step.target);
            }
            if (step.substeps) {
                for (const substep of step.substeps) {
                    if (substep.target) {
                        paths.add(substep.target);
                    }
                }
            }
        }

        return Array.from(paths);
    }
}
