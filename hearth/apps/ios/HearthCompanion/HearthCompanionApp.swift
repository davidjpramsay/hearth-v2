import SwiftUI
import UIKit

@main
@MainActor
struct HearthCompanionApp: App {
    @State private var theme = HearthTheme()
    @State private var reminderModel: ReminderViewModel
    @State private var bridgeModel: ReminderBridgeViewModel

    init() {
        let deviceName = UIDevice.current.name
        let applicationVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"

        #if DEBUG
        let usesPreviewData = CommandLine.arguments.contains("-hearth-preview-data")
        let store: any ReminderStore = usesPreviewData
            ? FakeReminderStore.preview
            : EventKitReminderStore()
        let selectionStore: any ReminderListSelectionStore = usesPreviewData
            ? InMemoryReminderListSelectionStore()
            : UserDefaultsReminderListSelectionStore()
        let bridge: ReminderBridgeViewModel
        if usesPreviewData {
            let secretStore = InMemoryReminderSourceSecretStore()
            bridge = ReminderBridgeViewModel(
                clientFactory: FixedReminderSnapshotClientFactory(client: PreviewReminderSnapshotClient()),
                secretStore: secretStore,
                registrationStore: InMemoryReminderBridgeRegistrationStore(),
                deviceName: "Preview iPhone",
                applicationVersion: applicationVersion
            )
        } else {
            let secretStore = KeychainReminderSourceSecretStore()
            bridge = ReminderBridgeViewModel(
                clientFactory: URLSessionReminderSnapshotClientFactory(secretStore: secretStore),
                secretStore: secretStore,
                registrationStore: UserDefaultsReminderBridgeRegistrationStore(),
                deviceName: deviceName,
                applicationVersion: applicationVersion
            )
        }
        #else
        let store: any ReminderStore = EventKitReminderStore()
        let selectionStore: any ReminderListSelectionStore = UserDefaultsReminderListSelectionStore()
        let secretStore = KeychainReminderSourceSecretStore()
        let bridge = ReminderBridgeViewModel(
            clientFactory: URLSessionReminderSnapshotClientFactory(secretStore: secretStore),
            secretStore: secretStore,
            registrationStore: UserDefaultsReminderBridgeRegistrationStore(),
            deviceName: deviceName,
            applicationVersion: applicationVersion
        )
        #endif
        let reminders = ReminderViewModel(
            store: store,
            selectionStore: selectionStore,
            snapshotConsumer: bridge
        )
        bridge.attachSnapshotRefresher(reminders)
        _bridgeModel = State(initialValue: bridge)
        _reminderModel = State(initialValue: reminders)
    }

    var body: some Scene {
        WindowGroup {
            AppShellView(reminderModel: reminderModel, bridgeModel: bridgeModel)
                .environment(theme)
        }
    }
}

#Preview("Hearth Companion") {
    let model = ReminderViewModel(
        store: FakeReminderStore.preview,
        selectionStore: InMemoryReminderListSelectionStore()
    )
    let secretStore = InMemoryReminderSourceSecretStore()
    let bridge = ReminderBridgeViewModel(
        clientFactory: FixedReminderSnapshotClientFactory(client: PreviewReminderSnapshotClient()),
        secretStore: secretStore,
        registrationStore: InMemoryReminderBridgeRegistrationStore(),
        deviceName: "Preview iPhone",
        applicationVersion: "1.0"
    )
    AppShellView(reminderModel: model, bridgeModel: bridge)
        .environment(HearthTheme())
}
