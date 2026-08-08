# Hearth v2 domain and data model

This document defines conceptual entities and invariants. Concrete table/column names may evolve through migrations, but ownership and history rules should remain stable.

## Identity and tenancy

### Household

- `id`
- `name`
- `timezone` — defaults to `Australia/Perth`
- locale and week-start preferences
- created/updated timestamps

The first deployment serves one household, but household IDs remain explicit so test data and future separation are safe.

### Member

- `id`, `household_id`
- display name
- original colour/avatar settings
- role/capabilities
- active/archive state
- optional external calendar identity mappings

Known example data such as Ezra must be seeded only in demo/development data until the household configuration is intentionally created.

### Actor

Audit commands identify an actor as one of:

- authenticated member
- paired television device
- Home Assistant service/voice pipeline acting for a member or household
- scheduled system job
- external calendar synchroniser

## Calendar projection

### Calendar connection

- provider type
- household/member owner
- credential reference, never raw secret content
- sync status, last success/error category
- opaque incremental cursor plus bounded local-date sync window
- read/write capabilities and approval state

### Calendar

- provider-stable external ID
- connection ID
- display name, colour and visibility
- owner/member mapping
- read-only/write policy

### Calendar event projection

- internal opaque ID plus provider external ID/version
- calendar ID
- title, description, location
- all-day flag
- start/end instant plus an inclusive household-local date range
- recurrence/master relationship and explicit exception state where the provider exposes it
- attendee/organiser summary only as needed
- source modified time and Hearth sync time
- deleted/tombstone state

The provider is authoritative. This table is a local projection/cache and pending-command aid, not a competing calendar.

The browser-safe `WeekSchedule` day model may include a nullable compact daily
forecast containing a normalized condition code, family-readable label and
Celsius temperature. Phase 1 demo forecasts are deterministic seeded data; no
weather provider, credential or new system of record is implied by this display
contract.

The browser-safe `MonthSchedule` is a read projection rather than a new stored
calendar model. It contains a Monday-first 42-day grid window, normalized events
overlapping that window and the same browser-safe calendar descriptors used by
Week. Date cells render event colours only; the source/member avatar and label
remain in a separate key so colour is never the sole identity cue.

Provider deletions are retained as tombstones so a cancelled occurrence cannot
reappear merely because the provider is temporarily unavailable. Raw provider
errors and credentials are not projection data.

For the first real adapter, `provider_type = 'caldav'`. Calendar collection
URLs and reversible server-only event references may occupy the existing
external-ID columns, while browser responses continue to expose only hashed
Hearth IDs. A bounded CalDAV refresh is authoritative only for its requested
date window: the transaction hides collections absent from discovery,
tombstones active rows overlapping that window, then restores returned rows.
The external credential/config file is never stored in SQLite.

## Chores and routines

### Chore template

- household ID
- title, description and optional icon
- default assignee set
- recurrence rule
- routine/time-of-day grouping
- due-time policy
- active date range and archive state
- creation/update history reference

### Chore occurrence

- stable occurrence ID
- template snapshot/reference
- scheduled local date and due time
- assigned member(s)
- state: pending, completed, skipped, excused or cancelled
- completion timestamp, actor and optional note

Template edits do not rewrite historical occurrences. Generate occurrences within a controlled horizon and enforce a uniqueness rule for template/date/instance.

### Routine

- name, ordering and active time window
- member applicability
- contained chore template references/order

Routines group chores; they do not duplicate completion state.

## Pocket money

### Pocket-money setting

- household and child member
- required weekly amount in integer Australian cents
- payday, constrained to a weekday name
- creation/update timestamps

Only active child members may receive a setting. New children appear as unconfigured until an adult supplies the required weekly amount and payday.

### Pocket-money payment

- household and child member
- Monday week start and Sunday week end
- scheduled and completed counts at payment time
- completion percentage and proportional amount in cents
- payment timestamp, adult actor and source

There is at most one recorded payment per child and week. Payment rows are immutable snapshots rather than a mutable balance. Chores in `excused` or `cancelled` state are excluded from the denominator; `pending` and `skipped` remain incomplete. Migration `0009_pocket_money.sql` introduces these records. The former reward tables from migration 0005 remain dormant for forward-only migration safety; no route, UI or chore command writes them.

## Lists

### List

- household ID
- name, type, colour and ordering
- owner/member visibility
- active/archive state

### List item

- list ID
- text and optional quantity/note
- assignee and due date where relevant
- position
- checked state, checked time and actor
- archive state

Repeated voice additions should use a command request ID and sensible normalisation to avoid accidental duplicates without preventing intentional duplicates.

## Meals

### Meal

- saved family meal name
- optional description, tags and source/reference URL
- favourite/archive state

### Meal plan entry

- household local date
- meal slot such as breakfast/lunch/dinner
- saved meal reference or free text
- note and actor

Recipe/ingredient modelling is deferred. Grocery linkage should use explicit generated list items with source references so changes remain understandable.

## Photos and ambient content

### Photo asset

