---
name: Validation reviews the active task, not the conversation topic
description: Why a mark_task_complete code-review can reject work you didn't do, and how to respond.
---

On `mark_task_complete`, the platform runs a managed code-review validation that judges the
git diff against the **currently assigned project task's** acceptance criteria — which can be a
DIFFERENT task than the one the resumed conversation/summary is about (e.g. a prior task already
merged, and the active task is now a follow-up).

**Why:** A resumed session's summary describes the task that produced the conversation, but the
platform may have already merged that work and advanced the active task. The validation always
checks the active task.

**How to apply:** If a code-review verdict references a task you didn't touch, do NOT dismiss it.
The task specs live in `.local/tasks/<name>.md` — read the named task's spec, check the actual
repo state against its "Done looks like", and implement the gap. Concrete acceptance details in
the verdict (exact strings, field values) come straight from that spec and are authoritative.
