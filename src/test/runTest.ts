import * as path from 'path';
import * as cp from 'child_process';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to the test runner script
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Log environment variables being passed
        console.log('GROQ_API_KEY set:', !!process.env.GROQ_API_KEY);
        console.log('E2E_REAL_CLAUDE:', process.env.E2E_REAL_CLAUDE || 'not set');

        // Download VS Code if needed
        const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');

        // Get the CLI path and default args
        const [cliPath, ...defaultArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

        console.log('Using CLI path:', cliPath);

        // Build the full args list
        const args = [
            ...defaultArgs,
            '--disable-gpu',
            '--verbose',
            `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
            `--extensionTestsPath=${extensionTestsPath}`
        ];

        console.log('Running with args:', args.join('\n  '));
        console.log('\n--- Test Output ---\n');

        // Build the environment - include GROQ_API_KEY and E2E_REAL_CLAUDE
        const env = { ...process.env };

        // Spawn the CLI with piped output to ensure we see test results
        const child = cp.spawn(cliPath, args, {
            stdio: ['inherit', 'pipe', 'pipe'],
            env
        });

        // Forward stdout and stderr
        child.stdout?.on('data', (data) => {
            process.stdout.write(data);
        });

        child.stderr?.on('data', (data) => {
            process.stderr.write(data);
        });

        const exitCode = await new Promise<number>((resolve) => {
            child.on('close', (code) => {
                resolve(code ?? 1);
            });
        });

        console.log('\n--- End Test Output ---\n');

        if (exitCode !== 0) {
            console.error('Tests failed with exit code:', exitCode);
            process.exit(exitCode);
        }

        console.log('Tests passed!');
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
