import * as vscode from 'vscode';
import { EventEmitter } from 'events';

export type AgentStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'waiting';

export interface AgentTask {
    id: string;
    prompt: string;
    context?: string;
    priority: 'low' | 'normal' | 'high' | 'critical';
    dependencies?: string[]; // Task IDs that must complete first
    timeout?: number; // ms
    retries?: number;
}

export interface AgentInstance {
    id: string;
    name: string;
    status: AgentStatus;
    currentTask?: AgentTask;
    completedTasks: string[];
    failedTasks: string[];
    createdAt: string;
    lastActiveAt: string;
    model: string;
    systemPrompt?: string;
    output: string[];
    metrics: AgentMetrics;
}

export interface AgentMetrics {
    tasksCompleted: number;
    tasksFailed: number;
    totalTokens: number;
    totalDuration: number; // ms
    averageTaskDuration: number;
}

export interface SwarmConfig {
    maxAgents: number;
    defaultModel: string;
    taskTimeout: number;
    retryLimit: number;
    parallelism: 'sequential' | 'parallel' | 'adaptive';
}

export interface OrchestrationResult {
    success: boolean;
    results: Map<string, TaskResult>;
    duration: number;
    agentsUsed: number;
    summary: string;
}

export interface TaskResult {
    taskId: string;
    agentId: string;
    success: boolean;
    output: string;
    duration: number;
    error?: string;
}

export class AgentOrchestrator extends EventEmitter {
    private _agents: Map<string, AgentInstance> = new Map();
    private _taskQueue: AgentTask[] = [];
    private _results: Map<string, TaskResult> = new Map();
    private _config: SwarmConfig;
    private _running: boolean = false;
    private _onAgentUpdate: vscode.EventEmitter<AgentInstance> = new vscode.EventEmitter();
    private _onTaskComplete: vscode.EventEmitter<TaskResult> = new vscode.EventEmitter();

    public readonly onAgentUpdate = this._onAgentUpdate.event;
    public readonly onTaskComplete = this._onTaskComplete.event;

    constructor(config?: Partial<SwarmConfig>) {
        super();
        this._config = {
            maxAgents: config?.maxAgents || 5,
            defaultModel: config?.defaultModel || 'claude-3.5-sonnet',
            taskTimeout: config?.taskTimeout || 300000, // 5 minutes
            retryLimit: config?.retryLimit || 3,
            parallelism: config?.parallelism || 'adaptive'
        };
    }

