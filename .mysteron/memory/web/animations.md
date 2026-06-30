---
name: web/animations
description: Where UI animations live in the web client and the conventions for adding more
metadata:
  type: project
---

All web UI animation is plain CSS keyframes + utility classes in `web/src/styles.css`
(inside `@layer components` for the classes, bare `@keyframes` below). There is no JS
animation lib. Every animation must also be listed in the `@media (prefers-reduced-motion: reduce)`
block at the bottom of styles.css (set `animation: none`) — that block is the contract.

Existing classes: `.live-dot` (running pulse), `.pulse`, `.logo-glow`, `.card-running`
(red glow on a live ticket card), `.drawer` (slide-in).

Ticket `koAw5JiT` ("Animate Everything") added:
- `.card-enter` — one-shot scale+fade entrance on every board ticket card in `Board.tsx`.
  Relies on Preact keying by ticket id: a card only re-mounts (and so re-animates) when it's
  genuinely new or moved to another column, so reorders/refreshes don't re-trigger it.
- `.subtask-done` / `.check-pop` / `.bar-complete` — fire when a subtask flips open→done on a
  live run. Driven by `useJustCompleted(subtasks)` in `web/src/ui.tsx`, which diffs the
  previous vs current `done[]` and seeds pre-done steps silently on first render (so only
  steps that actually change celebrate). See [[web/subtasks-ui]] and [[core/subtasks]].
