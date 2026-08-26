# Phase 8 evidence: native iPhone Reminders companion

Date: 2026-08-25 to 2026-08-26

## Result

- Simulator proof: passed on the iPhone 17 simulator, iOS 26.5, bundle ID `app.hearth.companion`.
- Physical-device EventKit proof: passed on an iPhone 17e running iOS 26.6 with the signed Debug build from commit `1396329`.
- Native transport proof: adult-approved pairing, token exchange and full-snapshot upload passed
  against the trusted private Hearth deployment on the same iPhone. An exact in-memory retry of one
  accepted request returned `replayed: true` on-device and created no additional server receipt.
- Selected-list persistence: passed on the physical iPhone after terminate/relaunch with only the
  intended family list selected.
- Signed household API/rendered-dashboard readback: remains a separate checkpoint and is not
  inferred from the privacy-safe database aggregate used for the transport proof.
- Physical revocation and forced-stale recovery: not run. Their deterministic native/server tests
  pass, but that is not physical evidence.
- Best-effort iOS background refresh: implemented and simulator-tested on 2026-08-26. A physical
  OS-scheduled launch and observed end-to-end latency are not yet run and are not inferred from a
  foreground or simulator refresh.
- Live Synology reminder-source state changed only through the approved pairing and snapshots.
  Home Assistant, calendar credentials, notifications and Apple Reminders content were unchanged.

## Simulator evidence

XcodeBuildMCP built, installed, launched, and visually inspected the app with deterministic fake data. The inspected states were first use, fake-data success, list filtering, privacy scope, loading, stale refresh, failure/retry, denied access, restricted access, and intentional empty selection.

- [First-use state](screenshots/simulator-first-use.png)
- [Fake-data success state](screenshots/simulator-fake-success.png)
- [Privacy and scope state](screenshots/simulator-privacy.png)
- [Native bridge setup](screenshots/simulator-bridge-setup.png)
- [Fake snapshot accepted](screenshots/simulator-bridge-snapshot-accepted.png)
- [Bridge landscape](screenshots/simulator-bridge-landscape.png)
- [Bridge dark mode and accessibility text](screenshots/simulator-bridge-dark-dynamic-type.png)

The success snapshot exposed the expected accessible reminder rows, including title, list, due date/time, and completion state. The list chooser was exercised by turning off `Reminders`; the UI then showed only the selected `Family Reminders` items.

The original XcodeBuildMCP unit run passed 9 tests with 0 failures and 0 skips. After adding local
selected-list persistence, the suite passes 14 tests. The additional coverage proves restoring a
saved selection, preserving an intentional empty selection across model relaunch, pruning removed
list identifiers, avoiding an accidental empty preference while EventKit temporarily reports no
lists, and distinguishing unset, empty and selected values in the real `UserDefaults` adapter.

The frozen native bridge extension initially raised the suite to 29 tests. The canonical 32-test
suite also verifies that every required nullable reminder field is encoded explicitly as JSON
`null`. The isolated 31-test evidence build verified that its DEBUG-only in-memory replay seam
resends the exact accepted request once; that seam was not merged into the product branch. The
transport coverage decodes all four shared JSON fixtures and proves the distinct
`HearthReminderSource` header, unauthenticated
pairing body, approved pairing exchange, selected-list/date projection, intentional empty snapshot,
exact retry identity, stale-sequence recovery, revoked-source repair and the rule that a transient
or failed EventKit read never emits a clearing snapshot. The two later background tests prove that
an OS-granted refresh waits for the fresh EventKit projection to be accepted by Hearth and reports
failure without uploading when no safe snapshot is produced.

## Physical-device evidence

The signed Debug app was built, installed and launched on the paired physical iPhone. The owner
confirmed that the current `Reminders` and `Family Reminders` lists and their live reminder fields
were visible through EventKit. One remote reminder change appeared automatically after about nine
seconds. Completing a reminder in Apple Reminders on the Mac then changed its displayed state in
Hearth Companion after about five seconds, without a manual pull.

The owner also confirmed that repeated pull-to-refresh no longer showed the reported graphical
flicker. Reminder completion is visible but cannot be changed in Hearth Companion; this is the
intentional read-only proof boundary. No physical-device screenshot is retained because it would
contain private reminder content.

On 2026-08-26, the owner confirmed the intended selected list survived terminate/relaunch, created
a pairing request, viewed only the safe six-character code and approved it in the authenticated
Hearth administration UI. The companion exchanged the approval and uploaded real full snapshots.
The accepted projection contained one list and four reminders, split two open and two completed;
no titles or raw EventKit identifiers were queried for evidence.

