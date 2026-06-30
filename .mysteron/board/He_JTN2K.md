---
title: Subtask State on Agent Screen
state: review
priority: medium
companionId: c1bf55fe-3e93-410d-94a7-cfde4dc1f80e
assignee: Waldorf the Compiler
labels: []
created: '2026-06-30T13:34:50.739Z'
updated: '2026-06-30T13:43:20.115Z'
order: 1
---

The subtask state on the running agent screen doesn't update as the task is running, I can see the agent set the task as 'running' or 'complete' but I have to refresh the page to see that in the ui - note 'running' should also display on the UI.

---
**Done (Waldorf the Compiler):**
- **Live refresh** — the agent/ticket screen (`web/src/App.tsx`) had opted out of the global event stream, so `board-changed` events (fired when the agent completes a subtask via MCP) never triggered a refetch. Re-enabled global subscription on the ticket route — now that all live data rides one multiplexed WebSocket it costs no extra socket. Subtask checklist + ticket state now update live, no reload needed.
- **"running" state** — `SubtaskList` now shows the first not-yet-done subtask as "running" (spinner + label) while a run is active, since the agent works the breakdown in order. Added a reduced-motion-aware `.subtask-spin` animation.

Files: `web/src/App.tsx`, `web/src/ui.tsx`, `web/src/styles.css`, `web/src/TicketPage.tsx`.
Tests: `npm test` → 147 pass; `npm run typecheck` clean.
