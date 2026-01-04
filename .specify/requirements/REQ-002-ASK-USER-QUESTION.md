# REQ-002: AskUserQuestion Tool Support

**Priority:** High
**Estimated Effort:** 1-2 days
**Dependencies:** REQ-001 (Core Extension)
**Blocks:** None

---

## 1. Overview

### 1.1 Vision
Enable Claude to pause execution and present interactive multiple-choice questions to the user, collecting responses before continuing.

### 1.2 Problem
When Claude uses the `AskUserQuestion` tool, the extension must render a UI for the user to respond. Without this, Claude falls back to text-based questions.

### 1.3 Success Metrics
- Questions render with clickable options
- User selections send back to Claude
- Claude continues with the answer context

---

## 2. Requirements

### 2.1 Tool Detection

**ID:** REQ-002-01

#### Description
Detect AskUserQuestion tool_use in Claude's output.

#### Detection Logic
```typescript
if (content.type === 'tool_use' && content.name === 'AskUserQuestion') {
  const questions = content.input.questions;
  showQuestionUI(content.id, questions);
  pauseProcessing();
}
```

#### Acceptance Criteria
- [ ] AskUserQuestion tool detected
- [ ] tool_use_id stored for response
- [ ] Questions array extracted correctly

---

### 2.2 Question UI Component

**ID:** REQ-002-02

#### Description
Render interactive question card in chat.

#### Input Schema
```typescript
interface Question {
  question: string;      // "What type of auth?"
  header: string;        // "Auth type" (max 12 chars)
  options: Option[];     // 2-4 options
  multiSelect: boolean;  // Allow multiple selections
}

interface Option {
  label: string;         // "OAuth 2.0"
  description: string;   // "Third-party login..."
}
```

#### UI Components
- Question card container (distinct styling)
- Header badge/chip
- Question text
- Options list:
  - Radio buttons (single select)
  - Checkboxes (multi select)
  - Option label (bold)
  - Option description (muted)
- "Other" text input (always present)
- Submit button

#### Acceptance Criteria
- [ ] Card visually distinct from messages
- [ ] Header badge displays
- [ ] Options render with correct input type
- [ ] Descriptions show below labels
- [ ] "Other" option always available
- [ ] Submit button enabled when selection made

---

### 2.3 Multi-Question Support

**ID:** REQ-002-03

#### Description
Handle multiple questions in single request.

#### Display Options
1. **Sequential** - Show one at a time, next on answer
2. **All at once** - Show all questions in one card

#### Recommended: All at once
- Simpler implementation
- User sees full context
- Single submit for all

#### Acceptance Criteria
- [ ] Multiple questions render in order
- [ ] Each question has its own options
- [ ] All answers collected before submit

---

### 2.4 Response Handling

**ID:** REQ-002-04

#### Description
Send user's answers back to Claude.

#### Response Format
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [{
      "type": "tool_result",
      "tool_use_id": "toolu_xxx",
      "content": {
        "answers": {
          "0": "OAuth 2.0",
          "1": ["Option A", "Option B"]
        }
      }
    }]
  }
}
```

#### For "Other" selections
```json
{
  "answers": {
    "0": "Custom: user's typed text"
  }
}
```

#### Acceptance Criteria
- [ ] Answers formatted correctly
- [ ] tool_use_id included
- [ ] Sent to Claude stdin
- [ ] Processing resumes after send

---

### 2.5 State Management

**ID:** REQ-002-05

#### Description
Track pending question state.

#### State
```typescript
interface PendingQuestion {
  toolUseId: string;
  questions: Question[];
  answers: Map<number, string | string[]>;
  timestamp: Date;
}
```

#### Behavior
- Store pending question on detection
- Block new messages while question pending
- Clear state after submission
- Timeout after 5 minutes (optional)

#### Acceptance Criteria
- [ ] Can't send new message while question pending
- [ ] State cleared after submit
- [ ] UI indicates waiting for answer

---

## 3. UI Design

### 3.1 Question Card Mockup

```
┌─────────────────────────────────────────────────┐
│ ┌──────────┐                                    │
│ │Auth type │  ← Header badge                    │
│ └──────────┘                                    │
│                                                 │
│ What type of authentication would you like      │
│ to add to your app?                             │
│                                                 │
│ ○ OAuth 2.0                                     │
│   Third-party login via providers like Google   │
│                                                 │
│ ○ JWT tokens                                    │
│   Stateless token-based authentication          │
│                                                 │
│ ○ Session-based                                 │
│   Traditional server-side sessions with cookies │
│                                                 │
│ ○ Other: [____________________________]         │
│                                                 │
│                              [Submit Answer]    │
└─────────────────────────────────────────────────┘
```

### 3.2 Styling

```css
.question-card {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-focusBorder);
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
}

.question-header {
  display: inline-block;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 12px;
}

.question-text {
  font-size: 14px;
  margin-bottom: 16px;
}

.option-item {
  display: flex;
  align-items: flex-start;
  margin: 8px 0;
  cursor: pointer;
}

.option-label {
  font-weight: 500;
}

.option-description {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  margin-left: 24px;
}

.other-input {
  margin-left: 24px;
  width: calc(100% - 48px);
}

.submit-btn {
  float: right;
  margin-top: 12px;
}
```

---

## 4. Testing

### 4.1 Test Cases

| ID | Scenario | Expected |
|----|----------|----------|
| T01 | Single question, single select | Radio buttons, one selection |
| T02 | Single question, multi select | Checkboxes, multiple allowed |
| T03 | Multiple questions | All render, all answered |
| T04 | "Other" selected | Text input enabled, value sent |
| T05 | Submit without selection | Button disabled |
| T06 | Cancel/dismiss | Question cleared, error to Claude |

### 4.2 Integration Test

```typescript
it('should handle AskUserQuestion flow', async () => {
  // Simulate Claude sending AskUserQuestion
  await simulateClaudeMessage({
    type: 'tool_use',
    name: 'AskUserQuestion',
    id: 'toolu_123',
    input: {
      questions: [{
        question: 'Which option?',
        header: 'Choice',
        options: [
          { label: 'A', description: 'Option A' },
          { label: 'B', description: 'Option B' }
        ],
        multiSelect: false
      }]
    }
  });

  // Verify UI shows
  expect(screen.getByText('Which option?')).toBeVisible();

  // Select option
  await userEvent.click(screen.getByLabelText('A'));
  await userEvent.click(screen.getByText('Submit Answer'));

  // Verify response sent
  expect(mockClaudeProcess.send).toHaveBeenCalledWith({
    type: 'user',
    message: {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: 'toolu_123',
        content: { answers: { '0': 'A' } }
      }]
    }
  });
});
```

---

## 5. Acceptance Checklist

- [ ] AskUserQuestion tool detected in stream
- [ ] Question card renders with proper styling
- [ ] Single-select uses radio buttons
- [ ] Multi-select uses checkboxes
- [ ] "Other" option with text input works
- [ ] Submit sends properly formatted response
- [ ] Claude continues processing after answer
- [ ] Multiple questions in one request handled
