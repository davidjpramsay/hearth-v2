import Foundation
import Observation

@MainActor
@Observable
final class ReminderViewModel {
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
    private var hasStarted = false
    private var hasResolvedInitialSelection = false
    private var lastSnapshot: ReminderSnapshot?

    private(set) var state: State = .firstUse
    private(set) var selectedListIDs: Set<String>

    init(store: any ReminderStore, initialSelectedListIDs: Set<String> = []) {
        self.store = store
        self.selectedListIDs = initialSelectedListIDs
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
        guard store.authorizationStatus() == .fullAccess else {
            state = .unavailable(store.authorizationStatus())
            return
        }
        await load()
    }

    func selectLists(_ ids: Set<String>) async {
        selectedListIDs = ids
        await refresh()
    }

    private func load() async {
        state = .loading
        do {
            let lists = try await store.reminderLists()
            let validIDs = Set(lists.map(\.id))
            let normalizedSelection = selectedListIDs.intersection(validIDs)
            let effectiveSelection = !hasResolvedInitialSelection && normalizedSelection.isEmpty ? validIDs : normalizedSelection
            hasResolvedInitialSelection = true
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
}
