import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ClaudeProcess } from '../claude/process';

export interface GeneratedTest {
    id: string;
    sourceFile: string;
    testFile: string;
    testContent: string;
    framework: TestFramework;
    coverage: string[];
    timestamp: string;
}

export type TestFramework = 'jest' | 'mocha' | 'vitest' | 'pytest' | 'unittest' | 'go-test' | 'unknown';

export interface TestGenerationOptions {
    framework?: TestFramework;
    style?: 'unit' | 'integration' | 'e2e';
    coverage?: 'basic' | 'comprehensive' | 'edge-cases';
    includeSetup?: boolean;
    mockExternals?: boolean;
}

export interface TestGenerationResult {
    success: boolean;
    tests: GeneratedTest[];
    errors: string[];
    duration: number;
}

export class TestGenerator {
    private _onGenerationStart = new vscode.EventEmitter<string>();
    private _onGenerationComplete = new vscode.EventEmitter<TestGenerationResult>();
    private _onTestGenerated = new vscode.EventEmitter<GeneratedTest>();

    public readonly onGenerationStart = this._onGenerationStart.event;
    public readonly onGenerationComplete = this._onGenerationComplete.event;
    public readonly onTestGenerated = this._onTestGenerated.event;

    private _isGenerating = false;

    constructor(private config: vscode.WorkspaceConfiguration) {}

    public isGenerating(): boolean {
        return this._isGenerating;
    }

