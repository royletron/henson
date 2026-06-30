---
name: core/subtasks
description: How a ticket is broken into resumable subtasks, where they live, and the tools that drive them
metadata:
  type: project
---

Ticket `9ai5-mfx` added **resumable subtasks**: a big ticket can be split into an
ordered list of small, independently-committable steps so a run that dies part-way
resumes from the first unfinished step instead of redoing everything.

**Data model** (`src/core/types.ts`): `Subtask = { title, done }`; `Ticket.subtasks?:
Subtask[]`. Absent for small tickets. Serialized in the ticket's **frontmatter**
(`src/core/board.ts` parse/serialize — `parseSubtasks` drops junk/blank titles).
Because the board lives in-tree under `.mysteron/` and is committed, completed steps
survive a dead run — that persistence *is* the resume mechanism.

**Mutation** goes through two lock-safe helpers (not the generic `updateTicket`, so
progress is recorded one step at a time and a stale full-list write can't clobber it):
- `setSubtasks(root, id, titles)` — replace the breakdown (empty list clears it).
  Re-planning **preserves the done flag** of any step whose title is unchanged.
- `completeSubtask(root, id, title?)` — mark the named step, else the first pending,
  done. Returns undefined if nothing pending matches.

**MCP** (`src/mcp/server.ts`, so guests get them too via `worker-mcp`): `plan_subtasks`
and `complete_subtask`. `get_ticket` already returns the subtasks.

**Prompt** (`buildPrompt` in `src/runner/manager.ts`, `subtasksSection`): no subtasks →
asks the agent to assess up front whether the ticket is too big for one run and, if so,
`plan_subtasks` + commit-and-`complete_subtask` per step. Subtasks present → "# Subtasks
(resume here)" checklist marking the first unfinished step. Rendered in both the full and
short-resume prompt branches.

**Not done here** — the larger git rework the ticket also sketched (branch-per-ticket,
host-as-origin, push-as-you-go, resume from the host branch) is follow-up ticket
`r4zbwCW8` (labels v2/git). The subtask layer is independent and works under today's
diff-based landing (see [[core/git]]). Related: [[runner/session-continuity]].
