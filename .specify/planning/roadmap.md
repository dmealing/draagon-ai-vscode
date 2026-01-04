# draagon-ai-vscode Roadmap

**Last Updated:** 2026-01-04

---

## Current Status

The extension is in early development. Core infrastructure is in place:
- Extension scaffolding and activation
- Chat view provider structure
- Claude process management
- Basic webview setup

---

## Phase 1: Core Foundation (In Progress)

### REQ-001: Core Extension
- [x] Extension scaffolding
- [x] Activation events
- [ ] Command palette integration
- [ ] Status bar item
- [ ] Settings configuration UI

### REQ-002: Ask User Question
- [ ] Question dialog component
- [ ] Multi-select support
- [ ] Answer callback handling

---

## Phase 2: Chat Interface

### Chat View
- [ ] Webview panel with chat UI
- [ ] Message history display
- [ ] Markdown rendering
- [ ] Code block syntax highlighting
- [ ] Copy/insert code actions

### Claude Integration
- [ ] Claude CLI process spawning
- [ ] Streaming response handling
- [ ] Tool use rendering
- [ ] Thinking display (optional)

---

## Phase 3: Memory Integration (REQ-004)

### Connection to draagon-ai
- [ ] Memory client implementation
- [ ] Connection status indicator
- [ ] Retry/reconnection logic

### Memory View
- [ ] Display relevant memories
- [ ] Memory search
- [ ] Importance indicators
- [ ] Source provenance

---

## Phase 4: Advanced Features

### REQ-003: Multi-LLM Routing
- [ ] Model selection UI
- [ ] Complexity-based routing
- [ ] Cost estimation display

### REQ-005: Plan Mode
- [ ] Plan file display
- [ ] Approval workflow
- [ ] Step tracking

### REQ-007: Background Agents
- [ ] Agent orchestration
- [ ] Progress indicators
- [ ] Result display

---

## Phase 5: Polish & Release

### Quality
- [ ] 80%+ test coverage
- [ ] Performance optimization
- [ ] Accessibility audit

### Documentation
- [ ] User guide
- [ ] Screenshots/GIFs
- [ ] Configuration reference

### Release
- [ ] Marketplace listing
- [ ] Icon and branding
- [ ] CHANGELOG

---

## Future Considerations

- **REQ-006: Image Display** - Show images in chat
- **REQ-008: Custom AI Agents** - User-defined agents
- **Figma Integration** - Design-to-code workflows
- **GitHub Integration** - PR review agents
