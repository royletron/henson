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
