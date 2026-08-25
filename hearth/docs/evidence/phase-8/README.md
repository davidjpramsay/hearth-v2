# Phase 8 evidence: native iPhone Reminders companion

Date: 2026-08-25

## Result

- Simulator proof: passed on the iPhone 17 simulator, iOS 26.5, bundle ID `app.hearth.companion`.
- Physical-device EventKit proof: passed on an iPhone 17e running iOS 26.6 with the signed Debug build from commit `1396329`.
- Live Synology, Home Assistant, calendar, server, notification, and credential state: unchanged.

## Simulator evidence

XcodeBuildMCP built, installed, launched, and visually inspected the app with deterministic fake data. The inspected states were first use, fake-data success, list filtering, privacy scope, loading, stale refresh, failure/retry, denied access, restricted access, and intentional empty selection.

- [First-use state](screenshots/simulator-first-use.png)
- [Fake-data success state](screenshots/simulator-fake-success.png)
- [Privacy and scope state](screenshots/simulator-privacy.png)

The success snapshot exposed the expected accessible reminder rows, including title, list, due date/time, and completion state. The list chooser was exercised by turning off `Reminders`; the UI then showed only the selected `Family Reminders` items.

The XcodeBuildMCP unit run passed 9 tests with 0 failures and 0 skips. The tests cover permission request, initial read failure/retry, stale refresh, list filtering, intentional empty selection, denied permission, restricted permission, automatic EventKit-style refresh, and preserving the last successful content during refresh.

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

## Checks run

- `xcodegen generate` — passed.
- `xcodebuild -project HearthCompanion.xcodeproj -scheme HearthCompanion -sdk iphonesimulator -configuration Debug build` — passed through XcodeBuildMCP.
- `xcodebuild -project HearthCompanion.xcodeproj -scheme HearthCompanion -sdk iphoneos -configuration Debug CODE_SIGNING_ALLOWED=NO build` — passed; device-target compile only.
- XcodeBuildMCP `test_sim` — passed: 9 tests, 0 failures, 0 skipped.
- `xcodebuild -project hearth/apps/ios/HearthCompanion.xcodeproj -scheme HearthCompanion -configuration Debug -destination 'id=<physical-device-udid>' -derivedDataPath <temporary-directory> build` — passed and signed with the user's local Apple Development team.
- `xcrun devicectl device install app --device <paired-device-id> <HearthCompanion.app>` — passed; bundle ID `app.hearth.companion` installed.
- `xcrun devicectl device process launch --device <paired-device-id> --terminate-existing app.hearth.companion` — passed; the device reported a successful launch and the process was present.
- `pnpm install --frozen-lockfile` in `hearth/` — passed using the existing lockfile.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test:unit` — passed: shared 26, core 25, server 33, web 84 tests.
- `pnpm format:check` — passed.
- `git diff --check` — passed.

## Preserved boundary

No Apple ID, iCloud app-specific password, private calendar URL, NAS credential or private reminder
content was entered into the project, evidence or chat.

This first slice must remain read-only: do not add EventKit save, remove, or commit calls. The existing CalDAV boundary remains closed for modern iCloud Reminders.