    /**
     * Detect the test framework used in the project
     */
    public async detectFramework(): Promise<TestFramework> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return 'unknown';
        }

        // Check package.json for JS/TS projects
        const packageJsonPath = path.join(workspaceRoot, 'package.json');
        try {
            const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(content);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            if (deps['vitest']) return 'vitest';
            if (deps['jest']) return 'jest';
            if (deps['mocha']) return 'mocha';
        } catch {
            // Not a Node.js project
        }

        // Check for pytest
        const pytestFiles = await vscode.workspace.findFiles('**/pytest.ini', '**/node_modules/**', 1);
        if (pytestFiles.length > 0) return 'pytest';

        const setupPyPath = path.join(workspaceRoot, 'setup.py');
        try {
            const content = await fs.promises.readFile(setupPyPath, 'utf-8');
            if (content.includes('pytest')) return 'pytest';
        } catch {
            // Not a Python project with setup.py
        }

        // Check for Go
        const goModPath = path.join(workspaceRoot, 'go.mod');
        try {
            await fs.promises.access(goModPath);
            return 'go-test';
        } catch {
            // Not a Go project
        }

        return 'unknown';
    }

    /**
     * Get the test file path for a given source file
     */
    public getTestFilePath(sourceFile: string, framework: TestFramework): string {
        const dir = path.dirname(sourceFile);
        const ext = path.extname(sourceFile);
        const base = path.basename(sourceFile, ext);

        switch (framework) {
            case 'jest':
            case 'vitest':
                return path.join(dir, '__tests__', `${base}.test${ext}`);
            case 'mocha':
                return path.join(dir, 'test', `${base}.test${ext}`);
            case 'pytest':
                return path.join(dir, 'tests', `test_${base}.py`);
            case 'go-test':
                return path.join(dir, `${base}_test.go`);
            default:
                return path.join(dir, `${base}.test${ext}`);
        }
    }

    /**
     * Generate tests for a single file
     */
    public async generateTestsForFile(
        filePath: string,
        options: TestGenerationOptions = {}
    ): Promise<GeneratedTest | null> {
        this._isGenerating = true;
        this._onGenerationStart.fire(filePath);

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const framework = options.framework || await this.detectFramework();
            const relativePath = vscode.workspace.asRelativePath(filePath);

            const prompt = this.buildPrompt(relativePath, content, framework, options);
            const testContent = await this.callClaude(prompt);

            if (!testContent) {
                return null;
            }

            const testFile = this.getTestFilePath(filePath, framework);
            const coverage = this.extractCoveredFunctions(content);

            const test: GeneratedTest = {
                id: `test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                sourceFile: filePath,
                testFile,
                testContent,
                framework,
                coverage,
                timestamp: new Date().toISOString()
            };

            this._onTestGenerated.fire(test);
            return test;

        } catch (error) {
            console.error('Test generation failed:', error);
            return null;
        } finally {
            this._isGenerating = false;
        }
    }

    /**
     * Generate tests for multiple files
     */
    public async generateTestsForFiles(
        files: string[],
        options: TestGenerationOptions = {}
    ): Promise<TestGenerationResult> {
        const startTime = Date.now();
        const tests: GeneratedTest[] = [];
        const errors: string[] = [];

        for (const file of files) {
            try {
                const test = await this.generateTestsForFile(file, options);
                if (test) {
                    tests.push(test);
                } else {
                    errors.push(`Failed to generate tests for ${file}`);
                }
            } catch (error) {
                errors.push(`Error generating tests for ${file}: ${error}`);
            }
        }

        const result: TestGenerationResult = {
            success: errors.length === 0,
            tests,
            errors,
            duration: Date.now() - startTime
        };

        this._onGenerationComplete.fire(result);
        return result;
    }

    /**
     * Generate tests for changed files (git diff)
     */
    public async generateTestsForChangedFiles(
        options: TestGenerationOptions = {}
    ): Promise<TestGenerationResult> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return { success: false, tests: [], errors: ['No workspace open'], duration: 0 };
        }

        // Get changed files from git
        const { execSync } = require('child_process');
        let changedFiles: string[] = [];

        try {
            const output = execSync('git diff --name-only HEAD', {
                cwd: workspaceRoot,
                encoding: 'utf-8'
            });
            changedFiles = output
                .split('\n')
                .filter((f: string) => f.trim())
                .filter((f: string) => /\.(ts|js|tsx|jsx|py|go)$/.test(f))
                .map((f: string) => path.join(workspaceRoot, f));
        } catch {
            return { success: false, tests: [], errors: ['Failed to get git diff'], duration: 0 };
        }

        if (changedFiles.length === 0) {
            return { success: true, tests: [], errors: [], duration: 0 };
        }

        return this.generateTestsForFiles(changedFiles, options);
    }

    private buildPrompt(
        filePath: string,
        content: string,
        framework: TestFramework,
        options: TestGenerationOptions
    ): string {
        const frameworkInstructions: Record<TestFramework, string> = {
            jest: 'Use Jest with describe/it blocks. Use jest.mock() for mocking.',
            vitest: 'Use Vitest with describe/it blocks. Use vi.mock() for mocking.',
            mocha: 'Use Mocha with describe/it blocks. Use sinon for mocking.',
            pytest: 'Use pytest with test_ prefixed functions. Use pytest fixtures.',
            unittest: 'Use unittest.TestCase. Use unittest.mock for mocking.',
            'go-test': 'Use Go testing package with Test prefixed functions.',
            unknown: 'Use common testing patterns for this language.'
        };

        const coverageInstructions: Record<string, string> = {
            basic: 'Write basic tests covering main happy path scenarios.',
            comprehensive: 'Write comprehensive tests covering happy paths, error cases, and boundary conditions.',
            'edge-cases': 'Focus on edge cases, error handling, and unusual inputs.'
        };

        const styleInstructions: Record<string, string> = {
            unit: 'Write unit tests that test individual functions in isolation.',
            integration: 'Write integration tests that test how components work together.',
            e2e: 'Write end-to-end tests that test complete user flows.'
        };

        return `Generate ${options.style || 'unit'} tests for this code file.

**File:** ${filePath}

**Framework:** ${framework}
${frameworkInstructions[framework]}

**Coverage Level:** ${options.coverage || 'comprehensive'}
${coverageInstructions[options.coverage || 'comprehensive']}

**Style:** ${options.style || 'unit'}
${styleInstructions[options.style || 'unit']}

${options.includeSetup ? '**Include:** Setup and teardown code.' : ''}
${options.mockExternals ? '**Mock:** External dependencies and APIs.' : ''}

**Source Code:**
\`\`\`
${content.substring(0, 15000)}
\`\`\`

Generate complete, working test code. Include all necessary imports.
Focus on testing the public API and exported functions.
Use descriptive test names that explain what is being tested.
Only output the test code, no explanations.`;
    }

    private async callClaude(prompt: string): Promise<string | null> {
        try {
            const claudeProcess = new ClaudeProcess({
                config: this.config
            });

            let response = '';

            return new Promise((resolve) => {
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
                    // Extract code block from response
                    const codeMatch = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
                    if (codeMatch) {
                        resolve(codeMatch[1].trim());
                    } else {
                        // Try to use the whole response if no code block found
                        resolve(response.trim() || null);
                    }
                });

                claudeProcess.onError(() => {
                    resolve(null);
                });

                claudeProcess.send(prompt);
            });
        } catch {
            return null;
        }
    }

    private extractCoveredFunctions(content: string): string[] {
        const functions: string[] = [];

        // JavaScript/TypeScript functions
        const jsFunctionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
        const jsMethodRegex = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/g;
        const jsArrowRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;

        let match;
        while ((match = jsFunctionRegex.exec(content)) !== null) {
            functions.push(match[1]);
        }
        while ((match = jsArrowRegex.exec(content)) !== null) {
            functions.push(match[1]);
        }

        // Python functions
        const pyFunctionRegex = /def\s+(\w+)\s*\(/g;
        while ((match = pyFunctionRegex.exec(content)) !== null) {
            if (!match[1].startsWith('_')) {
                functions.push(match[1]);
            }
        }

        // Go functions
        const goFunctionRegex = /func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/g;
        while ((match = goFunctionRegex.exec(content)) !== null) {
            if (match[1][0] === match[1][0].toUpperCase()) {
                functions.push(match[1]);
            }
        }

        return [...new Set(functions)];
    }

    /**
     * Write generated tests to files
     */
    public async writeTests(tests: GeneratedTest[]): Promise<{ written: number; errors: string[] }> {
        let written = 0;
        const errors: string[] = [];

        for (const test of tests) {
            try {
                const testDir = path.dirname(test.testFile);
                await fs.promises.mkdir(testDir, { recursive: true });
                await fs.promises.writeFile(test.testFile, test.testContent);
                written++;
            } catch (error) {
                errors.push(`Failed to write ${test.testFile}: ${error}`);
            }
        }

        return { written, errors };
    }

    public dispose(): void {
        this._onGenerationStart.dispose();
        this._onGenerationComplete.dispose();
        this._onTestGenerated.dispose();
    }
}
