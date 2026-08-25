# Hearth Reminders Companion Contract

Status: frozen v1 contract

Wire version: `1`

Transport: private HTTPS Hearth origin over LAN or Tailscale

Source: Apple EventKit on a permissioned iPhone

Direction: iPhone to Hearth, read-only projection

This is the canonical contract between the native iPhone companion and Hearth's Reminders
projection. The TypeScript source of truth is
`hearth/packages/shared/src/reminders.ts`. Language-neutral golden JSON fixtures live in
`hearth/packages/shared/fixtures/reminders-contract-v1/`.

## Product and security boundary

- The iPhone reads reminders only after the user grants EventKit permission and chooses lists.
- Hearth never receives Apple credentials, EventKit permissions, reminder notes, URLs, alarms,
  recurrence rules, priority, attachments or Apple Reminders Sections.
- The source credential grants only `reminders.snapshot.write`. It is not a television credential,
  an adult passkey session or a general native-client session.
- Ordinary native Hearth features will use the same passkey-authenticated household API and
  business rules as the responsive web companion. They must not reuse the reminder-source secret.
- Hearth stores only a SHA-256 digest of the device secret and one-way source-scoped hashes of
  EventKit identifiers. Raw EventKit list and reminder identifiers are accepted at the write
  boundary but are never stored or returned to household clients.
- One active EventKit source is allowed per household in v1. This avoids duplicate projection of a
  shared iCloud account. Replacing the source requires adult revocation and a fresh pairing.

## Pairing and authentication lifecycle

1. The user enters or confirms the trusted private HTTPS Hearth origin in the iPhone app. V1 does
   not guess a server through public discovery.
2. The app generates a cryptographically random 32-byte secret, base64url-encodes it without
   padding, and stores it in the iOS Keychain. The secret must contain 43-128 base64url characters.
3. The app creates a pairing request. Hearth stores only the SHA-256 digest and returns a
   six-character code. The request expires after ten minutes.
4. A signed-in household administrator enters and approves the code in Hearth. Approval grants no
   household session and creates no source until the iPhone completes the exchange.
5. The app exchanges the same secret. Hearth creates the source and device and returns a narrow
   device session. The app retains its original secret; Hearth never returns it.
6. Source calls use `Authorization: HearthReminderSource <secret>`. The scheme is deliberately
   different from television `Bearer` credentials and companion passkey cookies.
7. Adult revocation immediately invalidates the secret and hides the intentionally disconnected
   projection. Cached rows are retained locally for audit/recovery but are not served. Reconnection
   requires a fresh secret and pairing.

The iPhone must use an HTTPS origin it trusts. Hearth remains LAN/Tailscale-first; this contract
does not authorise public exposure.

## Endpoints

All bodies are JSON. All timestamps are ISO 8601 with an explicit offset. Unknown fields are
rejected. `requestId`, `snapshotId` and Hearth IDs are 3-96 lowercase opaque identifiers matching
`^[a-z][a-z0-9_-]+$`.

### Bootstrap and pairing

`POST /api/v1/reminder-source-pairing-requests`

Unauthenticated. Body:

```json
{
  "requestId": "request_reminder_pairing_001",
  "deviceName": "David's iPhone",
  "platform": "ios",
  "applicationVersion": "1.0.0",
  "pairingSecret": "<43-128 base64url characters>"
}
```

Response: pairing request with `id`, `requestId`, `code`, device metadata, `status` and
`expiresAt`. Status is `pending`, `approved`, `exchanged`, `expired` or `cancelled`.

`GET /api/v1/reminder-source-pairing-requests/{pairingId}`

Unauthenticated, possession-of-ID status polling. Returns the same safe pairing response and never
returns the secret, its digest or household data.

`POST /api/v1/households/{householdId}/reminder-source-pairing-approvals`

Requires an adult Hearth companion session. Body:

```json
{ "requestId": "request_reminder_approval_001", "code": "A1B2C3" }
```

Returns the approved pairing request. Approval is rejected when the code is expired, the actor is
not an administrator, or the household already has an active source.

`POST /api/v1/reminder-source-pairing-requests/{pairingId}/exchanges`

Unauthenticated bootstrap exchange. Body:

```json
{
  "requestId": "request_reminder_exchange_001",
  "pairingSecret": "<the original secret>"
}
```

Response (`Cache-Control: no-store`):

