# REQ-005: Plan Mode Indicator

**Priority:** Medium
**Estimated Effort:** 0.5 days
**Dependencies:** REQ-001 (Core Extension)
**Blocks:** None

---

## 1. Overview

### 1.1 Vision
Show visual feedback when Claude enters "Plan Mode" to explore the codebase and create an implementation plan before executing.

### 1.2 Problem
Users don't know when Claude is in planning mode vs execution mode. This causes confusion about why Claude isn't making changes yet.

---

## 2. Requirements

### 2.1 Plan Mode Detection

**ID:** REQ-005-01

#### Detection
- Detect `tool_use` where `name === 'EnterPlanMode'`
- Detect `tool_use` where `name === 'ExitPlanMode'`

#### State
```typescript
interface PlanModeState {
  active: boolean;
  startedAt?: Date;
  planContent?: string;
}
```

#### Acceptance Criteria
- [ ] EnterPlanMode detected
- [ ] ExitPlanMode detected
- [ ] State tracked correctly

---

### 2.2 UI Indicator

**ID:** REQ-005-02

#### Display
- Badge in header: "📋 Plan Mode"
- Different message styling during plan mode
- Optional: progress indicator

#### Mockup
```
┌─────────────────────────────────────────────────┐
│ Draagon AI  v1.0.0  [📋 Plan Mode]  [⚙️]       │
└─────────────────────────────────────────────────┘
```

#### Styling
```css
.plan-mode-badge {
  background: var(--vscode-statusBarItem-prominentBackground);
  color: var(--vscode-statusBarItem-prominentForeground);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  animation: pulse 2s infinite;
}
```

#### Acceptance Criteria
- [ ] Badge visible when in plan mode
- [ ] Badge hidden when not in plan mode
- [ ] Animation indicates activity

---

### 2.3 Plan Content Display

**ID:** REQ-005-03

#### Optional Enhancement
Show the plan content in a collapsible section.

#### Acceptance Criteria
- [ ] Plan content captured from ExitPlanMode
- [ ] Displayed in collapsible section
- [ ] Formatted as checklist

---

## 3. Acceptance Checklist

- [ ] Plan mode entry detected
- [ ] Plan mode exit detected
- [ ] Visual indicator shown/hidden appropriately
- [ ] Plan content displayed (optional)
