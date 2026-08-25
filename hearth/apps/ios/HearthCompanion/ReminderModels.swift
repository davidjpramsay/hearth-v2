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
    let listID: String
    let listTitle: String
    let dueLocalDate: String?
    let dueDate: Date?
    let hasDueTime: Bool
    let isCompleted: Bool
    let completedAt: Date?
    let sourceUpdatedAt: Date?

    init(
        id: String,
        title: String,
        listID: String,
        listTitle: String,
        dueLocalDate: String? = nil,
        dueDate: Date?,
        hasDueTime: Bool,
        isCompleted: Bool,
        completedAt: Date? = nil,
        sourceUpdatedAt: Date? = nil
    ) {
        self.id = id
        self.title = title
        self.listID = listID
        self.listTitle = listTitle
        self.dueLocalDate = dueLocalDate
        self.dueDate = dueDate
        self.hasDueTime = hasDueTime
        self.isCompleted = isCompleted
        self.completedAt = completedAt
        self.sourceUpdatedAt = sourceUpdatedAt
    }
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

/// Persists only the opaque identifiers of lists the adult chose to display.
/// Reminder content and Apple credentials never enter this store.
@MainActor
protocol ReminderListSelectionStore: AnyObject {
    /// Returns nil when the adult has never made or inherited an initial choice.
    /// An empty set is a deliberate choice to display no lists.
    func loadSelectedListIDs() -> Set<String>?
    func saveSelectedListIDs(_ ids: Set<String>)
}

@MainActor
final class UserDefaultsReminderListSelectionStore: ReminderListSelectionStore {
    static let defaultKey = "reminders.selectedListIdentifiers"

    private let defaults: UserDefaults
    private let key: String

    init(defaults: UserDefaults = .standard, key: String = defaultKey) {
        self.defaults = defaults
        self.key = key
    }

    func loadSelectedListIDs() -> Set<String>? {
        guard defaults.object(forKey: key) != nil else { return nil }
        guard let ids = defaults.array(forKey: key) as? [String] else {
            // Fail closed if the local preference is malformed instead of
            // unexpectedly widening the selection to every EventKit list.
            return []
        }
        return Set(ids)
    }

    func saveSelectedListIDs(_ ids: Set<String>) {
        defaults.set(ids.sorted(), forKey: key)
    }
}

@MainActor
final class InMemoryReminderListSelectionStore: ReminderListSelectionStore {
    private(set) var selectedListIDs: Set<String>?

    init(selectedListIDs: Set<String>? = nil) {
        self.selectedListIDs = selectedListIDs
    }

    func loadSelectedListIDs() -> Set<String>? {
        selectedListIDs
    }

    func saveSelectedListIDs(_ ids: Set<String>) {
        selectedListIDs = ids
    }
}