The first upload attempt exposed a wire-encoding defect: Swift's synthesized optional encoding had
omitted required nullable keys. The rejected request persisted no receipt or projection. Commit
`3da7c74` added explicit `null` encoding and its regression test; the corrected signed build then
uploaded successfully.

For exact-retry evidence, commit `0c69ca1` added a DEBUG-only seam that retained one just-accepted
request in memory and resent the same request ID, snapshot ID, sequence and payload once. The phone
reported `replayed: true`. A privacy-safe read-only production aggregate showed sequence and receipt
count both at 6 after the retry, with no sequence or receipt 7 and unchanged projection counts.
Compared with the prior sequence/receipt count of 4, two fresh snapshots occurred during the
install/open/refresh flow; the exact retry itself added none. The seam stores neither payload nor
secret persistently and is absent from Release builds.

This proves physical pairing, exchange, fresh full-snapshot upload and exact idempotent replay. It
does not prove signed household endpoint/rendered-dashboard readback, physical revocation,
physical forced-stale recovery or OS-scheduled background execution.

The first Hearth household surfaces are now implemented against that frozen projection: a
conditional list-grouped, read-only Reminders destination and an independently configurable,
bounded due-today summary. Local rendered inspection covered television and phone layouts plus
D-pad entry and return. This remains product-code evidence until the exact release is deployed and
read back through an authenticated production household session.

## Checks run

- `xcodegen generate` — passed.
- `xcodebuild -project HearthCompanion.xcodeproj -scheme HearthCompanion -sdk iphonesimulator -configuration Debug build` — passed through XcodeBuildMCP.
- `xcodebuild -project HearthCompanion.xcodeproj -scheme HearthCompanion -sdk iphoneos -configuration Debug CODE_SIGNING_ALLOWED=NO build` — passed; device-target compile only.
- XcodeBuildMCP `test_sim` — passed for the background-refresh product build: 32 tests, 0 failures,
  0 skipped. The earlier isolated replay-evidence build passed 31 before its evidence-only seam was
  omitted from the canonical product.
- XcodeBuildMCP `build_run_sim` with `-hearth-preview-data` — passed; fake setup, accepted snapshot,
  portrait, landscape, dark mode and accessibility text were inspected.
- `xcodebuild -project hearth/apps/ios/HearthCompanion.xcodeproj -scheme HearthCompanion -configuration Debug -destination 'id=<physical-device-udid>' -derivedDataPath <temporary-directory> build` — passed and signed with the user's local Apple Development team.
- `xcrun devicectl device install app --device <paired-device-id> <HearthCompanion.app>` — passed; bundle ID `app.hearth.companion` installed.
- `xcrun devicectl device process launch --device <paired-device-id> --terminate-existing app.hearth.companion` — passed; the device reported a successful launch and the process was present.
- Release Simulator `xcodebuild ... -configuration Release ... CODE_SIGNING_ALLOWED=NO build` —
  passed for commit `0c69ca1`.
- `strings -a <Release-HearthCompanion> | rg -F 'Replay accepted snapshot (DEBUG)'` — no match,
  confirming the evidence control is absent from the Release binary.
- Current signed physical-device `xcodebuild ... -configuration Debug -destination
'id=<physical-device-udid>' ... build` — passed for commit `0c69ca1`.
- Current `xcrun devicectl device install app ...` — passed; bundle ID
  `app.hearth.companion` installed.
- Owner-operated physical pairing, accepted upload and exact replay — passed; the app reported
  `replayed: true` without exposing request identifiers, payload or source secret.
- Read-only production aggregate after replay — passed: one active source, accepted sequence 6,
  six receipts through sequence 6, one active list and four active reminders (two open and two
  completed). No reminder content, identifier, payload or credential was queried.
- `pnpm install --frozen-lockfile` in `hearth/` — passed using the existing lockfile.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test:unit` — passed: shared 31, core 25, server 33, web 84 tests.
- `pnpm test:integration` — passed: 115 server integration tests.
- `pnpm test:migrations` — passed: 24 migration tests.
- `pnpm build` — passed for shared, core, web and server production output.
- `pnpm format:check` — passed.
- `git diff --check` — passed.

## Preserved boundary

No Apple ID, iCloud app-specific password, private Apple/calendar URL, NAS credential or private
reminder content was entered into the project, evidence or chat. The fake HTTPS Hearth origin in
the retained screenshots is not a real private endpoint.

The exact-replay control is evidence-only. Keep commit `0c69ca1` isolated from the canonical product
branch, or remove the seam after this proof; do not promote it into a product control merely because
it is compile-excluded from Release.

This first slice must remain read-only: do not add EventKit save, remove, or commit calls. The existing CalDAV boundary remains closed for modern iCloud Reminders.
