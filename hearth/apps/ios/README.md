# Hearth Companion iOS bridge

This native iOS 17+ SwiftUI slice reads Apple Reminders through EventKit and can project the selected safe fields to a trusted private Hearth server.

The proof:

- requests `requestFullAccessToReminders()` because iOS does not provide a read-only EventKit permission;
- lists reminder-capable EventKit calendars and lets an adult choose which lists to read;
- persists only the opaque identifiers of the selected lists in app-local `UserDefaults` so the choice survives relaunch;
- displays reminder title, list, due date/time and completion state;
- uses `ReminderStore` with `EventKitReminderStore` and `FakeReminderStore` variants;
- implements the frozen v1 `ReminderSnapshotClient` with hand-written `Codable`/`Sendable` DTOs;
- generates a 32-byte source secret with Security randomization services, stores it device-only in
  Keychain and authenticates only as `HearthReminderSource`;
- pairs through an adult-approved six-character code and sends bounded full snapshots after safe
  EventKit reads;
- requests best-effort background refresh for a paired source and waits for Hearth acceptance when
  iOS grants runtime; task expiration cancels transport without clearing the last safe projection;
- performs no EventKit save, edit, completion, deletion or commit operation;
- contains no persistent background execution, APNs, Apple credential, WebView or two-way completion.

## Local build and tests

```sh
cd hearth/apps/ios
xcodegen generate
xcodebuild -project HearthCompanion.xcodeproj -scheme HearthCompanion -sdk iphonesimulator -configuration Debug build
xcodebuild -project HearthCompanion.xcodeproj -scheme HearthCompanion -destination 'platform=iOS Simulator,name=iPhone 17' test
```

The simulator proves app wiring, fake-driven UI states, contract fixture compatibility, local
selection persistence and layout only. The canonical suite has 32 tests, including pairing,
transport, exact-retry, stale-sequence, revoked-source and accidental-clear protection plus the
regression for required nullable JSON fields and background read-to-acceptance coordination. A
separate 31-test DEBUG evidence build proved an
exact in-memory replay; that evidence-only control is intentionally absent from this product branch.
The physical EventKit proof passed on 2026-08-25 on an iPhone 17e running iOS 26.6; see
`hearth/docs/evidence/phase-8/README.md`. A change must still be installed and exercised on that
device before claiming new physical-device evidence for the change. Physical list-selection
persistence, adult-approved pairing, full-snapshot upload and exact idempotent replay passed on
2026-08-26. Signed household endpoint/rendered-dashboard readback, physical revocation and
forced-stale recovery remain separate open checkpoints.

## Pairing and snapshots

Open the **Hearth** tab, enter the trusted private HTTPS Hearth origin and create a pairing code.
Allow Local Network access if iOS prompts; the app uses direct HTTPS only and does not browse or
advertise Bonjour services.
Approve that code from a signed-in adult Hearth administration session. The source secret never
appears in the interface or server response. After exchange, each successful startup, foreground,
EventKit-change or manual reminder refresh can send one full snapshot. A temporary EventKit/query
failure sends nothing and therefore cannot accidentally clear Hearth; a deliberate empty list
selection sends an intentional empty snapshot. A transient successful EventKit read that reports
zero lists while a non-empty selection exists is held as stale rather than uploaded as a clear.

When the paired app enters the background, it asks iOS for another short refresh no earlier than
fifteen minutes later. If iOS grants the task, the same safe read and versioned full-snapshot upload
run without opening the app, and the task completes only after Hearth accepts or rejects it. iOS may
delay or skip the request, so foreground/manual refresh and Hearth's honest stale state remain
necessary. The app uses no silent push or continuous background process.

V1 allows one active EventKit source per household. Revocation happens in adult Hearth
administration and requires a fresh pairing. Apple Reminders Sections, writeback and native
household-administration parity remain out of scope.

## Physical iPhone verification

Select the `HearthCompanion` scheme in Xcode, choose the owner’s physical iPhone and install with
the existing local development team. Confirm live reminders still read correctly, change the list
selection, terminate and relaunch the app, and confirm that exact selection returns. Check Apple
Reminders before and after: Hearth must not change completion or content. Record only the result,
device model and iOS version in the phase-8 evidence note; do not retain private reminder contents,
an Apple ID password, app-specific password or private Apple/calendar URL. A trusted Hearth origin
is non-secret connection metadata and is stored separately from the Keychain source secret.
