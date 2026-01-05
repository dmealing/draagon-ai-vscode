# REQ-007: Thinking Intensity Modes

**Status:** COMPLETED
**Priority:** Low
**Version:** 0.2.0
**Completed:** 2026-01-04

## Overview
Provide UI controls for different thinking intensity levels, allowing users to request deeper reasoning for complex problems.

## Priority
**LOW** - Nice-to-have enhancement

## User Stories

### US-001: Select Thinking Level
As a user, I want to choose how deeply Claude thinks about my question, so I can balance speed vs. thoroughness.

### US-002: Visual Indicator
As a user, I want to see which thinking mode is active, so I know what to expect.

## Functional Requirements

### FR-001: Thinking Modes
- **Default**: Standard reasoning
- **Think**: Extended thinking enabled
- **Think Hard**: More thorough analysis
- **Think Harder**: Deep multi-step reasoning
- **Ultrathink**: Maximum reasoning depth

### FR-002: Mode Selector UI
- Dropdown or button group in chat header
- Show current mode
- Persist selection across messages
- Reset option

### FR-003: Claude CLI Integration
- Map modes to CLI flags/prompts
- Include thinking instruction in system prompt
- Handle extended thinking output

### FR-004: Thinking Display
- Show thinking process for extended modes
- Collapsible thinking sections
- Duration indicator

## Technical Design

### Mode Configuration
```typescript
const THINKING_MODES = {
  default: { label: 'Default', instruction: null },
  think: { label: 'Think', instruction: 'Think step by step.' },
  thinkHard: { label: 'Think Hard', instruction: 'Think very carefully, considering multiple approaches.' },
  thinkHarder: { label: 'Think Harder', instruction: 'Engage in deep, multi-step reasoning. Consider edge cases and alternatives.' },
  ultrathink: { label: 'Ultrathink', instruction: 'Use maximum reasoning depth. Break down the problem systematically, verify each step, and consider all implications.' }
};
```

### UI Component
```html
<select id="thinking-mode" class="thinking-selector">
  <option value="default">🧠 Default</option>
  <option value="think">🤔 Think</option>
  <option value="thinkHard">💭 Think Hard</option>
  <option value="thinkHarder">🧩 Think Harder</option>
  <option value="ultrathink">🔮 Ultrathink</option>
</select>
```

## Acceptance Criteria
- [x] Mode selector visible in UI
- [x] Selection persists across messages
- [x] Thinking instruction included in prompts
- [x] Extended thinking displayed when available

## Implementation Notes

### Files Modified
- `src/thinking/modes.ts` - ThinkingModeManager class with mode definitions and `wrapMessage()` method
- `src/providers/chatViewProvider.ts` - Integration with ThinkingModeManager, handles `setThinkingMode` messages
- `src/ui/webview/content.ts` - Thinking mode selector UI and handlers
