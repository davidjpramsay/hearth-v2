# Indoor climate v1 (D-126)

Home Assistant owns sensor collection, Recorder and long-term statistics. Hearth is a read-only
viewer under the Weather module; it neither controls climate devices nor stores a second sensor
history. Open-Meteo continues to supply Outdoors independently. Turning Weather off blocks all
indoor reads/configuration and stops provider work. Turning Home controls off does not disable
this separately approved Weather data source. Inbound HA grants and TV commands are unchanged.

## Contract and commissioning

Authenticated household readers may GET `/api/v1/households/:householdId/indoor-climate?period=`
with exactly `day`, `week`, `month` or `year`. These mean trailing 24 hours, 7, 30 or 365 days;
five-minute, hourly and daily aggregates respectively. Dates/labels use the household timezone.
The DTO contains opaque room IDs, friendly labels, Celsius/percent readings, report timestamps,
per-metric current/unavailable/stale state, mean/min/max samples and explicit history failures.
No HA entity IDs, URLs or credential cross into family DTOs, browser storage, receipts or logs.

Adult-only settings/test/discovery/save endpoints under `/indoor-climate-settings` select up to
eight named rooms, each with temperature and/or humidity. Discovery accepts only numeric
`sensor` entities with the corresponding device class, supported units and measurement state
class; diagnostic device temperatures are never auto-selected. Choices are opaque. Tests expire
after ten minutes, are actor/household-bound and globally bounded. Existing selected entities can
be rediscovered without returning/re-entering the secret. New source setup uses HA's supported
long-lived token, privately pasted once and cleared after testing; Hearth-generated six-letter
pairing codes are not HA API credentials. Statistics require an HA administrator credential.
The adapter remains strictly allowlisted despite that provider permission limitation.

The mode-0600 external `indoor-climate.json`, beside the existing HA secret (or at the explicit
`HEARTH_INDOOR_CLIMATE_CONFIG_PATH`), holds the source credential and raw selected mappings.
No live database sits on an SMB/NFS mount. Safe settings revision and actor-bound exact command
receipts use the existing command/audit boundary. No new SQL migration is required. Reusing an ID
with changed settings conflicts; stale revisions cannot overwrite a later save. Restart retains
selection, not a sensor-history cache. A rejected/failed read never becomes a zero reading.

## Provider and presentation

Only exact selected `/api/states/{entity}` reads and the read-only
`POST /api/services/recorder/get_statistics?return_response` action are permitted. No arbitrary
service, entity, template or URL from a family request. Bounded decoded responses, eight-second
deadlines, redirect rejection, coalescing, finite concurrency and four period caches apply.
At most 370 samples per metric/room are projected. Missing statistics and unsupported statistics
APIs leave live readings useful with a clear history state. Saved in-memory data may be shown
as stale during outage; it is not a durable year archive. No provider polling while the feature
is unused, and no historical backfill beyond what HA actually recorded.

Weather → Indoors uses one room selector and two small-multiple SVG time-series plots, with
separate Celsius/percent axes, visible latest/min/average/max values and range labels. React owns
both charts; no new chart dependency or animation loop. Fixed-size labels/markers and measured
geometry avoid stretching. Gaps remain gaps; temperature/humidity do not share a misleading axis.
Keep the actual trailing time window and position samples by elapsed time. Day ticks use whole
household-local hours; longer periods use local midnight dates or actual month starts. Choose
regular intervals from measured width/font size, with fewer labels on phones and no overlapping
or clipped text. DST and quarter/half-hour timezone offsets must not shift or relabel readings.
Temperature uses enclosing whole-number 1/2/5-based steps with padding and a minimum four-degree
span, including negative and constant readings. Humidity keeps a fixed 0–100% axis with 20-point
steps (25 in short charts). Show at least five vertical labels at supported sizes, never rounded
labels detached from their gridline values. Small time tick marks identify the labelled instants.
URL-backed view/room/period choices support Back/reopen. TV fits one viewport; phones stack.
Visible focus, D-pad escape to Weather navigation, text alternatives, dark mode and reduced motion
are required. Empty, loading, partial, stale, denied and unavailable states remain distinct.

## Recording and recovery

Keep HA's local Recorder database and normal detailed-history retention. Eligible measurement
sensors retain hourly long-term statistics indefinitely. Automatic encrypted HA backups must
include **History** and copy to a restricted Synology backup destination; retain 14 daily copies.
Keep the recovery kit privately outside this repository. Verify one completed NAS backup and
database inclusion; a restore onto spare/test media remains a separate acceptance gate.

Official contracts: [Recorder statistics](https://www.home-assistant.io/actions/recorder.get_statistics/),
[REST](https://developers.home-assistant.io/docs/api/rest/),
[History](https://www.home-assistant.io/integrations/history/) and
[HA OS network storage](https://www.home-assistant.io/common-tasks/os/#network-storage).

## Acceptance

Verify real sensor values/history/Recorder issues separately from fake/provider/browser tests.
Test source/identity/privacy bounds, exact/stale saves, cold restart selection, unit conversion,
missing/invalid readings, partial history/outage, disabled-module no-I/O, unauthenticated and screen
admin denial. Inspect phone/tablet/TV light/dark layouts and keyboard/D-pad escape. Publication,
private deployment, actual TV/iPhone rendering and a real NAS restore are separate evidence.
