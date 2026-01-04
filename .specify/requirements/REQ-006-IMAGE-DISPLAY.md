# REQ-006: Image Display Support

**Priority:** Medium
**Estimated Effort:** 1 day
**Dependencies:** REQ-001 (Core Extension)
**Blocks:** None

---

## 1. Overview

### 1.1 Vision
Display images inline in the chat when Claude references or generates them.

### 1.2 Problem
Claude Code v2.0.73 added image support with clickable `[Image #N]` links. Currently these just show as text.

---

## 2. Requirements

### 2.1 Image Detection

**ID:** REQ-006-01

#### Patterns to Detect
- `[Image #N]` references in text
- Image file paths in tool results
- Base64 encoded images

#### Acceptance Criteria
- [ ] Image references detected in text
- [ ] File paths recognized
- [ ] Base64 data handled

---

### 2.2 Image Rendering

**ID:** REQ-006-02

#### Display
- Inline thumbnail (max-width: 400px)
- Click to open full size
- Loading placeholder

#### Supported Formats
PNG, JPG, JPEG, GIF, WebP, SVG

#### Implementation
```typescript
function renderImage(src: string): string {
  return `
    <div class="image-container">
      <img src="${src}" alt="Image" class="chat-image" onclick="openFullSize('${src}')" />
      <div class="image-caption">Click to enlarge</div>
    </div>
  `;
}
```

#### Acceptance Criteria
- [ ] Images display inline
- [ ] Thumbnails sized appropriately
- [ ] Click opens full size
- [ ] Failed loads show placeholder

---

## 3. Acceptance Checklist

- [ ] Image references detected
- [ ] Images render inline
- [ ] Click to enlarge works
- [ ] Graceful error handling
