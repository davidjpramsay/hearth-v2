import SwiftUI

@main
@MainActor
struct HearthCompanionApp: App {
    @State private var theme = HearthTheme()
    @State private var reminderModel: ReminderViewModel

    init() {
        #if DEBUG
        let store: any ReminderStore = CommandLine.arguments.contains("-hearth-preview-data")
            ? FakeReminderStore.preview
            : EventKitReminderStore()
        #else
        let store: any ReminderStore = EventKitReminderStore()
        #endif
        _reminderModel = State(initialValue: ReminderViewModel(store: store))
    }

    var body: some Scene {
        WindowGroup {
            AppShellView(reminderModel: reminderModel)
                .environment(theme)
        }
    }
}

#Preview("Hearth Companion") {
    let model = ReminderViewModel(store: FakeReminderStore.preview)
    AppShellView(reminderModel: model)
        .environment(HearthTheme())
}