```json
{
  "contractVersion": 1,
  "householdId": "household_example",
  "deviceId": "reminder_device_example",
  "sourceId": "reminder_source_example",
  "scopes": ["reminders.snapshot.write"],
  "pairedAt": "2026-08-25T10:00:00+08:00",
  "nextSnapshotSequence": 1
}
```

`GET /api/v1/reminder-source-sessions/current`

Requires the reminder-source authorization header. Returns the same session shape with the current
`nextSnapshotSequence`. Use it after launch, an ambiguous failure or `STALE_SNAPSHOT`.

### Source settings and revocation

`GET /api/v1/households/{householdId}/reminder-sources`

Requires an adult Hearth companion session. Returns source/device status, counts, freshness,
last-snapshot timestamps and the next sequence. It never exposes the source secret or EventKit
identifiers.

`POST /api/v1/households/{householdId}/reminder-source-devices/{deviceId}/revocations`

Requires an adult Hearth companion session. Body is `{ "requestId": "..." }`. Returns the revoked
source summary and `replayed`. Revocation is an authenticated, audited command.

### Snapshot upload and household read

`PUT /api/v1/reminder-sources/{sourceId}/snapshots/current`

Requires the reminder-source authorization header. Body:

```json
{
  "requestId": "request_reminders_snapshot_001",
  "contractVersion": 1,
  "snapshotId": "snapshot_reminders_001",
  "sequence": 1,
  "generatedAt": "2026-08-25T10:00:00+08:00",
  "lists": [
    { "sourceListId": "opaque-eventkit-list-id", "title": "Family Reminders" }
  ],
  "reminders": [
    {
      "sourceReminderId": "opaque-eventkit-reminder-id",
      "sourceListId": "opaque-eventkit-list-id",
      "title": "Put the bins out",
      "dueLocalDate": "2026-08-25",
      "dueAt": "2026-08-25T18:00:00+08:00",
      "hasDueTime": true,
      "isCompleted": false,
      "completedAt": null,
      "sourceUpdatedAt": "2026-08-25T09:55:00+08:00"
    }
  ]
}
```

Response contains version, source/snapshot/sequence, generated and accepted timestamps, list,
reminder and incomplete counts, `nextSnapshotSequence`, and `replayed`.

`GET /api/v1/households/{householdId}/reminders?includeCompleted=false`

Uses the ordinary household-read authentication boundary. It returns Hearth list/reminder IDs,
source freshness and cached projected content. `includeCompleted` defaults to false. This endpoint
does not grant mutation of Apple Reminders.

## Identifier semantics

- `householdId`: Hearth household owning the projection.
- `deviceId`: Hearth authentication principal for one installed companion instance.
- `sourceId`: Hearth namespace for one logical EventKit projection. It is separate from the device
  so device lifecycle and source identity are not conflated.
- `sourceListId` and `sourceReminderId`: opaque EventKit identifiers. They are case-sensitive,
  whitespace-preserving identifiers, not display text. Maximum length is 255 characters and control
  characters are rejected.
- Hearth hashes each external ID as SHA-256 of `sourceId + NUL + externalId`. Stable Hearth list and
  reminder IDs derive from that source-scoped hash. The same EventKit ID in a later source does not
  correlate to the old source.
- Titles are trimmed. An empty list title becomes `Reminders`; an empty reminder title becomes
  `Untitled reminder`. This normalization never alters identifiers.

## Reminder field projection

The frozen v1 projection is:

- reminder identifier;
- title;
- list identifier and title;
- `dueLocalDate`, preserving a date-only EventKit due date as `YYYY-MM-DD`;
- `dueAt`, only for a timed due date;
- `hasDueTime`, explicitly distinguishing date-only from timed due dates;
- `isCompleted`;
- `completedAt`, when EventKit exposes it;
- `sourceUpdatedAt`, when EventKit exposes a last-modified timestamp.

Consistency rules:

- timed due dates require both `dueLocalDate` and `dueAt`;
- date-only due dates have `dueLocalDate`, `dueAt: null` and `hasDueTime: false`;
- no due date has both date fields null and `hasDueTime: false`;
- incomplete reminders must have `completedAt: null`;
- every reminder references a list present in the same snapshot.

No model field beyond the iOS safe projection is required except the two optional provenance fields
`completedAt` and `sourceUpdatedAt`. Both may be sent as `null` until the adapter can supply them.
Sections are deliberately absent because public EventKit does not expose Apple Reminders Sections.

## Full-snapshot, ordering and freshness rules

