import Foundation
import Testing
@testable import HearthCompanion

@MainActor
@Suite("Reminder bridge state machine")
struct ReminderBridgeViewModelTests {
    @Test("adult-approved pairing stores a scoped source session")
    func pairsAfterAdultApproval() async throws {
        let context = makeContext()
        context.model.originInput = "https://hearth.example"

        await context.model.startPairing()
        guard case .waitingForApproval(let pairing) = context.model.connectionState else {
            Issue.record("Expected a pending pairing code")
            return
        }
        #expect(pairing.code == "A1B2C3")
        #expect(try context.secretStore.loadSecret()?.count == 32)

        await context.client.approvePairing()
        await context.model.checkApproval()

        guard case .paired(let session) = context.model.connectionState else {
            Issue.record("Expected an approved source session")
            return
        }
        #expect(session.scopes == [.snapshotWrite])
        #expect(session.nextSnapshotSequence == 1)
        #expect(context.registrationStore.registration?.session == session)
        #expect(context.model.uploadState == .waitingForReminderRead)
    }

    @Test("temporary upload failure retries the exact same request")
    func exactRetry() async throws {
        let context = makeContext(retryDelaysNanoseconds: [0])
        try await pair(context)
        await context.client.setUploadOutcomes([.temporaryFailure, .success])

        context.model.reminderSnapshotDidChange(makeSnapshot())
        try await waitUntil {
            if case .success = context.model.uploadState { return true }
            return false
        }

        let uploads = await context.client.uploads
        #expect(uploads.count == 2)
        #expect(uploads[0] == uploads[1])
        #expect(uploads[0].sequence == 1)
        #expect(uploads[0].requestId == uploads[1].requestId)
        #expect(uploads[0].snapshotId == uploads[1].snapshotId)
    }

    @Test("stale sequence fetches the server sequence and creates a fresh EventKit snapshot")
    func staleSequenceRecovery() async throws {
        let context = makeContext(retryDelaysNanoseconds: [])
        try await pair(context)
        await context.client.setUploadOutcomes([.stale(nextSequence: 7), .success])
        let refresher = SnapshotRefresherSpy()
        refresher.onRefresh = { [weak model = context.model] in
            model?.reminderSnapshotDidChange(Self.makeSnapshot(updatedAt: Date(timeIntervalSince1970: 1_787_624_100)))
        }
        context.model.attachSnapshotRefresher(refresher)

        context.model.reminderSnapshotDidChange(makeSnapshot())
        try await waitUntil {
            if case .success(let receipt) = context.model.uploadState {
                return receipt.sequence == 7
            }
            return false
        }

        let uploads = await context.client.uploads
        #expect(refresher.refreshCount == 1)
        #expect(uploads.map(\.sequence) == [1, 7])
        #expect(uploads[0].snapshotId != uploads[1].snapshotId)
        #expect(context.registrationStore.registration?.session?.nextSnapshotSequence == 8)
    }

    @Test("revoked source waits for user confirmation before deleting local pairing")
    func revokedSourceRequiresRepairConfirmation() async throws {
        let context = makeContext(retryDelaysNanoseconds: [])
        try await pair(context)
        await context.client.setUploadOutcomes([.unauthenticated])

        context.model.reminderSnapshotDidChange(makeSnapshot())
        try await waitUntil {
            if case .needsPairing = context.model.connectionState { return true }
            return false
        }

        #expect(try context.secretStore.loadSecret() != nil)
        #expect(context.registrationStore.registration != nil)
        context.model.clearInvalidPairing()
        #expect(try context.secretStore.loadSecret() == nil)
        #expect(context.registrationStore.registration == nil)
        #expect(context.model.connectionState == .notPaired)
    }

