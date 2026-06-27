---
title: Error
state: bin
priority: medium
companionId: c1bf55fe-3e93-410d-94a7-cfde4dc1f80e
assignee: Waldorf the Compiler
labels: []
created: '2026-06-27T09:39:48.435Z'
updated: '2026-06-27T10:53:56.602Z'
---

Seen on previous ticket

```
could not apply the run's patch (Command failed: git -C /tmp/mysteron-apply-dZkhbP8uyL -c user.name=Mysteron -c user.email=mysteron@local commit -q -m Fail on resume
```

## Root cause
A resumed run re-emits a diff whose changes are **already present** in the base. The patch is non-empty (so it passes the `patch.trim()` guard in the runner), but `git apply --3way` applies it as a clean no-op, leaving an empty staging area. `git commit` then fails with `nothing to commit, working tree clean`, which `landGuestPatch` reported as a failed apply.

## Fix
`landGuestPatch` (`src/core/git.ts`) now checks `git diff --cached --quiet` after `git add -A`; when nothing is staged it cleans up the throwaway worktree/branch and returns a new `mode: "noop"`. Both runner callers (`landLocalRun`, `applyGuestResult`) treat `noop` as "changes already present — nothing to land" instead of crashing, and leave the run un-applied/un-failed.

Added a regression test in `test/git.test.ts`. Full suite green (96 tests). Recorded the gotcha in `core/git` memory.
