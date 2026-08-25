# Hearth Companion iOS proof

This is the first native Hearth iPhone slice. It is an iOS 17+ SwiftUI app with a read-only EventKit adapter for Apple Reminders.

The proof:

- requests `requestFullAccessToReminders()` because iOS does not provide a read-only EventKit permission;
- lists reminder-capable EventKit calendars and lets an adult choose which lists to read;
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

The simulator proves app wiring, fake-driven UI states and layout only. It does not prove that a real Apple Account exposes the current `Reminders` and `Family Reminders` lists.

## Physical iPhone handoff

Select the `HearthCompanion` scheme in Xcode, choose the owner’s physical iPhone, resolve the normal Apple development signing/team prompt, and install. On first launch, grant Reminders access, select the `Reminders` and `Family Reminders` lists, and confirm the current test reminders appear. Check the native Reminders app before and after: Hearth must not change completion or content. Record the iPhone model, iOS version, selected list names and visible test reminder titles in the phase-8 evidence note. Do not put an Apple ID password, app-specific password or private URL in this repository or chat.