- provider/path-relative opaque ID
- approved source collection
- safe derivative URLs/keys
- dimensions, orientation, capture time where available
- favourite/hidden state
- last shown time

Do not expose Synology filesystem paths to clients. Derivatives should avoid repeatedly sending original multi-megabyte files to the television.

`TodaySummary` may carry one nullable, same-origin photo preview containing only
a safe derivative URL and family-readable alternative text. `PhotoGallery`
returns the approved collection summary, source readiness, freshness, one
nullable featured opaque ID and orientation-aware assets containing only safe
same-origin display/thumbnail URLs. Phase 7 selects the Today preview through
that same injected adapter. Demo mode uses fictional bundled derivatives;
private mode returns an unconfigured empty collection until one approved
Synology source is selected. Neither response exposes its Synology path.

### Announcement

- title/body
- priority
- optional author/member scope
- start and expiry times
- acknowledged/dismissed state where applicable

## Home actions

### Home action definition

- stable Hearth action ID
- display label/icon/category
- mapped Home Assistant target
- typed input schema
- required confirmation level
- allowed roles
- enabled state

Hearth stores no Jellyfin library, Music Assistant connection or media/player projection. The separate Home Assistant/Music Assistant deployment owns its own source, queue and player configuration. The Home Assistant power-safety adapter exposes only a generic protected-media-active boolean covering native-app and Cast playback; it must not turn Hearth into a playback controller.

Migration `0006_home_assistant_projection.sql` stores the last successful
curated state: occupancy, television power, Hearth-foreground state, the
generic protected-media boolean and observation/cache timestamps. Home action
receipts and audits reuse the generic command/audit tables. Raw entity IDs,
service payloads and media metadata are deliberately absent.

## Devices and sessions

### Paired device

- device ID/name/type
- credential hash/reference and scopes
- paired/last-seen timestamps
- revoked state
- application version and basic capabilities

Migration `0002_admin_and_pairing` implements the initial paired-device and
short-lived pairing-request records. Migration `0007_tv_device_credentials`
adds the SHA-256 credential hash, requesting shell version and exchange time.
The server never stores the raw television pairing secret; Android retains it
encrypted by a non-exportable Keystore key.

### Session

Short-lived authenticated session with actor/device, expiry and scope. Do not persist raw bearer secrets in logs or audit rows.

## Audit event

Required fields:

- event ID and timestamp
- household ID
- actor type and actor ID
- source channel: TV, companion, voice, automation, sync or system
- command/action type
- target type and target ID
- request/idempotency ID where applicable
- result: succeeded, rejected, failed or reversed
- safe structured summary

Sensitive descriptions, provider tokens and full external payloads do not belong in the audit event.

## General persistence rules

- Opaque IDs at API boundaries.
- UTC instants in storage; explicit household timezone for local-date rules.
- `created_at`/`updated_at` on mutable records.
- Archive/tombstone externally referenced records rather than casually deleting them.
- Transactions encompass domain mutation plus audit creation.
- Foreign keys and uniqueness constraints enforce invariants already checked in code.
- Schema changes use reviewed migrations and backup/restore tests.

## Phase 1–4 migration and runtime boundary

Migration `apps/server/src/migrations/0001_household_core.sql` establishes the
forward-only household/member, calendar connection/projection, chore
template/occurrence, command receipt and audit-event foundation. Automated
smoke tests enable WAL and foreign keys and exercise uniqueness and foreign-key
failures against a temporary SQLite database.

Migration `0002_admin_and_pairing.sql` adds explicit member capabilities,
short-lived pairing requests and revocable television devices. Migration
`0003_chore_runtime.sql` adds template assignees plus occurrence skip metadata.

Migration `0004_calendar_projection.sql` adds durable provider cursor/window
state, recurrence-exception metadata and local-date projection indexes.
Migration `0005_household_planning.sql` adds household lists/items, saved meals,
meal-plan entries and the now-dormant historical reward tables. A
unique reversal reference prevents reversing the same ledger entry twice, and
a partial unique index prevents awarding the same chore occurrence twice.
Migration `0006_home_assistant_projection.sql` adds the minimal cached household
power/presence projection. Migration `0007_tv_device_credentials.sql` upgrades
the pairing record for proof-of-possession exchange without storing a bearer
secret.

The Phase 2 demo runtime injects the SQLite implementation of the same
repository boundary. It generates supported daily and weekly occurrences on
query, snapshots title/routine/assignee identity, and commits occurrence
mutation, audit and idempotent receipt transactionally. Duplicate request IDs
replay the stored typed result. The in-memory repository remains available only
for fast isolated contract tests.

The Phase 4 runtime stores list, meal, pocket-money and recurring-chore administration
on the same SQLite connection. Voice list commands resolve a normalized list
name before mutation, return `AMBIGUOUS_TARGET` rather than choosing among
multiple matches, reject active exact-item duplicates, and replay a prior typed
result when the same request ID is retried. Pocket-money settings and immutable
weekly payment snapshots use the same idempotent, audited command path. The
former reward tables remain dormant migration history and are not read or
written by the runtime.
