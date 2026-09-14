# Trampoline analytics event catalog

Trampoline uses the optional Replit-injected Umami tracker for aggregate product
outcomes. The app does not load an analytics script or send identity, note,
health, or other user-entered values. If the tracker is unavailable, events are
ignored.

## Account

| Event name | Description | Dimensions |
| --- | --- | --- |
| `account_login_succeeded` | Login completed successfully. | None |
| `account_registration_succeeded` | Account registration completed successfully. | None |

## Training sessions

| Event name | Description | Dimensions |
| --- | --- | --- |
| `training_session_saved` | A new or existing execution/ToF/training session was persisted by the server. | `session_type`: `execution`, `tof`, or `training`; `operation`: `create` or `update` |
| `training_session_queued` | A new or existing session was confirmed into the offline queue. | `session_type`: `execution`, `tof`, or `training`; `operation`: `create` or `update` |
| `training_session_save_failed` | A session save/update failed at its existing error confirmation point. | `session_type`: `execution`, `tof`, or `training`; `operation`: `create` or `update` |

Queue events fire only when the user action is first confirmed as queued; queue
replay does not emit another event.

The `training` type is the main note-dialog End training/manual save flow.
Automatic cleanup saves are intentionally not instrumented.

## Library creation

| Event name | Description | Dimensions |
| --- | --- | --- |
| `skill_created` | A skill-library create completed on the server. | `kind`: `skill`, `shape`, `drill`, `connection`, or `routine_part` |
| `routine_created` | A routine create completed on the server. | None |

Offline-created library entries and their queue replays are not counted.

## WHOOP connection

| Event name | Description | Dimensions |
| --- | --- | --- |
| `whoop_connect_clicked` | User selected the WHOOP connect action. | `entrypoint`: `dashboard` |
| `whoop_connect_callback` | The recognized OAuth callback result was handled. | `outcome`: `connected`, `denied`, `state_mismatch`, `link_failed`, or `not_configured` |