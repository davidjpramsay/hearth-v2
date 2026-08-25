# Phase 8 evidence: native iPhone Reminders companion

Date: 2026-08-25

## Result

- Simulator proof: passed on the iPhone 17 simulator, iOS 26.5, bundle ID `app.hearth.companion`.
- Physical-device EventKit proof: passed on an iPhone 17e running iOS 26.6 with the signed Debug build from commit `1396329`.
- Native transport proof: 29 iOS tests and deterministic fake pairing/snapshot UI passed in
  Simulator. The current signed build compiled and installed on the same iPhone, but live
  adult-approved pairing, upload and household readback were not run.
- Selected-list persistence change: unit and simulator verification passed; physical terminate/relaunch verification remains pending and is not inferred from the earlier EventKit proof.
- Live Synology, Home Assistant, calendar, server, notification, and credential state: unchanged.

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

The frozen native bridge extension raises the suite to 29 tests. The added coverage decodes all
four shared JSON fixtures and proves the distinct `HearthReminderSource` header, unauthenticated
pairing body, approved pairing exchange, selected-list/date projection, intentional empty snapshot,
exact retry identity, stale-sequence recovery, revoked-source repair and the rule that a transient
or failed EventKit read never emits a clearing snapshot.

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

The current transport build was signed, compiled and installed on the connected iPhone. Its
automated launch was blocked because the device was locked. This is installation evidence only:
the owner has not yet approved a live reminder source, uploaded a physical EventKit snapshot or
checked the household read endpoint, so the end-to-end bridge criterion remains open.

## Checks run

- `xcodegen generate` — passed.
- `xcodebuild -project HearthCompanion.xcodeproj -scheme HearthCompanion -sdk iphonesimulator -configuration Debug build` — passed through XcodeBuildMCP.
- `xcodebuild -project HearthCompanion.xcodeproj -scheme HearthCompanion -sdk iphoneos -configuration Debug CODE_SIGNING_ALLOWED=NO build` — passed; device-target compile only.
- XcodeBuildMCP `test_sim` — passed for the current transport: 29 tests, 0 failures, 0 skipped.
- XcodeBuildMCP `build_run_sim` with `-hearth-preview-data` — passed; fake setup, accepted snapshot,
  portrait, landscape, dark mode and accessibility text were inspected.
- `xcodebuild -project hearth/apps/ios/HearthCompanion.xcodeproj -scheme HearthCompanion -configuration Debug -destination 'id=<physical-device-udid>' -derivedDataPath <temporary-directory> build` — passed and signed with the user's local Apple Development team.
- `xcrun devicectl device install app --device <paired-device-id> <HearthCompanion.app>` — passed; bundle ID `app.hearth.companion` installed.
- `xcrun devicectl device process launch --device <paired-device-id> --terminate-existing app.hearth.companion` — passed; the device reported a successful launch and the process was present.
- Current signed device `xcodebuild ... -destination 'id=<physical-device-udid>' ... build` — passed.
- Current `xcrun devicectl device install app ...` — passed; bundle ID `app.hearth.companion` installed.
- Current automated device launch — blocked because the iPhone was locked; live transport behavior
  was not run or inferred.
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

This first slice must remain read-only: do not add EventKit save, remove, or commit calls. The existing CalDAV boundary remains closed for modern iCloud Reminders.