    @Test("background refresh waits for Hearth to accept the fresh EventKit snapshot")
    func backgroundRefreshWaitsForAcceptedSnapshot() async throws {
        let context = makeContext()
        try await pair(context)
        let refresher = SnapshotRefresherSpy()
        refresher.onRefresh = { [weak model = context.model] in
            model?.reminderSnapshotDidChange(Self.makeSnapshot())
        }
        context.model.attachSnapshotRefresher(refresher)

        let succeeded = await context.model.performBackgroundRefresh()

        #expect(succeeded)
        #expect(refresher.refreshCount == 1)
        let uploads = await context.client.uploads
        #expect(uploads.count == 1)
        #expect(uploads.first?.sequence == 1)
        guard case .success(let receipt) = context.model.uploadState else {
            Issue.record("Expected the background snapshot to be accepted")
            return
        }
        #expect(receipt.nextSnapshotSequence == 2)
    }

    @Test("background refresh reports failure when EventKit produces no safe snapshot")
    func backgroundRefreshRequiresSafeSnapshot() async throws {
        let context = makeContext()
        try await pair(context)
        let refresher = SnapshotRefresherSpy()
        context.model.attachSnapshotRefresher(refresher)

        let succeeded = await context.model.performBackgroundRefresh()

        #expect(!succeeded)
        #expect(refresher.refreshCount == 1)
        #expect(await context.client.uploads.isEmpty)
    }

    private struct Context {
        let model: ReminderBridgeViewModel
        let client: ScriptedReminderSnapshotClient
        let secretStore: InMemoryReminderSourceSecretStore
        let registrationStore: InMemoryReminderBridgeRegistrationStore
    }

    private func makeContext(retryDelaysNanoseconds: [UInt64] = []) -> Context {
        let client = ScriptedReminderSnapshotClient()
        let secretStore = InMemoryReminderSourceSecretStore()
        let registrationStore = InMemoryReminderBridgeRegistrationStore()
        let model = ReminderBridgeViewModel(
            clientFactory: FixedReminderSnapshotClientFactory(client: client),
            secretStore: secretStore,
            registrationStore: registrationStore,
            deviceName: "Test iPhone",
            applicationVersion: "1.0",
            automaticPolling: false,
            retryDelaysNanoseconds: retryDelaysNanoseconds
        )
        return Context(
            model: model,
            client: client,
            secretStore: secretStore,
            registrationStore: registrationStore
        )
    }

    private func pair(_ context: Context) async throws {
        context.model.originInput = "https://hearth.example"
        await context.model.startPairing()
        await context.client.approvePairing()
        await context.model.checkApproval()
        guard case .paired = context.model.connectionState else {
            Issue.record("Test setup could not pair the source")
            return
        }
    }

    private static func makeSnapshot(
        updatedAt: Date = Date(timeIntervalSince1970: 1_787_624_000)
    ) -> ReminderSnapshot {
        ReminderSnapshot(
            lists: [ReminderList(id: "eventkit-list-family", title: "Family Reminders")],
            selectedListIDs: ["eventkit-list-family"],
            reminders: [
                HearthReminder(
                    id: "eventkit-reminder-bins",
                    title: "Put the bins out",
                    listID: "eventkit-list-family",
                    listTitle: "Family Reminders",
                    dueLocalDate: "2026-08-25",
                    dueDate: Date(timeIntervalSince1970: 1_787_652_400),
                    hasDueTime: true,
                    isCompleted: false,
                    sourceUpdatedAt: updatedAt
                )
            ],
            updatedAt: updatedAt
        )
    }

    private func makeSnapshot() -> ReminderSnapshot {
        Self.makeSnapshot()
    }

    private func waitUntil(
        timeoutIterations: Int = 200,
        predicate: @escaping @MainActor () -> Bool
    ) async throws {
        for _ in 0..<timeoutIterations {
            if predicate() { return }
            try await Task.sleep(nanoseconds: 5_000_000)
        }
        Issue.record("Timed out waiting for bridge state")
    }
}

@MainActor
private final class SnapshotRefresherSpy: ReminderSnapshotRefreshing {
    var onRefresh: (() -> Void)?
    private(set) var refreshCount = 0

    func refreshForBridge() async {
        refreshCount += 1
        onRefresh?()
    }
}

