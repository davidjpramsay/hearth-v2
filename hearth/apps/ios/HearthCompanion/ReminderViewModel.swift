import Foundation
import Observation

@MainActor
@Observable
final class ReminderViewModel: ReminderSnapshotRefreshing {
    enum State: Equatable {
        case firstUse
        case requestingPermission
        case unavailable(ReminderAuthorization)
        case loading
        case empty(ReminderSnapshot)
        case success(ReminderSnapshot)
        case stale(ReminderSnapshot, message: String)
        case failure(message: String)
    }

    private let store: any ReminderStore
    private let selectionStore: any ReminderListSelectionStore
    private let snapshotConsumer: (any ReminderSnapshotConsumer)?
    private let hadPersistedInitialSelection: Bool
    private var hasStarted = false
    private var hasResolvedInitialSelection = false
    private var lastSnapshot: ReminderSnapshot?
    private var changeTask: Task<Void, Never>?
    private var pendingAutoRefreshTask: Task<Void, Never>?

    private(set) var state: State = .firstUse
    private(set) var selectedListIDs: Set<String>
    private(set) var isRefreshing = false

    init(
        store: any ReminderStore,
        selectionStore: any ReminderListSelectionStore = InMemoryReminderListSelectionStore(),
        snapshotConsumer: (any ReminderSnapshotConsumer)? = nil
    ) {
        self.store = store
        self.selectionStore = selectionStore
        self.snapshotConsumer = snapshotConsumer
        let persistedSelection = selectionStore.loadSelectedListIDs()
        hadPersistedInitialSelection = persistedSelection != nil
        selectedListIDs = persistedSelection ?? []
    }

    isolated deinit {
        changeTask?.cancel()
        pendingAutoRefreshTask?.cancel()
    }

    var snapshot: ReminderSnapshot? {
        switch state {
        case .empty(let snapshot), .success(let snapshot), .stale(let snapshot, _):
            snapshot
        default:
            lastSnapshot
        }
    }

    func start() async {
        guard !hasStarted else { return }
        hasStarted = true

        switch store.authorizationStatus() {
        case .notDetermined:
            state = .firstUse
        case .fullAccess:
            await load()
            startObservingChanges()
        case let status:
            state = .unavailable(status)
        }
    }

    func requestAccess() async {
        state = .requestingPermission
        do {
            let granted = try await store.requestFullAccess()
            guard granted else {
                state = .unavailable(.denied)
                return
            }
            await load()
            startObservingChanges()
        } catch is CancellationError {
            return
        } catch {
            let status = store.authorizationStatus()
            state = status == .denied || status == .restricted
                ? .unavailable(status)
                : .failure(message: error.localizedDescription)
        }
    }

    func refresh() async {
        guard !isRefreshing else { return }
        guard store.authorizationStatus() == .fullAccess else {
            state = .unavailable(store.authorizationStatus())
            return
        }
        await load()
    }

    func selectLists(_ ids: Set<String>) async {
        selectedListIDs = ids
        hasResolvedInitialSelection = true
        selectionStore.saveSelectedListIDs(ids)
        await refresh()
    }

    func refreshForBridge() async {
        await refresh()
    }

    private func load() async {
        let preservesExistingContent = lastSnapshot != nil
        if !preservesExistingContent {
            state = .loading
        }
        isRefreshing = preservesExistingContent
        defer { isRefreshing = false }

        do {
            let lists = try await store.reminderLists()
            let validIDs = Set(lists.map(\.id))
            if validIDs.isEmpty, !selectedListIDs.isEmpty {
                throw ReminderStoreError.readFailed(
                    "Apple Reminders temporarily returned no lists. Hearth kept the last safe snapshot instead of treating that as an intentional clear."
                )
            }
            let normalizedSelection = selectedListIDs.intersection(validIDs)
            let isResolvingFirstSelection = !hasResolvedInitialSelection
            let effectiveSelection = isResolvingFirstSelection && !hadPersistedInitialSelection
                ? validIDs
                : normalizedSelection

            // An account can temporarily report no lists while EventKit/iCloud
            // settles. Do not freeze that transient state as an explicit empty
            // choice unless a persisted choice already existed.
            if hadPersistedInitialSelection || !validIDs.isEmpty {
                hasResolvedInitialSelection = true
                selectionStore.saveSelectedListIDs(effectiveSelection)
            }
            selectedListIDs = effectiveSelection

            let reminders = try await store.reminders(in: effectiveSelection)
            let snapshot = ReminderSnapshot(
                lists: lists,
                selectedListIDs: effectiveSelection,
                reminders: reminders,
                updatedAt: Date()
            )
            lastSnapshot = snapshot
            state = reminders.isEmpty ? .empty(snapshot) : .success(snapshot)
            if hasResolvedInitialSelection {
                snapshotConsumer?.reminderSnapshotDidChange(snapshot)
            }
        } catch is CancellationError {
            return
        } catch {
            if let lastSnapshot {
                state = .stale(lastSnapshot, message: error.localizedDescription)
            } else {
                state = .failure(message: error.localizedDescription)
            }
        }
    }

    private func startObservingChanges() {
        guard changeTask == nil else { return }
        let changes = store.changes
        changeTask = Task { [weak self] in
            for await _ in changes {
                guard !Task.isCancelled else { return }
                self?.scheduleAutomaticRefresh()
            }
        }
    }

    private func scheduleAutomaticRefresh() {
        pendingAutoRefreshTask?.cancel()
        pendingAutoRefreshTask = Task { [weak self] in
            do {
                try await Task.sleep(nanoseconds: 350_000_000)
                guard !Task.isCancelled else { return }
                await self?.refresh()
            } catch is CancellationError {
                return
            } catch {
                return
            }
        }
    }
}
