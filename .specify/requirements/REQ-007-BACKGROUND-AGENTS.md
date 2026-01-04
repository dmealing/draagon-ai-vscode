# REQ-007: Background Agent Status

**Priority:** Low
**Estimated Effort:** 1 day
**Dependencies:** REQ-001 (Core Extension)
**Blocks:** None

---

## 1. Overview

### 1.1 Vision
Show status indicators for background agents running in parallel.

### 1.2 Problem
Claude Code v2.0.60 added background agent support. Users have no visibility into what's running in the background.

---

## 2. Requirements

### 2.1 Agent Detection

**ID:** REQ-007-01

#### Detection
- `Task` tool with `run_in_background: true`
- `TaskOutput` results for completion

#### State
```typescript
interface BackgroundAgent {
  id: string;
  description: string;
  startedAt: Date;
  status: 'running' | 'completed' | 'failed';
}
```

#### Acceptance Criteria
- [ ] Background agent spawn detected
- [ ] Agent completion detected
- [ ] State tracked correctly

---

### 2.2 Status Indicator

**ID:** REQ-007-02

#### Display
- Badge in header: "⚡ 2 agents"
- Expandable list showing agent details

#### Mockup
```
Header: [⚡ 2]

Expanded:
┌─────────────────────────────────────┐
│ Background Agents (2)               │
├─────────────────────────────────────┤
│ 🔄 Exploring codebase    (0:45)     │
│ 🔄 Running tests         (0:12)     │
└─────────────────────────────────────┘
```

#### Acceptance Criteria
- [ ] Count badge visible when agents running
- [ ] Expandable details list
- [ ] Duration displayed
- [ ] Clears when complete

---

## 3. Acceptance Checklist

- [ ] Background agents detected
- [ ] Count indicator displayed
- [ ] Details viewable
- [ ] Completion updates UI
