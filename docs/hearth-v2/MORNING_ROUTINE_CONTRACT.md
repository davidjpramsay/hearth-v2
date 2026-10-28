# Morning Routine v1 — D-120

Morning Routine is a separate, optional household module (`morningRoutine`). It has its own
participant selection and ordered per-person checklists; it never changes chores, pocket money,
calendar or medical records. This is a family checklist, not proof that an action happened.
Defaults are weekdays and 07:00–08:00 in the household timezone. Order is suggested: any step
may be checked or unchecked. Before first save, select all current children with empty lists.
After saving, selection is explicit; new people are not silently included. No personal routine
or photograph is shipped in migrations, demos, tests or source control.

## Settings and daily progress

Adult-only `/admin/morning-routine` edits start/end time, participants and each person's steps,
including accessible Move up/Move down controls. Maximum 20 people, 12 steps each and 80 characters
per title. An empty selection is valid. Deselection retains that person's saved list. The module
starts off; off hides routes, blocks all feature API/HA navigation and retains configuration and
progress. Core module management remains available.

`/morning-routine` presents the countdown and up to three person cards per TV page. Standard
five-step lists fit together at every supported TV size, including 1280×640. Use the space for
steps rather than an eyebrow, duplicated next-step heading or permanent instruction/status row.
Routine save feedback remains announced; errors/refresh actions stay visible. Unusually long
labels/lists retain bounded step pages; phones stack cards naturally. Show positive progress
without ranking children or showing a combined household step count. Keep done steps in place,
with visible checks and undo. Use
readable targets, bounded TV height, D-pad/Back, reduced motion and both themes. No loud sounds,
auto-advancing focus, blocking expiry, punitive late state or automatic TV takeover.

The countdown follows current household-local time, never elapsed time since opening the screen.
Before start show the start time; during the window count down to the end; afterward show Time to
go without disabling unfinished steps. Weekends show a quiet weekday-only state. Completion is
stored by household, local date, person and stable step ID; a new local date has fresh checks
without deleting history. Reopening/restarting never resets today's progress. Reordering/text
edits keep step identity; removal/replacement uses a new ID. A server time response anchors the
client clock, with foreground/poll refresh and stale-day write rejection.

## Typed API and storage

Schemas: `packages/shared/src/morning-routine.ts`; pure clock policy in `packages/core`.

- `GET /api/v1/households/:householdId/morning-routine`: current dated view for authorised household
  readers, including paired displays. Safe person presentation, selected steps, completion versions,
  settings revision, timezone and generatedAt. No credentials or unrelated admin data.
- Adult `GET .../morning-routine/settings`: configuration plus current people.
- Adult `PUT .../morning-routine/settings`: requestId, expectedRevision and complete configuration.
  Compare-and-swap rejects stale editors; never silently overwrite another phone's edits.
- `PUT .../morning-routine/completion`: requestId, localDate, memberId, stepId, settingsRevision,
  expectedVersion, isCompleted. Only a selected current person/step on today's weekday may change.
  Paired screens and authorised household members may check/undo; HA credentials cannot.

Migration 0034 adds module availability and dedicated settings, progress and actor-scoped receipt
tables. Command/data/audit/receipt commit atomically. Exact same actor/request/payload retries
return their original result without reapplying; changed reuse conflicts. Version checks prevent
stale undos or saves. Authentication and module gates precede receipt lookup. Audit summaries omit
step titles; `morning-routine.changed` invalidates relevant caches. Read failures retain visible
saved progress but disable writes until current data returns. Unknown mutation outcomes retry the
same frozen request. Drafts survive errors and warn before leaving; no offline write queue.

## Home Assistant boundary

Add allowlisted tab `morning_routine` → `/morning-routine`. This only navigates an already visible,
approved screen through the existing acknowledged command protocol. Require explicit approval
containing `morningRoutine` in `moduleIds`; legacy grants are never expanded. Matching HA code
adds the tab label and module switch; no routine contents or completion endpoint is exposed to HA.

For the existing alarm automation, retain its wake/music/volume/safety actions. After its existing
Hearth launch and screen-online wait, choose Morning Routine on Monday–Friday only; preserve the
weekend branch. A time condition belongs inside the choice, not at the top of the alarm (which
would stop weekend music). Use the exact registered screen selector, bounded wait and no guessed
device/entity. Never run the wake/music automation as a deployment test.

Source verification, live installation, adult reconnect, household configuration and actual
weekday alarm execution are separate acceptance evidence. Live changes require the approved
release and a reviewed exact automation diff. No deployment is implied by local implementation.
