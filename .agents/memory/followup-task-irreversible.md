---
name: Follow-up task cancellation is irreversible
description: Cancelling a follow-up task (markFollowUpTaskObsolete) cannot be undone; verify before retracting.
---

# Cancelling a follow-up is a one-way door

`markFollowUpTaskObsolete({ taskRef })` sets the task to `CANCELLED`, which is a
**terminal** state. There is no supported way to bring it back:
- `markTaskInProgress` fails from CANCELLED: "cannot report working from state CANCELLED".
- `proposeFollowUpTasks` is **one-shot per assigned task**; once any follow-ups
  were proposed (even if all later marked obsolete), it rejects: "Follow-up tasks
  were already proposed for this task (all were marked obsolete). Do not propose again."
- `updateProjectTask` only edits content (title/description/deps), not state.

**Why:** I retracted a still-valid follow-up because I trusted a task summary
that paraphrased its title inaccurately. The real task was narrower and
represented genuine remaining work, so cancelling it lost it for good.

**How to apply:** before calling `markFollowUpTaskObsolete`, fetch the task with
`getProjectTask({ taskRef })` and confirm from its ACTUAL title/description that
the work is truly done or duplicated. Only retract a follow-up you have verified
is stale. If you've already lost one, surface the remaining work to the user in
your final message so they still have visibility.
