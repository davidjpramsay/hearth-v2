import Foundation

enum ReminderAuthorization: String, Equatable, Sendable {
    case notDetermined
    case fullAccess
    case writeOnly
    case denied
    case restricted
    case unknown
}

struct ReminderList: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
}

struct HearthReminder: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let listTitle: String
    let dueDate: Date?
    let hasDueTime: Bool
    let isCompleted: Bool
}

struct ReminderSnapshot: Equatable, Sendable {
    let lists: [ReminderList]
    let selectedListIDs: Set<String>
    let reminders: [HearthReminder]
    let updatedAt: Date
}

enum ReminderStoreError: LocalizedError, Equatable, Sendable {
    case permissionDenied
    case permissionRestricted
    case permissionUnavailable
    case requestFailed(String)
    case readFailed(String)

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            "Reminders access is turned off for Hearth Companion."
        case .permissionRestricted:
            "Reminders access is restricted on this iPhone."
        case .permissionUnavailable:
            "Full Reminders access is required to read your lists."
        case .requestFailed(let message), .readFailed(let message):
            message
        }
    }
}

@MainActor
protocol ReminderStore {
    /// Emits when the underlying reminder database may have changed.
    /// Consumers must refetch because EventKit objects can become stale.
    var changes: AsyncStream<Void> { get }
    func authorizationStatus() -> ReminderAuthorization
    func requestFullAccess() async throws -> Bool
    func reminderLists() async throws -> [ReminderList]
    func reminders(in listIDs: Set<String>) async throws -> [HearthReminder]
}
