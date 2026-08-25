# Phase 8 evidence: native iPhone Reminders companion

Date: 2026-08-25

## Result

- Simulator proof: passed on the iPhone 17 simulator, iOS 26.5, bundle ID `app.hearth.companion`.
- Physical-device EventKit proof: blocked/unverified. No physical iPhone was installed or granted Reminders access during this task.
- Live Synology, Home Assistant, calendar, server, notification, and credential state: unchanged.

## Simulator evidence

XcodeBuildMCP built, installed, launched, and visually inspected the app with deterministic fake data. The inspected states were first use, fake-data success, list filtering, privacy scope, loading, stale refresh, failure/retry, denied access, restricted access, and intentional empty selection.

- [First-use state](screenshots/simulator-first-use.png)
- [Fake-data success state](screenshots/simulator-fake-success.png)
- [Privacy and scope state](screenshots/simulator-privacy.png)

The success snapshot exposed the expected accessible reminder rows, including title, list, due date/time, and completion state. The list chooser was exercised by turning off `Reminders`; the UI then showed only the selected `Family Reminders` items.

The XcodeBuildMCP unit run passed 7 tests with 0 failures and 0 skips. The tests cover permission request, initial read failure/retry, stale refresh, list filtering, intentional empty selection, denied permission, and restricted permission.

## Checks run

- `xcodegen generate` — passed.
- `xcodebuild -project HearthCompanion.xcodeproj -scheme HearthCompanion -sdk iphonesimulator -configuration Debug build` — passed through XcodeBuildMCP.
- `xcodebuild -project HearthCompanion.xcodeproj -scheme HearthCompanion -sdk iphoneos -configuration Debug CODE_SIGNING_ALLOWED=NO build` — passed; device-target compile only.
- XcodeBuildMCP `test_sim` — passed: 7 tests, 0 failures, 0 skipped.
- `pnpm install --frozen-lockfile` in `hearth/` — passed using the existing lockfile.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test:unit` — passed: shared 26, core 25, server 33, web 84 tests.
- `pnpm format:check` — passed.
- `git diff --check` — passed.

## Physical-device handoff

Install the Debug build on the user's physical iPhone with a valid signing team, tap `Allow Reminders access`, choose the live `Reminders` and `Family Reminders` lists, and confirm the known test reminder titles, list names, due values, and completion state. Record the iPhone model and iOS version in the task evidence. Do not enter an Apple ID, iCloud app-specific password, private calendar URL, or NAS credential into the project or chat.

This first slice must remain read-only: do not add EventKit save, remove, or commit calls. The existing CalDAV boundary remains closed for modern iCloud Reminders.
