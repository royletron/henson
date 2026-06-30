---
title: 'Git: ticket branches + host-as-origin for resumable remote work'
state: review
priority: medium
createdBy: c1bf55fe-3e93-410d-94a7-cfde4dc1f80e
assignee: Waldorf the Compiler
labels:
  - v2
  - git
created: '2026-06-30T12:53:27.168Z'
updated: '2026-06-30T13:16:43.816Z'
order: 0
subtasks:
  - title: Write the git-workflow design note in docs/
    done: true
  - title: >-
      Add ensureTicketBranch + existing-branch worktree helpers to core/git.ts
      with tests
    done: true
  - title: >-
      Wire local per-ticket runs to branch-per-ticket + resume in
      runner/manager.ts with tests
    done: true
  - title: >-
      Raise host-as-origin remote follow-up ticket, update core/git memory, move
      ticket to review
    done: true
---

Follow-up from `9ai5-mfx` (Subtasking). That ticket delivered the resumable-subtask core (breakdown assessment + `plan_subtasks`/`complete_subtask` + resume-from-first-unfinished-step in the prompt). It deliberately left out the larger git-workflow rework the ticket also sketched, because it's a separate, substantial piece:

1. **A branch per ticket.** Create `<prefix><ticketId>` up front when a ticket starts (the `per-ticket` commit mode already names such branches at *land* time — this would move branch creation to dispatch time so work accumulates on it).
2. **Commit small & frequently, push to the ticket branch.** Workers push as they go rather than emitting one squashed patch at the end.
3. **Host as `origin` for remote (guest) workers.** Turn the host repo into a remote guests can push to, so their commits land on the host branch live (today guests return a single diff via `landGuestPatch`; see memory `core/git`).
4. **Resume from the host branch.** If a remote worker dies, the branch survives on the host; a re-run checks it out and continues. This likely means **removing the "ignore git history" snapshot behaviour** (`captureSnapshotRef`) for this path so re-runs see prior commits.
5. **Finalise per the project's merge strategy** (merge to main / keep the ticket branch) when the work is complete.

Interacts with: `landGuestPatch`, `addRunWorktree`, snapshotting (`core/git`), worktree isolation (`runner/isolation`), and the `CommitStrategy`/`per-ticket` mode in `core/types`. Worth a design note in `docs/` before implementing.

The subtask layer is independent of this and works under the current diff-based landing today.
