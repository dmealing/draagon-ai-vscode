# REQ-006: WSL Support

**Status:** DEFERRED (Backend Complete)
**Version:** 0.2.0
**Notes:** Backend implementation complete, integration deferred for native platform priority

## Overview
Enable seamless operation on Windows with WSL (Windows Subsystem for Linux), including proper path handling and process execution.

## Priority
**MEDIUM** - Important for Windows developer market

## User Stories

### US-001: Run Claude in WSL
As a Windows user with WSL, I want to run Claude CLI through WSL, so I can use Linux tooling.

### US-002: Path Conversion
As a user, I want file paths to be correctly converted between Windows and WSL formats, so tools work correctly.

### US-003: WSL Configuration
As a user, I want to configure which WSL distro and paths to use, so I can match my environment.

## Functional Requirements

### FR-001: WSL Detection
- Detect if running on Windows
- Check if WSL is available
- List available WSL distributions

### FR-002: Process Execution
- Execute Claude CLI via `wsl` command
- Support custom distro selection
- Pass environment variables correctly
- Handle stdio streams

### FR-003: Path Conversion
- Convert Windows paths to WSL: `C:\Users\...` → `/mnt/c/Users/...`
- Convert WSL paths to Windows for VS Code
- Handle UNC paths
- Support custom mount points

### FR-004: Configuration
- `draagon.wsl.enabled`: Enable WSL mode
- `draagon.wsl.distro`: WSL distribution name
- `draagon.wsl.claudePath`: Path to Claude in WSL
- `draagon.wsl.nodePath`: Path to Node.js in WSL

### FR-005: Error Handling
- Graceful fallback if WSL unavailable
- Clear error messages for WSL issues
- Help text for WSL setup

## Technical Design

### WSL Execution
```typescript
function executeInWsl(command: string, distro: string): ChildProcess {
  const wslCommand = `wsl -d ${distro} -- ${command}`;
  return spawn('wsl', ['-d', distro, '--', 'bash', '-c', command], {
    shell: true,
    env: { ...process.env, WSLENV: 'PATH/l' }
  });
}
```

### Path Conversion
```typescript
function toWslPath(windowsPath: string): string {
  // C:\Users\name\project → /mnt/c/Users/name/project
  const match = windowsPath.match(/^([A-Za-z]):\\(.*)$/);
  if (match) {
    const drive = match[1].toLowerCase();
    const rest = match[2].replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
  }
  return windowsPath;
}

function toWindowsPath(wslPath: string): string {
  // /mnt/c/Users/name/project → C:\Users\name\project
  const match = wslPath.match(/^\/mnt\/([a-z])\/(.*)$/);
  if (match) {
    const drive = match[1].toUpperCase();
    const rest = match[2].replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
  }
  return wslPath;
}
```

### Configuration Schema
```json
{
  "draagon.wsl.enabled": {
    "type": "boolean",
    "default": false,
    "description": "Run Claude CLI through WSL"
  },
  "draagon.wsl.distro": {
    "type": "string",
    "default": "Ubuntu",
    "description": "WSL distribution to use"
  },
  "draagon.wsl.claudePath": {
    "type": "string",
    "default": "claude",
    "description": "Path to Claude CLI in WSL"
  }
}
```

## Acceptance Criteria
- [ ] Claude runs correctly through WSL
- [ ] File paths converted correctly
- [ ] Configuration options work
- [ ] Error messages clear when WSL unavailable
- [ ] Works with different WSL distros
