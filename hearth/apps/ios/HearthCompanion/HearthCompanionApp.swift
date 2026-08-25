import SwiftUI

@main
@MainActor
struct HearthCompanionApp: App {
    @State private var theme = HearthTheme()
    @State private var reminderModel: ReminderViewModel

    init() {
        #if DEBUG
        let usesPreviewData = CommandLine.arguments.contains("-hearth-preview-data")
        let store: any ReminderStore = usesPreviewData
            ? FakeReminderStore.preview
            : EventKitReminderStore()
        let selectionStore: any ReminderListSelectionStore = usesPreviewData
            ? InMemoryReminderListSelectionStore()
            : UserDefaultsReminderListSelectionStore()
        #else
        let store: any ReminderStore = EventKitReminderStore()
        let selectionStore: any ReminderListSelectionStore = UserDefaultsReminderListSelectionStore()
        #endif
        _reminderModel = State(initialValue: ReminderViewModel(store: store, selectionStore: selectionStore))
    }

    var body: some Scene {
        WindowGroup {
            AppShellView(reminderModel: reminderModel)
                .environment(theme)
        }
    }
}

#Preview("Hearth Companion") {
    let model = ReminderViewModel(
        store: FakeReminderStore.preview,
        selectionStore: InMemoryReminderListSelectionStore()
    )
    AppShellView(reminderModel: model)
        .environment(HearthTheme())
}
