---
title: Guest Ignoring Commit Rules
state: bin
priority: medium
companionId: 82be1826-9999-453f-bbfc-999f8dc4a2dc
assignee: Zoot the Swift
labels: []
created: '2026-06-26T11:44:50.295Z'
updated: '2026-06-27T10:53:56.595Z'
---

I just had a ticket that completely ignore the git commit rules I have set for the project. I can see from the log:
```
guest changes committed to branch mysteron/1jCct4Yz (2ee08b4a) — `git merge mysteron/1jCct4Yz` to bring them into your branch
```
Why didn't it just commit to main like the project determines?

---

**Root cause (Zoot):** Nothing was wrong with your "commit to main" setting — the landing logic was tripping over its own bookkeeping.

The project board (`.mysteron/`) is tracked in git, but the app rewrites those files in the working tree without committing them straight away. Dispatching this very run moves its ticket to `in-progress`, which edits `.mysteron/board/<ticket>.md`. By the time the guest's patch came back, `landGuestPatch` ran its "is the tree clean?" check, saw that board edit, concluded the tree was dirty, and bailed out to a dedicated `mysteron/<ticket>` review branch instead of fast-forwarding `main`.

**Fix:** the dirty-check now ignores board-only (`.mysteron/`) paths — the same policy `mergeBranch` already uses. Genuine uncommitted user edits still (correctly) push work onto a review branch so they're never clobbered, but the run's own board write no longer counts against it. Work now lands on `main` as configured.

- `src/core/git.ts` — `landGuestPatch` dirty-check excludes board paths.
- `test/git.test.ts` — regression test: board-only changes still land on the checked-out branch.

Tests: full suite green (92 passing) + typecheck clean.
