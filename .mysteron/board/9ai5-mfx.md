---
title: Subtasking
state: review
priority: medium
companionId: c1bf55fe-3e93-410d-94a7-cfde4dc1f80e
assignee: Waldorf the Compiler
labels: []
created: '2026-06-30T12:45:24.284Z'
updated: '2026-06-30T12:54:21.797Z'
order: 0
---

We are getting a lot of cases where a ticket is too big to be completed within a single round of quota. What tends to happen is it'll get 90% of the way there and then crap out, lose its state and go again later down the line. What we really need is resumable sub-task (todos) so at the start of the ticket we should do a quick assessment about whether it's something that would benefit from breakdown. We can then break this down into subtasks that can be completed as small discrete steps that need to be completed in order to deliver the whole ticket. If one subtask fails it should recover from the start of that one subtask, and continue. Generally we might find that we want to move the system for `git` what I think makes sense there is:

1. A branch is created for each ticket
2. Workers commit small and frequently, and push to this branch - it might mean we need to turn the host into an 'origin' server for remote works.
3. Each subtask checks out this branch and adds work to it
4. IF the remote worker dies, the branch still exists on the host - subsequent re-runs can pick up the branch and continue on (we may need to remove the ignore git history behaviour)
5. When the work is complete we run a final command to follow the merge strategy of the project (merge to main, keep the ticket branch etc).
