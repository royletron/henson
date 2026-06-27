---
title: 'v2: Retry policy — attempt cap, backoff, and a dead-letter state'
state: backlog
priority: high
createdBy: c1bf55fe-3e93-410d-94a7-cfde4dc1f80e
labels:
  - v2
  - reliability
  - tech-debt
created: '2026-06-27T11:07:36.685Z'
updated: '2026-06-27T11:07:36.685Z'
---

**Reliability gap (raised by review `aX6J81M_`).** A ticket that keeps failing is retried forever with no cap and no backoff — a real hazard for the headline "leave it churning for days in yolo" use case.

**Today.** When a run fails (`manager.ts`): non-session crash → `failed`; patch-apply failure → ticket back to `ready`; usage-limit hit → ticket back to `ready`. The autopilot then re-dispatches that `ready` ticket on the *next tick* (~1.5s while busy). The only de-facto throttles are `BREATHER_MS`/`IDLE_POLL_MS` and the budget pause. So:
- **No attempt cap** — a poison ticket (bad acceptance criteria, an agent that can't make the tests pass) loops indefinitely.
- **No backoff/jitter** — immediate retry burns Claude budget on something that just failed, repeatedly.
- **No terminal failure state** — nothing ever lands a ticket in a "give up, a human should look" column, so the board can silently spin on one card forever.

**Proposal.**
- Track `attempts` per ticket (frontmatter, or on the queue work-item from the queue ticket `nCDlPpY-`).
- Exponential backoff + jitter between attempts; distinguish *retryable* (transient: patch conflict, session error, limit hit) from *non-retryable* (clean agent failure after a real try) so the policy can differ.
- After `maxAttempts`, move the ticket to a dead-letter/`needs-attention` state (or back to `backlog` with a `stuck` label + a note on why) instead of `ready`, and surface it in the UI.

**Acceptance.** A failing ticket stops being retried after N attempts and is visibly parked with the failure reason; retries are spaced by backoff; unit tests cover cap + backoff + the retryable/non-retryable split.
