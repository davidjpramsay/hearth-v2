import Foundation
import Testing
@testable import HearthCompanion

@Suite("Frozen Reminders contract")
struct ReminderBridgeContractTests {
    @Test("all four language-neutral v1 fixtures decode")
    func fixturesDecode() throws {
        let pairing: CreateReminderSourcePairingRequest = try decodeFixture("pairing-create-request")
        #expect(pairing.requestId == "request_reminder_pairing_001")
        #expect(pairing.platform == "ios")
        #expect(pairing.pairingSecret.count == 43)

        let session: ReminderSourceDeviceSession = try decodeFixture("device-session")
        #expect(session.isValidV1SourceSession)
        #expect(session.sourceId == "reminder_source_example")
        #expect(session.nextSnapshotSequence == 1)

        let snapshot: ReplaceReminderSnapshotRequest = try decodeFixture("snapshot-request")
        #expect(snapshot.contractVersion == 1)
        #expect(snapshot.lists == [
            ReminderSnapshotListInput(sourceListId: "eventkit-list-family", title: "Family Reminders")
        ])
        #expect(snapshot.reminders.first?.hasDueTime == true)
        #expect(snapshot.reminders.first?.completedAt == nil)

        let receipt: ReminderSnapshotReceipt = try decodeFixture("snapshot-receipt")
        #expect(receipt.sequence == 1)
        #expect(receipt.nextSnapshotSequence == 2)
        #expect(receipt.replayed == false)
    }

    @Test("wire adapter filters unselected lists and preserves due semantics")
    func mapsSelectedProjection() throws {
        let generatedAt = Date(timeIntervalSince1970: 1_787_624_000)
        let timedDue = Date(timeIntervalSince1970: 1_787_652_400)
        let snapshot = ReminderSnapshot(
            lists: [
                ReminderList(id: "family-list", title: " Family Reminders "),
                ReminderList(id: "private-list", title: "Private")
            ],
            selectedListIDs: ["family-list"],
            reminders: [
                HearthReminder(
                    id: "timed-reminder",
                    title: " Put the bins out ",
                    listID: "family-list",
                    listTitle: "Family Reminders",
                    dueLocalDate: "2026-08-25",
                    dueDate: timedDue,
                    hasDueTime: true,
                    isCompleted: false,
                    sourceUpdatedAt: generatedAt
                ),
                HearthReminder(
                    id: "date-reminder",
                    title: "Date only",
                    listID: "family-list",
                    listTitle: "Family Reminders",
                    dueLocalDate: "2026-08-26",
                    dueDate: timedDue,
                    hasDueTime: false,
                    isCompleted: true,
                    completedAt: generatedAt
                ),
                HearthReminder(
                    id: "private-reminder",
                    title: "Not selected",
                    listID: "private-list",
                    listTitle: "Private",
                    dueDate: nil,
                    hasDueTime: false,
                    isCompleted: false
                )
            ],
            updatedAt: generatedAt
        )

        let request = try EventKitReminderSnapshotWireAdapter().makeRequest(
            from: snapshot,
            sequence: 7,
            requestId: "request_mapping_test",
            snapshotId: "snapshot_mapping_test"
        )

        #expect(request.sequence == 7)
        #expect(request.generatedAt == generatedAt)
        #expect(request.lists == [
            ReminderSnapshotListInput(sourceListId: "family-list", title: "Family Reminders")
        ])
        #expect(request.reminders.count == 2)
        let dateOnly = try #require(request.reminders.first { $0.sourceReminderId == "date-reminder" })
        #expect(dateOnly.dueLocalDate == "2026-08-26")
        #expect(dateOnly.dueAt == nil)
        #expect(dateOnly.hasDueTime == false)
        #expect(dateOnly.completedAt == generatedAt)
        let timed = try #require(request.reminders.first { $0.sourceReminderId == "timed-reminder" })
        #expect(timed.dueAt == timedDue)
        #expect(timed.hasDueTime)
        #expect(timed.completedAt == nil)
    }

    @Test("an intentional empty selection maps to an empty full snapshot")
    func mapsIntentionalEmptySnapshot() throws {
        let snapshot = ReminderSnapshot(
            lists: [ReminderList(id: "family", title: "Family")],
            selectedListIDs: [],
            reminders: [],
            updatedAt: Date(timeIntervalSince1970: 1_787_624_000)
        )
        let request = try EventKitReminderSnapshotWireAdapter().makeRequest(
            from: snapshot,
            sequence: 2,
            requestId: "request_empty_snapshot",
            snapshotId: "snapshot_empty_snapshot"
        )
        #expect(request.lists.isEmpty)
        #expect(request.reminders.isEmpty)
    }

    @Test("inconsistent timed due fields fail before network transport")
    func rejectsInconsistentDueDate() {
        let snapshot = ReminderSnapshot(
            lists: [ReminderList(id: "family", title: "Family")],
            selectedListIDs: ["family"],
            reminders: [
                HearthReminder(
                    id: "broken",
                    title: "Broken due date",
                    listID: "family",
                    listTitle: "Family",
                    dueLocalDate: "2026-08-25",
                    dueDate: nil,
                    hasDueTime: true,
                    isCompleted: false
                )
            ],
            updatedAt: Date()
        )
        #expect(throws: ReminderSnapshotMappingError.invalidDueDate) {
            try EventKitReminderSnapshotWireAdapter().makeRequest(from: snapshot, sequence: 1)
        }
    }

    @Test("trusted origin accepts HTTPS only and strips a root slash")
    func validatesOrigin() throws {
        #expect(try HearthServerOrigin("https://hearth.example/").displayString == "https://hearth.example")
        #expect(throws: HearthServerOriginError.invalid) { try HearthServerOrigin("http://hearth.example") }
        #expect(throws: HearthServerOriginError.invalid) { try HearthServerOrigin("https://user@hearth.example") }
        #expect(throws: HearthServerOriginError.invalid) { try HearthServerOrigin("https://hearth.example/private") }
    }

    @Test("a 32-byte source secret is unpadded base64url")
    func sourceSecretEncoding() throws {
        let store = InMemoryReminderSourceSecretStore()
        _ = try store.replaceWithNewSecret()
        let savedSecret = try store.encodedSecret()
        let encoded = try #require(savedSecret)
        #expect(encoded.count == 43)
        #expect(encoded.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
        #expect(!encoded.contains("="))
    }

    @MainActor
    @Test("registration metadata persists without the source secret")
    func registrationRoundTrip() throws {
        let suiteName = "HearthCompanionBridgeTests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let store = UserDefaultsReminderBridgeRegistrationStore(defaults: defaults)
        let registration = ReminderBridgeRegistration(
            origin: try HearthServerOrigin("https://hearth.example"),
            createRequestId: "request_create_test",
            exchangeRequestId: "request_exchange_test",
            deviceName: "Test iPhone",
            applicationVersion: "1.0",
            pairing: nil,
            session: nil
        )
        store.save(registration)
        #expect(store.load() == registration)
        let raw = try #require(defaults.data(forKey: UserDefaultsReminderBridgeRegistrationStore.defaultKey))
        let text = try #require(String(data: raw, encoding: .utf8))
        #expect(!text.contains("pairingSecret"))
        #expect(!text.contains("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"))
    }

    private func decodeFixture<Value: Decodable>(_ name: String) throws -> Value {
        var hearthRoot = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 {
            hearthRoot.deleteLastPathComponent()
        }
        let fixtureURL = hearthRoot
            .appending(path: "packages/shared/fixtures/reminders-contract-v1")
            .appending(path: "\(name).json")
        return try ReminderContractJSON.decoder().decode(Value.self, from: Data(contentsOf: fixtureURL))
    }
}