    public createAgent(name: string, systemPrompt?: string, model?: string): AgentInstance {
        const id = `agent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const now = new Date().toISOString();

        const agent: AgentInstance = {
            id,
            name,
            status: 'idle',
            completedTasks: [],
            failedTasks: [],
            createdAt: now,
            lastActiveAt: now,
            model: model || this._config.defaultModel,
            systemPrompt,
            output: [],
            metrics: {
                tasksCompleted: 0,
                tasksFailed: 0,
                totalTokens: 0,
                totalDuration: 0,
                averageTaskDuration: 0
            }
        };

        this._agents.set(id, agent);
        this._onAgentUpdate.fire(agent);
        return agent;
    }

    public removeAgent(id: string): boolean {
        const agent = this._agents.get(id);
        if (!agent) return false;

        if (agent.status === 'running') {
            this.pauseAgent(id);
        }

        return this._agents.delete(id);
    }

    public getAgent(id: string): AgentInstance | null {
        return this._agents.get(id) || null;
    }

    public getAgents(): AgentInstance[] {
        return Array.from(this._agents.values());
    }

    public getActiveAgents(): AgentInstance[] {
        return this.getAgents().filter(a => a.status === 'running');
    }

    public getIdleAgents(): AgentInstance[] {
        return this.getAgents().filter(a => a.status === 'idle');
    }

    public addTask(task: Omit<AgentTask, 'id'>): AgentTask {
        const fullTask: AgentTask = {
            ...task,
            id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        };

        // Insert based on priority
        const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        const insertIndex = this._taskQueue.findIndex(
            t => priorityOrder[t.priority] > priorityOrder[fullTask.priority]
        );

        if (insertIndex === -1) {
            this._taskQueue.push(fullTask);
        } else {
            this._taskQueue.splice(insertIndex, 0, fullTask);
        }

        // Auto-start if running
        if (this._running) {
            this._processQueue();
        }

        return fullTask;
    }

    public addTasks(tasks: Omit<AgentTask, 'id'>[]): AgentTask[] {
        return tasks.map(t => this.addTask(t));
    }

    public pauseAgent(id: string): boolean {
        const agent = this._agents.get(id);
        if (!agent || agent.status !== 'running') return false;

        agent.status = 'paused';
        this._onAgentUpdate.fire(agent);
        return true;
    }

    public resumeAgent(id: string): boolean {
        const agent = this._agents.get(id);
        if (!agent || agent.status !== 'paused') return false;

        agent.status = 'idle';
        this._onAgentUpdate.fire(agent);

        if (this._running) {
            this._processQueue();
        }

        return true;
    }

    public async startSwarm(): Promise<void> {
        this._running = true;
        this._processQueue();
    }

    public stopSwarm(): void {
        this._running = false;
        for (const agent of this._agents.values()) {
            if (agent.status === 'running') {
                agent.status = 'paused';
                this._onAgentUpdate.fire(agent);
            }
        }
    }

    public getTaskQueue(): AgentTask[] {
        return [...this._taskQueue];
    }

    public clearTaskQueue(): void {
        this._taskQueue = [];
    }

    public getResults(): Map<string, TaskResult> {
        return new Map(this._results);
    }

    private async _processQueue(): Promise<void> {
        if (!this._running) return;

        const idleAgents = this.getIdleAgents();
        if (idleAgents.length === 0 || this._taskQueue.length === 0) {
            return;
        }

        // Get next available task (respecting dependencies)
        const nextTask = this._getNextTask();
        if (!nextTask) return;

        // Assign to first idle agent
        const agent = idleAgents[0];
        await this._executeTask(agent, nextTask);

        // Continue processing
        if (this._running && this._taskQueue.length > 0) {
            setImmediate(() => this._processQueue());
        }
    }

    private _getNextTask(): AgentTask | null {
        for (let i = 0; i < this._taskQueue.length; i++) {
            const task = this._taskQueue[i];

            // Check if dependencies are met
            if (task.dependencies) {
                const allDepsComplete = task.dependencies.every(depId =>
                    this._results.has(depId) && this._results.get(depId)!.success
                );
                if (!allDepsComplete) continue;
            }

            // Remove from queue and return
            this._taskQueue.splice(i, 1);
            return task;
        }

        return null;
    }

    private async _executeTask(agent: AgentInstance, task: AgentTask): Promise<void> {
        const startTime = Date.now();

        agent.status = 'running';
        agent.currentTask = task;
        agent.lastActiveAt = new Date().toISOString();
        this._onAgentUpdate.fire(agent);

        try {
            // Simulate task execution (in real implementation, this would call Claude)
            // This is a placeholder - actual implementation would use ClaudeProcess
            const output = await this._simulateTaskExecution(agent, task);

            const duration = Date.now() - startTime;

            const result: TaskResult = {
                taskId: task.id,
                agentId: agent.id,
                success: true,
                output,
                duration
            };

            this._results.set(task.id, result);
            agent.completedTasks.push(task.id);
            agent.output.push(output);
            agent.metrics.tasksCompleted++;
            agent.metrics.totalDuration += duration;
            agent.metrics.averageTaskDuration =
                agent.metrics.totalDuration / agent.metrics.tasksCompleted;

            this._onTaskComplete.fire(result);

        } catch (error) {
            const duration = Date.now() - startTime;

            const result: TaskResult = {
                taskId: task.id,
                agentId: agent.id,
                success: false,
                output: '',
                duration,
                error: String(error)
            };

            this._results.set(task.id, result);
            agent.failedTasks.push(task.id);
            agent.metrics.tasksFailed++;

            // Retry logic
            const retries = task.retries || 0;
            if (retries < this._config.retryLimit) {
                this.addTask({ ...task, retries: retries + 1 });
            }

            this._onTaskComplete.fire(result);
        }

        agent.status = 'idle';
        agent.currentTask = undefined;
        this._onAgentUpdate.fire(agent);
    }

    private async _simulateTaskExecution(agent: AgentInstance, task: AgentTask): Promise<string> {
        // Placeholder for actual Claude execution
        // In real implementation, this would:
        // 1. Create a ClaudeProcess
        // 2. Send the task prompt with agent's system prompt
        // 3. Collect and return the response

        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(`[${agent.name}] Completed task: ${task.prompt.substring(0, 50)}...`);
            }, 1000);
        });
    }

    // Specialized swarm patterns
    public async runParallelTasks(tasks: Omit<AgentTask, 'id'>[]): Promise<OrchestrationResult> {
        const startTime = Date.now();

        // Create agents for each task (up to max)
        const numAgents = Math.min(tasks.length, this._config.maxAgents);
        for (let i = 0; i < numAgents; i++) {
            if (this.getIdleAgents().length < numAgents) {
                this.createAgent(`Worker ${i + 1}`);
            }
        }

        // Add all tasks
        const addedTasks = this.addTasks(tasks);

        // Start processing
        await this.startSwarm();

        // Wait for all tasks to complete
        await this._waitForCompletion(addedTasks.map(t => t.id));

        const results = new Map<string, TaskResult>();
        for (const task of addedTasks) {
            const result = this._results.get(task.id);
            if (result) {
                results.set(task.id, result);
            }
        }

        const successCount = Array.from(results.values()).filter(r => r.success).length;

        return {
            success: successCount === tasks.length,
            results,
            duration: Date.now() - startTime,
            agentsUsed: numAgents,
            summary: `Completed ${successCount}/${tasks.length} tasks in ${Date.now() - startTime}ms`
        };
    }

    public async runSequentialTasks(tasks: Omit<AgentTask, 'id'>[]): Promise<OrchestrationResult> {
        const startTime = Date.now();

        // Create single agent
        const agent = this.createAgent('Sequential Worker');

        // Add tasks with dependencies
        const addedTasks: AgentTask[] = [];
        let prevTaskId: string | undefined;

        for (const task of tasks) {
            const fullTask = this.addTask({
                ...task,
                dependencies: prevTaskId ? [prevTaskId] : undefined
            });
            addedTasks.push(fullTask);
            prevTaskId = fullTask.id;
        }

        // Start processing
        await this.startSwarm();

        // Wait for all tasks
        await this._waitForCompletion(addedTasks.map(t => t.id));

        const results = new Map<string, TaskResult>();
        for (const task of addedTasks) {
            const result = this._results.get(task.id);
            if (result) {
                results.set(task.id, result);
            }
        }

        const successCount = Array.from(results.values()).filter(r => r.success).length;

        return {
            success: successCount === tasks.length,
            results,
            duration: Date.now() - startTime,
            agentsUsed: 1,
            summary: `Completed ${successCount}/${tasks.length} tasks sequentially in ${Date.now() - startTime}ms`
        };
    }

    public async runPipelineTasks(
        tasks: Omit<AgentTask, 'id'>[],
        transformer: (prevOutput: string, nextTask: Omit<AgentTask, 'id'>) => Omit<AgentTask, 'id'>
    ): Promise<OrchestrationResult> {
        const startTime = Date.now();
        const results = new Map<string, TaskResult>();
        let prevOutput = '';

        for (const task of tasks) {
            const transformedTask = prevOutput ? transformer(prevOutput, task) : task;
            const fullTask = this.addTask(transformedTask);

            await this.startSwarm();
            await this._waitForCompletion([fullTask.id]);

            const result = this._results.get(fullTask.id);
            if (result) {
                results.set(fullTask.id, result);
                prevOutput = result.output;

                if (!result.success) {
                    break;
                }
            }
        }

        const successCount = Array.from(results.values()).filter(r => r.success).length;

        return {
            success: successCount === tasks.length,
            results,
            duration: Date.now() - startTime,
            agentsUsed: 1,
            summary: `Pipeline completed ${successCount}/${tasks.length} stages in ${Date.now() - startTime}ms`
        };
    }

    private _waitForCompletion(taskIds: string[]): Promise<void> {
        return new Promise((resolve) => {
            const checkComplete = () => {
                const allComplete = taskIds.every(id => this._results.has(id));
                if (allComplete) {
                    resolve();
                } else {
                    setTimeout(checkComplete, 100);
                }
            };
            checkComplete();
        });
    }

    public getSwarmStatus(): {
        running: boolean;
        agents: number;
        activeAgents: number;
        pendingTasks: number;
        completedTasks: number;
        failedTasks: number;
    } {
        const agents = this.getAgents();
        return {
            running: this._running,
            agents: agents.length,
            activeAgents: agents.filter(a => a.status === 'running').length,
            pendingTasks: this._taskQueue.length,
            completedTasks: Array.from(this._results.values()).filter(r => r.success).length,
            failedTasks: Array.from(this._results.values()).filter(r => !r.success).length
        };
    }

    public dispose(): void {
        this.stopSwarm();
        this._agents.clear();
        this._taskQueue = [];
        this._results.clear();
        this._onAgentUpdate.dispose();
        this._onTaskComplete.dispose();
    }
}
