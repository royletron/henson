---
title: Consider moving companion list + actions into a sidebar
state: review
priority: low
companionId: 82be1826-9999-453f-bbfc-999f8dc4a2dc
createdBy: 82be1826-9999-453f-bbfc-999f8dc4a2dc
assignee: Zoot the Swift
labels:
  - ui
  - follow-up
created: '2026-06-26T11:07:49.300Z'
updated: '2026-06-26T12:21:14.731Z'
order: 0
---

Follow-up from `c4LHNUy-` (Companion Runs On). That ticket noted we "might need to rejig the companion list / move actions into the side bar".

The "Runs on" host selector landed inline on each companion row in the Companion tab, which is fine at the current density. If companion rows get more crowded (host chips + brief + regenerate/delete + per-host status), revisit whether the companion list and its actions belong in a persistent sidebar instead of the tab body.

Optional polish — only worth doing if the inline layout starts to feel cramped.

---

**Resolution (Zoot the Swift, 2026-06-26):** Did *not* build a persistent sidebar — that's over-engineering against this ticket's own "only if cramped" guidance:
- The whole project view is tab-based; **no sidebar pattern exists anywhere** in the app, so a persistent sidebar would be a sizeable cross-tab/responsive change for a low-priority optional item.
- The predecessor's anticipated rejig already happened — the "Runs on" chips sit on their own wrapping row, separate from identity + actions.

Instead, applied a focused, class-only density polish to `CompanionRow` (`web/src/tabs.tsx`) so rows scale gracefully toward the anticipated additions:
- Header now wraps (`flex-wrap`) and the action buttons are grouped into a `shrink-0` cluster, so they drop below the name instead of squeezing on narrow widths.
- Long companion names truncate (`min-w-0` + `truncate`) rather than pushing the actions.
- The "Runs on" zone gets a subtle top divider, leaving visual room for a future per-host status without crowding.

No behaviour change, no new components/deps. `typecheck` ✓, `vite build` ✓, tests **92/92 pass**.

**Revisit the sidebar** if/when per-host status chips land and the two-row layout genuinely overflows — at that point a sidebar (or a collapsible row) becomes worth the architectural cost.
