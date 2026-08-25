import EventKit
import Foundation

/// The only live integration in this proof. It reads EventKit objects and never calls
/// save, remove, commit, or any other mutating EventKit API.
@MainActor
final class EventKitReminderStore: ReminderStore {
    private let eventStore: EKEventStore

    init(eventStore: EKEventStore = EKEventStore()) {
        self.eventStore = eventStore
    }

    func authorizationStatus() -> ReminderAuthorization {
        switch EKEventStore.authorizationStatus(for: .reminder) {
        case .notDetermined:
            .notDetermined
        case .fullAccess:
            .fullAccess
        case .writeOnly:
            .writeOnly
        case .denied:
            .denied
        case .restricted:
            .restricted
        @unknown default:
            .unknown
        }
    }

    func requestFullAccess() async throws -> Bool {
        do {
            return try await eventStore.requestFullAccessToReminders()
        } catch {
            throw ReminderStoreError.requestFailed("Apple Reminders permission could not be requested: \(error.localizedDescription)")
        }
    }

    func reminderLists() async throws -> [ReminderList] {
        eventStore
            .calendars(for: .reminder)
            .map { ReminderList(id: $0.calendarIdentifier, title: $0.title) }
            .sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
    }

    func reminders(in listIDs: Set<String>) async throws -> [HearthReminder] {
        let calendars = eventStore.calendars(for: .reminder).filter { listIDs.contains($0.calendarIdentifier) }
        guard !calendars.isEmpty else { return [] }

        let predicate = eventStore.predicateForReminders(in: calendars)
        let store = eventStore

        let mapped = await withCheckedContinuation { continuation in
            store.fetchReminders(matching: predicate) { reminders in
                continuation.resume(returning: (reminders ?? []).map(Self.mapReminder))
            }
        }

        // EventKit invokes its callback on a private queue. Perform Foundation's
        // localized comparison after resuming this @MainActor method instead of
        // running the comparator inside that callback queue.
        return mapped.sorted { lhs, rhs in
            switch (lhs.dueDate, rhs.dueDate) {
            case let (left?, right?):
                if left != right { return left < right }
                return lhs.title.localizedStandardCompare(rhs.title) == .orderedAscending
            case (_?, nil):
                return true
            case (nil, _?):
                return false
            case (nil, nil):
                return lhs.title.localizedStandardCompare(rhs.title) == .orderedAscending
            }
        }
    }

    // EventKit delivers fetch callbacks on its own serial queue, not the main actor.
    // Keep this value-only projection nonisolated so the callback never synchronously
    // crosses into the @MainActor store and trips the Swift concurrency runtime.
    private nonisolated static func mapReminder(_ reminder: EKReminder) -> HearthReminder {
        let components = reminder.dueDateComponents
        let dueDate: Date?
        if let components {
            var calendar = Calendar.current
            if let timeZone = components.timeZone {
                calendar.timeZone = timeZone
            }
            dueDate = calendar.date(from: components)
        } else {
            dueDate = nil
        }

        return HearthReminder(
            id: reminder.calendarItemIdentifier,
            title: reminder.title,
            listTitle: reminder.calendar.title,
            dueDate: dueDate,
            hasDueTime: components?.hour != nil || components?.minute != nil,
            isCompleted: reminder.isCompleted
        )
    }
}
