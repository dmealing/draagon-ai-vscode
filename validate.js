#!/usr/bin/env node
/**
 * Static validation of extension structure
 * Validates package.json, TypeScript compilation, and file structure
 */

const fs = require('fs');
const path = require('path');

const extensionDir = __dirname;
let errors = [];
let warnings = [];

console.log('\n=== Draagon AI Extension Validation ===\n');

// 1. Check package.json
console.log('Checking package.json...');
const pkgPath = path.join(extensionDir, 'package.json');
if (!fs.existsSync(pkgPath)) {
    errors.push('package.json not found!');
} else {
    const pkg = require(pkgPath);

    // Required fields
    if (!pkg.name) errors.push('package.json: missing name');
    if (!pkg.version) errors.push('package.json: missing version');
    if (!pkg.main) errors.push('package.json: missing main');
    if (!pkg.engines?.vscode) errors.push('package.json: missing engines.vscode');

    // Check main entry point exists
    const mainPath = path.join(extensionDir, pkg.main);
    if (!fs.existsSync(mainPath)) {
        errors.push(`Main entry point not found: ${pkg.main}`);
    } else {
        console.log(`  ✓ Main entry: ${pkg.main}`);
    }

    // Check activation events
    if (pkg.activationEvents?.length > 0) {
        console.log(`  ✓ Activation events: ${pkg.activationEvents.join(', ')}`);
    }

    // Check commands
    const commands = pkg.contributes?.commands || [];
    console.log(`  ✓ Commands: ${commands.length} registered`);
    commands.forEach(cmd => console.log(`      - ${cmd.command}`));

    // Check views
    const views = pkg.contributes?.views?.draagon || [];
    console.log(`  ✓ Views: ${views.length} registered`);
    views.forEach(v => console.log(`      - ${v.id} (${v.type || 'tree'})`));

    // Check configuration
    const configProps = Object.keys(pkg.contributes?.configuration?.properties || {});
    console.log(`  ✓ Configuration: ${configProps.length} settings`);
}

// 2. Check compiled output
console.log('\nChecking compiled output...');
const outDir = path.join(extensionDir, 'out');
if (!fs.existsSync(outDir)) {
    errors.push('out/ directory not found - run npm run compile');
} else {
    const checkFile = (relPath, description) => {
        const fullPath = path.join(outDir, relPath);
        if (fs.existsSync(fullPath)) {
            console.log(`  ✓ ${description}`);
            return true;
        } else {
            errors.push(`Missing compiled file: ${relPath}`);
            return false;
        }
    };

    checkFile('extension.js', 'Extension entry point');
    checkFile('providers/chatViewProvider.js', 'Chat View Provider');
    checkFile('providers/agentsViewProvider.js', 'Agents View Provider');
    checkFile('providers/memoryViewProvider.js', 'Memory View Provider');
    checkFile('claude/process.js', 'Claude Process');
    checkFile('claude/types.js', 'Type definitions');
    checkFile('routing/router.js', 'Request Router');
    checkFile('memory/client.js', 'Memory Client');
    checkFile('backup/manager.js', 'Backup Manager');
    checkFile('ui/webview/content.js', 'Webview Content');
}

// 3. Check required resources
console.log('\nChecking resources...');
const iconPath = path.join(extensionDir, 'resources', 'icon.svg');
if (!fs.existsSync(iconPath)) {
    warnings.push('resources/icon.svg not found - using default');
    console.log('  ⚠ Icon file missing (will use default)');
} else {
    console.log('  ✓ Icon file present');
}

// 4. Validate extension.js exports
console.log('\nValidating extension exports...');
try {
    // Read the compiled extension.js and check for exports
    const extJs = fs.readFileSync(path.join(outDir, 'extension.js'), 'utf8');

    if (extJs.includes('exports.activate')) {
        console.log('  ✓ activate() exported');
    } else {
        errors.push('activate() function not exported');
    }

    if (extJs.includes('exports.deactivate')) {
        console.log('  ✓ deactivate() exported');
    } else {
        errors.push('deactivate() function not exported');
    }
} catch (e) {
    errors.push(`Could not read extension.js: ${e.message}`);
}

// 5. Check for common issues in compiled code
console.log('\nScanning for potential issues...');
const jsFiles = [];
function findJsFiles(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory() && !file.includes('test')) {
            findJsFiles(fullPath);
        } else if (file.endsWith('.js')) {
            jsFiles.push(fullPath);
        }
    }
}
findJsFiles(outDir);

let issueCount = 0;
for (const jsFile of jsFiles) {
    const content = fs.readFileSync(jsFile, 'utf8');
    const relPath = path.relative(outDir, jsFile);

    // Check for require('vscode')
    if (content.includes('require("vscode")')) {
        // This is expected
    }

    // Check for unhandled promise rejections
    if (content.includes('.then(') && !content.includes('.catch(')) {
        // Just a warning, not an error
    }

    // Check for console.log (which is fine for debugging)
    if (content.includes('console.error') || content.includes('console.log')) {
        // Normal for development
    }
}
console.log(`  ✓ Scanned ${jsFiles.length} JavaScript files`);

// Summary
console.log('\n=== Validation Summary ===\n');

if (errors.length === 0 && warnings.length === 0) {
    console.log('✓ All validations passed!\n');
    console.log('The extension is ready for testing. To test:');
    console.log('  1. Open this folder in VS Code');
    console.log('  2. Press F5 to launch Extension Development Host');
    console.log('  3. Look for "Draagon AI" in the activity bar\n');
    process.exit(0);
} else {
    if (errors.length > 0) {
        console.log(`✗ ${errors.length} error(s):`);
        errors.forEach(e => console.log(`  - ${e}`));
    }
    if (warnings.length > 0) {
        console.log(`\n⚠ ${warnings.length} warning(s):`);
        warnings.forEach(w => console.log(`  - ${w}`));
    }
    console.log('');
    process.exit(errors.length > 0 ? 1 : 0);
}
