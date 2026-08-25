# Hearth Companion iOS proof

This is the first native Hearth iPhone slice. It is an iOS 17+ SwiftUI app with a read-only EventKit adapter for Apple Reminders.

The proof:

- requests `requestFullAccessToReminders()` because iOS does not provide a read-only EventKit permission;
- lists reminder-capable EventKit calendars and lets an adult choose which lists to read;
- persists only the opaque identifiers of the selected lists in app-local `UserDefaults` so the choice survives relaunch;
- displays reminder title, list, due date/time and completion state;
- uses `ReminderStore` with `EventKitReminderStore` and `FakeReminderStore` variants;
- performs no EventKit save, edit, completion, deletion or commit operation;
- contains no Hearth server connection, background sync, APNs, credentials, WebView or two-way completion.

## Local build and tests

```sh
cd hearth/apps/ios
xcodegen generate
xcodebuild -project HearthCompanion.xcodeproj -scheme HearthCompanion -sdk iphonesimulator -configuration Debug build
xcodebuild -project HearthCompanion.xcodeproj -scheme HearthCompanion -destination 'platform=iOS Simulator,name=iPhone 17' test
```

The simulator proves app wiring, fake-driven UI states, local selection persistence and layout only.
The physical EventKit proof passed on 2026-08-25 on an iPhone 17e running iOS 26.6; see
`hearth/docs/evidence/phase-8/README.md`. A change must still be installed and exercised on that
device before claiming new physical-device evidence for the change.

## Physical iPhone verification

Select the `HearthCompanion` scheme in Xcode, choose the owner’s physical iPhone and install with
the existing local development team. Confirm live reminders still read correctly, change the list
selection, terminate and relaunch the app, and confirm that exact selection returns. Check Apple
Reminders before and after: Hearth must not change completion or content. Record only the result,
device model and iOS version in the phase-8 evidence note; do not retain private reminder contents,
an Apple ID password, app-specific password or private URL.