private actor ScriptedReminderSnapshotClient: ReminderSnapshotClient {
    enum UploadOutcome: Sendable {
        case success
        case temporaryFailure
        case stale(nextSequence: Int)
        case unauthenticated
    }

    private var pairing = ReminderSourcePairingRequest(
        id: "pairing_test",
        requestId: "request_pairing_test",
        code: "A1B2C3",
        deviceName: "Test iPhone",
        platform: "ios",
        applicationVersion: "1.0",
        status: .pending,
        expiresAt: Date().addingTimeInterval(600)
    )
    private var session = ReminderSourceDeviceSession(
        contractVersion: 1,
        householdId: "household_test",
        deviceId: "reminder_device_test",
        sourceId: "reminder_source_test",
        scopes: [.snapshotWrite],
        pairedAt: Date(timeIntervalSince1970: 1_787_624_000),
        nextSnapshotSequence: 1
    )
    private var outcomes: [UploadOutcome] = []
    private(set) var uploads: [ReplaceReminderSnapshotRequest] = []

    func approvePairing() {
        pairing = ReminderSourcePairingRequest(
            id: pairing.id,
            requestId: pairing.requestId,
            code: pairing.code,
            deviceName: pairing.deviceName,
            platform: pairing.platform,
            applicationVersion: pairing.applicationVersion,
            status: .approved,
            expiresAt: pairing.expiresAt
        )
    }

    func setUploadOutcomes(_ outcomes: [UploadOutcome]) {
        self.outcomes = outcomes
    }

    func createPairing(_ request: CreateReminderSourcePairingRequest) async throws
        -> ReminderSourcePairingRequest {
        pairing = ReminderSourcePairingRequest(
            id: pairing.id,
            requestId: request.requestId,
            code: pairing.code,
            deviceName: request.deviceName,
            platform: request.platform,
            applicationVersion: request.applicationVersion,
            status: .pending,
            expiresAt: pairing.expiresAt
        )
        return pairing
    }

    func pairingStatus(id: String) async throws -> ReminderSourcePairingRequest {
        pairing
    }

    func exchange(
        id: String,
        request: ExchangeReminderSourcePairingRequest
    ) async throws -> ReminderSourceDeviceSession {
        session
    }

    func currentSession() async throws -> ReminderSourceDeviceSession {
        session
    }

    func replaceSnapshot(
        sourceID: String,
        request: ReplaceReminderSnapshotRequest
    ) async throws -> ReminderSnapshotReceipt {
        uploads.append(request)
        let outcome = outcomes.isEmpty ? .success : outcomes.removeFirst()
        switch outcome {
        case .temporaryFailure:
            throw ReminderSnapshotClientError.transport(.networkConnectionLost)
        case .stale(let nextSequence):
            session = makeSession(nextSequence: nextSequence)
            throw ReminderSnapshotClientError.api(
                status: 409,
                code: "STALE_SNAPSHOT",
                message: "A later snapshot already won.",
                retryable: false
            )
        case .unauthenticated:
            throw ReminderSnapshotClientError.api(
                status: 401,
                code: "UNAUTHENTICATED",
                message: "Source revoked.",
                retryable: false
            )
        case .success:
            session = makeSession(nextSequence: request.sequence + 1)
            return ReminderSnapshotReceipt(
                contractVersion: 1,
                sourceId: sourceID,
                snapshotId: request.snapshotId,
                sequence: request.sequence,
                generatedAt: request.generatedAt,
                acceptedAt: request.generatedAt,
                listCount: request.lists.count,
                reminderCount: request.reminders.count,
                incompleteCount: request.reminders.filter { !$0.isCompleted }.count,
                nextSnapshotSequence: request.sequence + 1,
                replayed: false
            )
        }
    }

    private func makeSession(nextSequence: Int) -> ReminderSourceDeviceSession {
        ReminderSourceDeviceSession(
            contractVersion: session.contractVersion,
            householdId: session.householdId,
            deviceId: session.deviceId,
            sourceId: session.sourceId,
            scopes: session.scopes,
            pairedAt: session.pairedAt,
            nextSnapshotSequence: nextSequence
        )
    }
}
