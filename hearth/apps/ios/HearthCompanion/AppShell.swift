import Observation
import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case reminders
    case hearth
    case privacy

    var id: String { rawValue }

    @ViewBuilder
    var label: some View {
        switch self {
        case .reminders:
            Label("Reminders", systemImage: "checklist")
        case .hearth:
            Label("Hearth", systemImage: "house.and.flag")
        case .privacy:
            Label("Privacy", systemImage: "lock.shield")
        }
    }
}

enum AppRoute: Hashable {
    case reminder(id: String)
}

enum SheetDestination: Identifiable {
    case listPicker

    var id: String { "list-picker" }
}

@MainActor
@Observable
final class RouterPath {
    var path: [AppRoute] = []
    var presentedSheet: SheetDestination?
}

struct AppShellView: View {
    let reminderModel: ReminderViewModel
    let bridgeModel: ReminderBridgeViewModel

    @State private var selectedTab: AppTab = .reminders
    @State private var remindersRouter = RouterPath()
    @State private var bridgeRouter = RouterPath()
    @State private var privacyRouter = RouterPath()
    @Environment(HearthTheme.self) private var theme
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var remindersRouter = remindersRouter
        @Bindable var bridgeRouter = bridgeRouter
        @Bindable var privacyRouter = privacyRouter

        TabView(selection: $selectedTab) {
            NavigationStack(path: $remindersRouter.path) {
                ReminderHomeView(model: reminderModel)
                    .navigationDestination(for: AppRoute.self) { route in
                        switch route {
                        case .reminder(let id):
                            ReminderDetailView(reminderID: id, model: reminderModel)
                        }
                    }
            }
            .withSheetDestinations(sheet: $remindersRouter.presentedSheet, model: reminderModel)
            .environment(remindersRouter)
            .tabItem { AppTab.reminders.label }
            .tag(AppTab.reminders)

            NavigationStack(path: $bridgeRouter.path) {
                ReminderBridgeView(model: bridgeModel)
            }
            .environment(bridgeRouter)
            .tabItem { AppTab.hearth.label }
            .tag(AppTab.hearth)

            NavigationStack(path: $privacyRouter.path) {
                PrivacyView()
            }
            .environment(privacyRouter)
            .tabItem { AppTab.privacy.label }
            .tag(AppTab.privacy)
        }
        .tint(theme.accent)
        .task { await bridgeModel.start() }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await bridgeModel.resumeOnForeground() }
        }
    }
}

extension View {
    func withSheetDestinations(
        sheet destinationBinding: Binding<SheetDestination?>,
        model: ReminderViewModel
    ) -> some View {
        self.sheet(item: destinationBinding) { destination in
            switch destination {
            case .listPicker:
                ReminderListPickerSheet(model: model)
            }
        }
    }
}
