import Foundation
import Testing
@testable import HearthCompanion

@MainActor
struct ReminderViewModelTests {
    private let lists = [
        ReminderList(id: "reminders", title: "Reminders"),
        ReminderList(id: "family", title: "Family Reminders")
    ]

    private var reminders: [HearthReminder] {
        [
            HearthReminder(id: "one", title: "Pack lunch", listTitle: "Family Reminders", dueDate: Date(timeIntervalSince1970: 100), hasDueTime: true, isCompleted: false),
            HearthReminder(id: "two", title: "Water herbs", listTitle: "Reminders", dueDate: nil, hasDueTime: false, isCompleted: true)
        ]
    }

    @Test("first use requests access and reaches a selected-list success state")
    func permissionRequestAndSuccess() async {
        let fake = FakeReminderStore(status: .notDetermined, lists: lists, reminders: reminders)
        let model = ReminderViewModel(store: fake)

        await model.start()
        #expect(model.state == .firstUse)

        await model.requestAccess()

        guard case .success(let snapshot) = model.state else {
            Issue.record("Expected successful reminder load, got \(model.state)")
            return
        }
        #expect(snapshot.lists == lists)
        #expect(snapshot.selectedListIDs == Set(["reminders", "family"]))
        #expect(snapshot.reminders.count == 2)
    }

    @Test("denied permission is an intentional terminal state")
    func deniedPermission() async {
        let fake = FakeReminderStore(status: .notDetermined, requestOutcome: .deny, lists: lists, reminders: reminders)
        let model = ReminderViewModel(store: fake)

        await model.start()
        await model.requestAccess()

        #expect(model.state == .unavailable(.denied))
    }

    @Test("restricted permission is surfaced before any read")
    func restrictedPermission() async {
        let fake = FakeReminderStore(status: .restricted, lists: lists, reminders: reminders)
        let model = ReminderViewModel(store: fake)

        await model.start()

        #expect(model.state == .unavailable(.restricted))
    }

    @Test("selecting one list filters reminders without changing the fake data")
    func listSelection() async {
        let fake = FakeReminderStore(lists: lists, reminders: reminders)
        let selectionStore = InMemoryReminderListSelectionStore()
        let model = ReminderViewModel(store: fake, selectionStore: selectionStore)

        await model.start()
        await model.selectLists(["family"])

        guard case .success(let snapshot) = model.state else {
            Issue.record("Expected success after selecting a list")
            return
        }
        #expect(snapshot.selectedListIDs == ["family"])
        #expect(snapshot.reminders.map(\.id) == ["one"])
        #expect(fake.reminders.count == 2)
        #expect(selectionStore.selectedListIDs == ["family"])
    }

    @Test("clearing the list selection produces an intentional empty state")
    func emptySelection() async {
        let fake = FakeReminderStore(lists: lists, reminders: reminders)
        let model = ReminderViewModel(store: fake)

        await model.start()
        await model.selectLists([])

        guard case .empty(let snapshot) = model.state else {
            Issue.record("Expected empty state after clearing list selection, got \(model.state)")
            return
        }
        #expect(snapshot.selectedListIDs.isEmpty)
        #expect(snapshot.reminders.isEmpty)
    }

    @Test("a failed refresh preserves the last successful snapshot as stale")
    func staleAfterFailure() async {
        let fake = FakeReminderStore(lists: lists, reminders: reminders)
        let model = ReminderViewModel(store: fake)

        await model.start()
        fake.shouldFailReminders = true
        await model.refresh()

        guard case .stale(let snapshot, _) = model.state else {
            Issue.record("Expected stale state after a failed refresh, got \(model.state)")
            return
        }
        #expect(snapshot.reminders.count == 2)
    }

    @Test("a first read failure is a retryable failure state")
    func initialFailure() async {
        let fake = FakeReminderStore(lists: lists, reminders: reminders)
        fake.shouldFailLists = true
        let model = ReminderViewModel(store: fake)

        await model.start()

        guard case .failure(let message) = model.state else {
            Issue.record("Expected failure state, got \(model.state)")
            return
        }
        #expect(message.contains("fake list read failed"))
    }

    @Test("an EventKit-style change notification refreshes the visible reminders")
    func automaticRefresh() async throws {
        let fake = FakeReminderStore(lists: lists, reminders: reminders)
        let model = ReminderViewModel(store: fake)

        await model.start()
        fake.reminders = [
            HearthReminder(id: "three", title: "Updated from Apple Reminders", listTitle: "Family Reminders", dueDate: nil, hasDueTime: false, isCompleted: false)
        ]
        fake.emitChange()
        try await Task.sleep(nanoseconds: 600_000_000)

        guard case .success(let snapshot) = model.state else {
            Issue.record("Expected automatic refresh to finish successfully, got \(model.state)")
            return
        }
        #expect(snapshot.reminders.map(\.id) == ["three"])
    }

