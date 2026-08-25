import Foundation

@MainActor
final class FakeReminderStore: ReminderStore {
    enum RequestOutcome {
        case grant
        case deny
        case fail
    }

    var status: ReminderAuthorization
    var requestOutcome: RequestOutcome
    var lists: [ReminderList]
    var reminders: [HearthReminder]
    var shouldFailLists = false
    var shouldFailReminders = false
    var artificialDelayNanoseconds: UInt64 = 0

    init(
        status: ReminderAuthorization = .fullAccess,
        requestOutcome: RequestOutcome = .grant,
        lists: [ReminderList] = [],
        reminders: [HearthReminder] = []
    ) {
        self.status = status
        self.requestOutcome = requestOutcome
        self.lists = lists
        self.reminders = reminders
    }

    func authorizationStatus() -> ReminderAuthorization { status }

    func requestFullAccess() async throws -> Bool {
        await pauseIfNeeded()
        switch requestOutcome {
        case .grant:
            status = .fullAccess
            return true
        case .deny:
            status = .denied
            return false
        case .fail:
            throw ReminderStoreError.requestFailed("The fake permission request failed.")
        }
    }

    func reminderLists() async throws -> [ReminderList] {
        await pauseIfNeeded()
        guard !shouldFailLists else {
            throw ReminderStoreError.readFailed("The fake list read failed.")
        }
        return lists
    }

    func reminders(in listIDs: Set<String>) async throws -> [HearthReminder] {
        await pauseIfNeeded()
        guard !shouldFailReminders else {
            throw ReminderStoreError.readFailed("The fake reminder read failed.")
        }
        return reminders.filter { reminder in
            lists.first(where: { $0.title == reminder.listTitle }).map { listIDs.contains($0.id) } ?? false
        }
    }

    private func pauseIfNeeded() async {
        guard artificialDelayNanoseconds > 0 else { return }
        try? await Task.sleep(nanoseconds: artificialDelayNanoseconds)
    }
}

extension FakeReminderStore {
    static var preview: FakeReminderStore {
        let lists = [
            ReminderList(id: "reminders", title: "Reminders"),
            ReminderList(id: "family", title: "Family Reminders")
        ]
        let calendar = Calendar(identifier: .gregorian)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: Date())
        return FakeReminderStore(
            lists: lists,
            reminders: [
                HearthReminder(id: "milk", title: "Pick up milk", listTitle: "Family Reminders", dueDate: tomorrow, hasDueTime: false, isCompleted: false),
                HearthReminder(id: "bins", title: "Put the bins out", listTitle: "Reminders", dueDate: tomorrow, hasDueTime: true, isCompleted: true),
                HearthReminder(id: "library", title: "Return library books", listTitle: "Family Reminders", dueDate: nil, hasDueTime: false, isCompleted: false)
            ]
        )
    }
}
