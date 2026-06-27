---
title: MCP No Such Tool
state: bin
priority: medium
companionId: c1bf55fe-3e93-410d-94a7-cfde4dc1f80e
assignee: Waldorf the Compiler
labels: []
created: '2026-06-27T09:03:06.413Z'
updated: '2026-06-27T10:54:04.112Z'
order: 0
---

Seeing this when requesting tickets.

**Root cause**: `mysteron` is npm-linked to the project directory, so the MCP subprocess (started by Claude Code per-run) loads from the project's `node_modules`. A circular symlink in `node_modules` caused the MCP server to fail silently on startup — Claude Code proceeded with 26 built-in tools only, and the agent got "No such tool available" when it tried to call `mcp__mysteron__get_ticket`.

**Fix**: Agent prompt now explicitly names the file-based fallback path (`mcp__mysteron__get_ticket` → else read `.mysteron/board/<id>.md`) so the agent doesn't loop on tool errors if MCP is unavailable. The broken `node_modules` was also repaired via `npm install`.
