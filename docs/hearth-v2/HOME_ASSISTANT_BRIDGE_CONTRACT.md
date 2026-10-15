# Home Assistant → Hearth bridge v1 (D-108)

This opt-in local integration is separate from Hearth's existing outbound Home Assistant
safety/script adapter. It grants no adult login, provider access or general household write authority.
The D-109 extension permits only today's chore completion/reopening with separate adult opt-in.
Home Assistant still owns TV power, app launching and media. The bridge only navigates Hearth
while its paired display is already open and visible; it never launches or interrupts another app.

## Authority and setup

An authenticated administrator selects existing paired screens and explicitly permits read-only
chores and/or calendar sharing in Connections → Home Assistant. A separate `controlChores`
permission, off by default and requiring `shareChores`, permits completing/reopening today's
existing chores. It grants no chore creation, deletion, assignment, schedule, exception, account,
calendar-edit or pocket-money management rights. Ordinary completion changes still affect earned
pocket money through Hearth's existing domain rules. The phone generates a random
32-byte `ha_` key in memory, displays it only for setup, and submits it over the trusted origin.
The server stores only its SHA-256 digest. One active grant per home; revoke before replacing it.
The key belongs in Home Assistant's protected config entry, never in chat, URLs, entities or logs.
Installing the included custom integration and changing live HA/NAS configuration require approval.
This is not a built-in/automatically discovered HA integration and needs no MQTT broker.

Admin endpoints (normal adult authority, no shared-screen fallback):

- `GET /api/v1/households/{householdId}/home-assistant-bridge`: safe grant summary or null.
- `POST` same path: `{requestId,secret,screenIds,shareChores,shareCalendar,controlChores}`. Missing
  `controlChores` in legacy grants defaults to false; existing grants are never upgraded. Request IDs are
  idempotent; changed reuse conflicts. Response `{connection,replayed}` never echoes the key.
- `POST .../home-assistant-bridge/revocations`: `{requestId}`; immediately disables all grants/commands.

## Home Assistant transport

Use `Authorization: HearthAutomation ha_<43 base64url characters>`, without browser cookies.
Any request carrying this scheme outside the exact bridge routes fails closed, even if an adult
cookie is also supplied. TV Bearer and adult cookies are not accepted on automation routes.
Responses are private/no-store. Version 1 exposes:

- `GET /api/v1/home-assistant/state`: `{version:1,generatedAt,household:{id,name,timezone},
permissions:{shareChores,shareCalendar,controlChores},screens,chores,calendar}`.
- `POST /api/v1/home-assistant/screens/{deviceId}/navigation`: `{requestId,tab}` →
  `{command,replayed}`. Only explicitly approved, unrevoked screens; no arbitrary path/URL.
- `GET /api/v1/home-assistant/calendar?start=<ISO instant>&end=<ISO instant>`: at most
  31 days, exclusive end. `{freshness,events}`; explicit error if the bounded result overflows.
- `POST /api/v1/home-assistant/chores/{occurrenceId}/completion`:
  `{requestId,localDate,isCompleted,completionId}` → `{id,localDate,state,completionId,replayed}`.
  Requires both chore permissions and the current household-local date for new commands. Only
  existing occurrences on that date may change. Complete with `completionId:null`; reopen with
  the exact observed completion ID, so a stale action cannot undo a newer completion. Locked,
  skipped, excused and cancelled chores keep the existing domain restrictions. No TV need be on.
  Exact request-ID/payload retries return the original receipt, including after midnight; changed
  ID reuse conflicts. Inputs are durably bound before execution, with crash recovery from the
  existing atomic domain receipt. Requests are namespaced by grant. Revoke blocks retries too.
  New commands are capped at 30 per minute per grant. Audit actor is the existing Home Assistant
  service with source `automation`; chore and pocket-money realtime changes use existing events.

Screen: `{id,name,online,currentTab,lastSeenAt,command}`. Command:
`{id,tab,status,createdAt,expiresAt}`, status pending/applied/expired/superseded/cancelled.
An accepted command is not proof of navigation. Only a subsequent authenticated report of its
ID **and** tab marks it applied. Duplicate request IDs replay the original command, never enqueue
again. Commands expire after 30 seconds and cannot transfer to a new browser instance or grant.
Only an already reporting visible screen (last heartbeat within 15 seconds) accepts a new command.
Command rate is bounded to 30 new requests per minute per connection; receipts retained for 24h.

Chores (when allowed): today's household-local date, open/completed counts and at most 250
`{id,title,assignee,state,completionId,locked}` items, with an explicit `truncated` flag.
Completion IDs are supplied only with chore control (otherwise null); they are concurrency
identifiers, not credentials. No money, member account permissions, avatars or audit data.
Calendar (when allowed): next seven
days and cached freshness; events `{id,title,start,end,startLocalDate,endLocalDate,allDay}` only.
No provider IDs, URLs, notes, location, credentials or recurrence internals. Calendar range reads
share this safe projection and return at most 2000 occurrences. Disabled shares return null and
their specific endpoints reject access. Freshness is not upgraded when upstream data is stale.

## Paired display protocol

`POST /api/v1/device-sessions/current/presentation` uses only the existing TV credential/cookie.
Body: `{instanceId,tab,acknowledgedCommandId}`; nullable tab/ack, strict allowlist. Response:
`{serverTime,command}` (pending command or null). Clients use serverTime and monotonic elapsed
time for command expiry rather than trusting TV/server wall clocks to agree. The server derives household/device from the credential,
not the body. A browser instance ID is correlation, not a credential.

The visible shared screen polls every two seconds, serially and with cancellation on hide/unmount.
It reports observed routes, navigates only the shared route map, then acknowledges after the new
route renders. No `admin`, setup, credential, photo mutation or Android intent destination exists.
On reload, reconnect, revocation, expiry or instance mismatch no old command may be applied.
Reported route/heartbeat is application presence only, not authoritative TV power/media state.

## HA entities and evidence

The custom integration uses config flow + coordinated polling, one Hearth household device,
per-screen child devices with a `select` for visible tab, read-only chore count/detail sensors,
and a read-only calendar entity. With chore control enabled, a household **Today's chores** to-do
entity allows status changes only (no add/delete/rename/reorder); it omits locked and non-actionable
states and becomes unavailable on stale-day, truncated or failed data rather than implying an
empty complete list. It preserves each occurrence ID and the observed completion ID, refreshes
after accepted commands, and never optimistically updates chores. A select reflects observed currentTab, never optimistic success.
Auth failure requires reauthentication; disconnected/offline screens are unavailable.
Calendar all-day values are dates with exclusive end; timed values retain timezone offsets.
Local fixtures/build/browser tests are not physical TV or live HA installation proof.