    @Test("a refresh keeps the last successful content while reading")
    func refreshPreservesContent() async throws {
        let fake = FakeReminderStore(lists: lists, reminders: reminders)
        let model = ReminderViewModel(store: fake)

        await model.start()
        fake.artificialDelayNanoseconds = 200_000_000
        let refreshTask = Task { await model.refresh() }
        try await Task.sleep(nanoseconds: 20_000_000)

        #expect(model.isRefreshing)
        guard case .success(let snapshot) = model.state else {
            Issue.record("Expected the last successful content to remain visible during refresh, got \(model.state)")
            await refreshTask.value
            return
        }
        #expect(snapshot.reminders.count == reminders.count)
        await refreshTask.value
    }

    @Test("a saved list selection is restored on launch")
    func restoresSavedSelection() async {
        let selectionStore = InMemoryReminderListSelectionStore(selectedListIDs: ["family"])
        let fake = FakeReminderStore(lists: lists, reminders: reminders)
        let model = ReminderViewModel(store: fake, selectionStore: selectionStore)

        await model.start()

        guard case .success(let snapshot) = model.state else {
            Issue.record("Expected the saved selection to load successfully, got \(model.state)")
            return
        }
        #expect(snapshot.selectedListIDs == ["family"])
        #expect(snapshot.reminders.map(\.id) == ["one"])
    }

    @Test("an intentional empty selection survives relaunch")
    func emptySelectionSurvivesRelaunch() async {
        let selectionStore = InMemoryReminderListSelectionStore()
        let firstModel = ReminderViewModel(
            store: FakeReminderStore(lists: lists, reminders: reminders),
            selectionStore: selectionStore
        )
        await firstModel.start()
        await firstModel.selectLists([])

        let relaunchedModel = ReminderViewModel(
            store: FakeReminderStore(lists: lists, reminders: reminders),
            selectionStore: selectionStore
        )
        await relaunchedModel.start()

        guard case .empty(let snapshot) = relaunchedModel.state else {
            Issue.record("Expected the empty selection after relaunch, got \(relaunchedModel.state)")
            return
        }
        #expect(snapshot.selectedListIDs.isEmpty)
        #expect(snapshot.reminders.isEmpty)
    }

    @Test("identifiers for lists that no longer exist are pruned")
    func prunesRemovedLists() async {
        let selectionStore = InMemoryReminderListSelectionStore(selectedListIDs: ["family", "removed"])
        let model = ReminderViewModel(
            store: FakeReminderStore(lists: lists, reminders: reminders),
            selectionStore: selectionStore
        )

        await model.start()

        guard case .success(let snapshot) = model.state else {
            Issue.record("Expected the remaining selected list to load, got \(model.state)")
            return
        }
        #expect(snapshot.selectedListIDs == ["family"])
        #expect(selectionStore.selectedListIDs == ["family"])
    }

    @Test("a temporary no-list result does not persist an accidental empty choice")
    func transientNoListsDoesNotFreezeSelection() async throws {
        let selectionStore = InMemoryReminderListSelectionStore()
        let fake = FakeReminderStore()
        let model = ReminderViewModel(store: fake, selectionStore: selectionStore)

        await model.start()
        #expect(selectionStore.selectedListIDs == nil)

        fake.lists = lists
        fake.reminders = reminders
        fake.emitChange()
        try await Task.sleep(nanoseconds: 600_000_000)

        guard case .success(let snapshot) = model.state else {
            Issue.record("Expected lists arriving later to become selected, got \(model.state)")
            return
        }
        #expect(snapshot.selectedListIDs == ["reminders", "family"])
        #expect(selectionStore.selectedListIDs == ["reminders", "family"])
    }

    @Test("the UserDefaults adapter distinguishes unset, empty, and selected values")
    func userDefaultsSelectionStoreRoundTrip() {
        let suiteName = "HearthCompanionTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let selectionStore = UserDefaultsReminderListSelectionStore(defaults: defaults)

        #expect(selectionStore.loadSelectedListIDs() == nil)
        selectionStore.saveSelectedListIDs([])
        #expect(selectionStore.loadSelectedListIDs() == [])
        selectionStore.saveSelectedListIDs(["reminders", "family"])
        #expect(selectionStore.loadSelectedListIDs() == ["reminders", "family"])
    }
}
