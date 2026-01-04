import * as path from 'path';
import * as cp from 'child_process';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to the test runner script
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Set environment variable to skip WSL prompt
        process.env.DONT_PROMPT_WSL_INSTALL = '1';

        // Download VS Code if needed
        const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');

        // Get the CLI path (bin/code) and default args
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

        // Spawn the CLI
        const child = cp.spawn(cliPath, args, {
            stdio: ['inherit', 'pipe', 'pipe'],
            env: {
                ...process.env,
                DONT_PROMPT_WSL_INSTALL: '1',
                VSCODE_CLI: '1'
            }
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
            const str = data.toString();
            stdout += str;
            process.stdout.write(str);
        });

        child.stderr?.on('data', (data) => {
            const str = data.toString();
            stderr += str;
            process.stderr.write(str);
        });

        const exitCode = await new Promise<number>((resolve) => {
            child.on('close', (code) => {
                resolve(code ?? 1);
            });
        });

        console.log('\n--- End Test Output ---\n');

        if (exitCode !== 0) {
            console.error('Tests failed with exit code:', exitCode);
            if (stderr) {
                console.error('Stderr:', stderr);
            }
            process.exit(exitCode);
        }

        console.log('Tests passed!');
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
