# REQ-003: Image and Clipboard Support

**Status:** COMPLETED
**Version:** 0.2.0
**Completed:** 2026-01-04

## Overview
Enable users to include images in their messages to Claude via drag-and-drop or clipboard paste.

## Priority
**MEDIUM** - Important for visual context sharing

## User Stories

### US-001: Drag and Drop Images
As a user, I want to drag and drop images into the chat, so I can share screenshots or diagrams with Claude.

### US-002: Paste from Clipboard
As a user, I want to paste images from my clipboard (Ctrl+V), so I can quickly share screenshots.

### US-003: View Embedded Images
As a user, I want to see thumbnails of attached images in the chat, so I can confirm what I'm sending.

## Functional Requirements

### FR-001: Drag and Drop Handler
- Accept drag events on chat input area
- Support formats: PNG, JPG, JPEG, GIF, WebP, BMP, SVG
- Show drop zone highlight when dragging
- Display preview after drop

### FR-002: Clipboard Paste Handler
- Listen for paste events in chat input
- Detect image data in clipboard
- Convert clipboard image to file
- Show preview after paste

### FR-003: Image Storage
- Store images in `.draagon/images/` in workspace
- Generate unique filenames with timestamp
- Format: `image_YYYYMMDD_HHMMSS_xxx.png`
- Clean up old images (configurable retention)

### FR-004: Image Preview
- Show thumbnail in chat input area
- Display image dimensions
- "Remove" button to discard
- Support multiple images per message

### FR-005: Claude Integration
- Convert images to base64 for Claude API
- Include in message content array
- Support vision-capable models

### FR-006: Image in Message History
- Display images inline in chat history
- Clickable to open full size
- Show in conversation exports

## Technical Design

### Components
1. Drag-drop handlers in webview JavaScript
2. Image processing utilities
3. Storage manager for image files
4. Base64 encoding for Claude API

### Message Format
```typescript
interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  image?: {
    path: string;
    base64: string;
    mimeType: string;
    dimensions: { width: number; height: number };
  };
}
```

### CSS for Drop Zone
```css
.chat-input.drag-over {
  border: 2px dashed var(--vscode-focusBorder);
  background: var(--vscode-editor-selectionBackground);
}

.image-preview {
  max-width: 200px;
  max-height: 150px;
  border-radius: 4px;
  margin: 4px;
}
```

## Configuration
- `draagon.images.storagePath`: Custom storage location
- `draagon.images.maxSize`: Max image size in MB (default: 10)
- `draagon.images.retentionDays`: Days to keep images (default: 30)

## Acceptance Criteria
- [ ] Drag and drop images works
- [ ] Ctrl+V paste from clipboard works
- [ ] Preview thumbnails appear before sending
- [ ] Images stored in workspace
- [ ] Images sent to Claude correctly
- [ ] Images display in chat history
