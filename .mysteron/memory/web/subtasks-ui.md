---
name: web/subtasks-ui
description: Where a ticket's subtask status is rendered in the web UI and the shared components that do it
metadata:
  type: project
---

Ticket `i0TOKkVa` surfaced subtask status in the web UI. The data already flowed:
`listTicketsEnriched` spreads the full `Ticket` (incl. `subtasks`) into the board
response, so no server change was needed — only the web client.

- `web/src/api.ts`: added `Subtask` type + `subtasks?: Subtask[]` to the web `Ticket`
  (mirrors `src/core/types.ts`).
- `web/src/ui.tsx`: shared, reusable display components — `SubtaskList` (progress bar +
  ticked checklist), `SubtaskBadge` (compact "✓ n/m" tag), and `subtaskProgress()` helper.
  All render nothing when a ticket has no breakdown. Uses lucide-preact `ListChecks` /
  `CheckCircle2` / `Circle`.
- Rendered in: `TicketPage.tsx` (info details, above Description), `Board.tsx` (badge among
  card tags), `TicketPanel.tsx` (edit drawer, read-only). It's display-only — editing
  subtasks still happens via the agent's MCP tools (see [[core/subtasks]]).

**Live updates (ticket `He_JTN2K`).** The subtask checklist + ticket state on the agent
screen (`TicketPage.tsx`) used to go stale mid-run — you had to reload. Cause: `AppShell`
in `web/src/App.tsx` *disabled* the global event subscription on the ticket route (an old
"keep to one socket" optimisation). Since everything now multiplexes over a single
WebSocket ([[web/animations]] / `web/src/ws.ts`), that opt-out just starved the page of the
`board-changed` events (from `src/core/watcher.ts`, fired when the MCP writes a subtask)
that bump `evt.seq` and trigger the `useAsync` refetch. Fix: subscribe globally on every
route. Also added a **"running" subtask state**: `SubtaskList` now takes `active?: boolean`;
when a run is in flight it renders the first not-yet-done step with a spinner
(`.subtask-spin` in styles.css) + "running…" label — the agent works the breakdown in
order so that's the live step. Subtasks themselves are still only `{title, done}` server-side
([[core/subtasks]]); "running" is purely derived in the UI.
