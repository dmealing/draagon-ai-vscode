# REQ-005: Conversation History Browser

**Status:** COMPLETED
**Version:** 0.2.0
**Completed:** 2026-01-04

## Overview
Provide a browsable, searchable history of past conversations with the ability to resume any previous session.

## Priority
**MEDIUM** - Important for workflow continuity

## User Stories

### US-001: Browse Past Conversations
As a user, I want to see a list of my past conversations, so I can find and resume previous work.

### US-002: Search Conversations
As a user, I want to search through my conversation history, so I can find specific discussions.

### US-003: Conversation Metadata
As a user, I want to see conversation stats (tokens, cost, duration), so I can understand my usage patterns.

## Functional Requirements

### FR-001: Conversation List
- Show conversations in reverse chronological order
- Display: First message preview, timestamp, message count
- Group by date (Today, Yesterday, This Week, Older)
- Pagination for large histories

### FR-002: Conversation Index
- Maintain index file with conversation metadata
- Structure:
  ```json
  {
    "conversations": [{
      "id": "session_xxx",
      "filename": "conv_20260104_123456.json",
      "startTime": "2026-01-04T12:34:56Z",
      "endTime": "2026-01-04T13:00:00Z",
      "messageCount": 24,
      "totalCost": 0.0523,
      "totalTokens": { "input": 5000, "output": 2000 },
      "firstUserMessage": "Help me refactor...",
      "lastUserMessage": "Thanks, that works!"
    }]
  }
  ```

### FR-003: Search Functionality
- Full-text search across messages
- Filter by date range
- Filter by cost range
- Highlight matching terms

### FR-004: Resume Conversation
- Click to load conversation into chat
- Option to continue or start new branch
- Preserve message history display

### FR-005: Conversation Management
- Delete individual conversations
- Export conversation as Markdown
- Archive old conversations

### FR-006: Auto-save
- Save conversation on each message
- Handle VS Code close gracefully
- Recover from crashes

## Technical Design

### Storage Structure
```
{storageUri}/
  conversations/
    index.json
    conv_20260104_123456.json
    conv_20260104_140000.json
```

### Conversation File Format
```json
{
  "sessionId": "session_xxx",
  "startTime": "2026-01-04T12:34:56Z",
  "messages": [
    { "timestamp": "...", "type": "user", "content": "..." },
    { "timestamp": "...", "type": "assistant", "content": "..." }
  ],
  "metadata": {
    "totalCost": 0.0523,
    "totalTokens": { "input": 5000, "output": 2000 },
    "model": "claude-3.5-sonnet"
  }
}
```

### UI Components
1. History button in chat header
2. Slide-out panel with conversation list
3. Search bar with filters
4. Conversation cards with previews

## Configuration
- `draagon.history.maxConversations`: Max stored (default: 100)
- `draagon.history.autoSave`: Enable auto-save (default: true)
- `draagon.history.searchLimit`: Max search results (default: 50)

## Acceptance Criteria
- [ ] Conversation list displays correctly
- [ ] Search finds messages across conversations
- [ ] Resume loads conversation into chat
- [ ] Delete removes conversation
- [ ] Export creates valid Markdown
- [ ] Auto-save works reliably