- V1 accepts full snapshots only. There is no incremental operation and the client sends no
  tombstones.
- A successful snapshot atomically upserts included rows and internally tombstones every previously
  active list/reminder omitted from the snapshot.
- An empty `lists` and `reminders` snapshot is intentional and clears the served projection. The app
  must distinguish an intentional empty selection from permission/query failure before uploading.
- `sequence` is strictly increasing per source. Gaps are allowed. Lower sequences are rejected with
  `STALE_SNAPSHOT`.
- `requestId`, `snapshotId` and `sequence` form the idempotency identity. Retrying the same three
  values with byte-equivalent normalized content returns the original receipt with `replayed: true`.
  Reusing any identity for changed content returns `CONFLICT`.
- After a timeout or ambiguous network failure, retry the exact same identifiers and payload. Never
  manufacture a new sequence until the prior result is known.
- `generatedAt` is when EventKit enumeration completed, not upload time. More than five minutes of
  future clock skew is rejected. `acceptedAt` is Hearth receipt time.
- Source status is `awaiting-first-snapshot` before the first upload, `current` while the latest
  generated snapshot is no more than 15 minutes old, `stale` after that, and `revoked` after adult
  revocation. Temporary iPhone or iCloud failure does not erase cached rows.
- The upload limit is 50 lists, 1,000 reminders and 1.5 MB decoded JSON. The client must require the
  user to narrow selected lists rather than split one logical state into partial snapshots.

## Retry, error and revocation behaviour

Hearth uses its standard error envelope. Required client behaviour:

| Status/code                     | Meaning                                                         | Client behaviour                                                                                          |
| ------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `400 VALIDATION_ERROR`          | Payload violates v1                                             | Do not retry unchanged; show a diagnostic-safe error.                                                     |
| `401 UNAUTHENTICATED`           | Missing, bad or revoked source secret                           | Stop uploads, clear local pairing state after confirmation, and offer pairing.                            |
| `403 FORBIDDEN`                 | Valid device attempted another source                           | Stop; do not redirect the payload to another source.                                                      |
| `404 NOT_FOUND`                 | Pairing/source no longer exists                                 | Stop and offer pairing.                                                                                   |
| `409 CONFLICT`                  | Identifier collision, active-source conflict or expired pairing | Poll/reconcile; never mutate a submitted snapshot and reuse its IDs.                                      |
| `409 STALE_SNAPSHOT`            | A later sequence already won                                    | Read the current session, re-enumerate EventKit and submit a new full snapshot at `nextSnapshotSequence`. |
| `413`                           | Payload exceeds server body bound                               | Narrow selected lists; do not chunk the snapshot.                                                         |
| `503 COMMAND_FAILED` or timeout | Temporary local failure                                         | Exponential backoff with jitter, retrying the exact payload and identifiers.                              |

Recommended foreground retry delays are 2, 5, 15 and 30 seconds, then a visible manual retry. The
v1 contract assumes foreground/startup/pull-to-refresh uploads; it does not require background
transfer, APNs or a proprietary Apple service.

## Swift client seam

V1 deliberately uses hand-written `Codable`, `Sendable` DTOs rather than generated Swift. The
checked-in JSON fixtures are the interoperability gate. A narrow client seam should be:

```swift
protocol ReminderSnapshotClient: Sendable {
    func createPairing(_ request: CreateReminderSourcePairingRequest) async throws
      -> ReminderSourcePairingRequest
    func pairingStatus(id: String) async throws -> ReminderSourcePairingRequest
    func exchange(id: String, request: ExchangeReminderSourcePairingRequest) async throws
      -> ReminderSourceDeviceSession
    func currentSession() async throws -> ReminderSourceDeviceSession
    func replaceSnapshot(sourceID: String, request: ReplaceReminderSnapshotRequest) async throws
      -> ReminderSnapshotReceipt
}
```

The `URLSession` implementation owns HTTP/authentication and reads the secret through a Keychain
abstraction. An EventKit adapter maps app-local reminder models into the wire DTOs. Views and
`ReminderListSelectionStore` do not encode requests directly. Generated Swift may replace the DTOs
only after the shared schema has a stable machine-readable export and fixture parity remains in CI.

## Change control

Any breaking change requires a new `contractVersion`, new fixtures and simultaneous support in the
server and iOS client. Adding optional fields to v1 still requires a recorded decision and fixture
coverage; neither task may infer a field from the other implementation.
