import Foundation
import Observation

@MainActor
protocol ReminderSnapshotRefreshing: AnyObject {
    func refreshForBridge() async
}

@MainActor
@Observable
final class ReminderBridgeViewModel: ReminderSnapshotConsumer {
    enum ConnectionState: Equatable {
        case notPaired
        case checking
        case creatingPairing
        case waitingForApproval(ReminderSourcePairingRequest)
        case exchanging(ReminderSourcePairingRequest)
        case paired(ReminderSourceDeviceSession)
        case needsPairing(message: String)
        case failure(message: String)
    }

    enum UploadState: Equatable {
        case idle
        case waitingForReminderRead
        case uploading(sequence: Int)
        case retrying(sequence: Int, delaySeconds: Int)
        case success(ReminderSnapshotReceipt)
        case failure(message: String)
    }

    private struct PendingUpload: Sendable {
        let revision: Int
        let sourceID: String
        let request: ReplaceReminderSnapshotRequest
    }

    private let clientFactory: any ReminderSnapshotClientFactory
    private let secretStore: any ReminderSourceSecretStore
    private let registrationStore: any ReminderBridgeRegistrationStore
    private let wireAdapter: EventKitReminderSnapshotWireAdapter
    private let deviceName: String
    private let applicationVersion: String
    private let automaticPolling: Bool
    private let retryDelaysNanoseconds: [UInt64]

    private var registration: ReminderBridgeRegistration?
    private var client: (any ReminderSnapshotClient)?
    private weak var snapshotRefresher: (any ReminderSnapshotRefreshing)?
    private var hasStarted = false
    private var pairingPollTask: Task<Void, Never>?
    private var uploadTask: Task<Void, Never>?
    private var pendingUpload: PendingUpload?
    private var latestSnapshot: ReminderSnapshot?
    private var latestSnapshotRevision = 0
    private var lastUploadedRevision = 0

    var originInput = ""
    private(set) var connectionState: ConnectionState = .notPaired
    private(set) var uploadState: UploadState = .idle

    var canChangeUnpairedOrigin: Bool {
        registration != nil && registration?.session == nil
    }

    init(
        clientFactory: any ReminderSnapshotClientFactory,
        secretStore: any ReminderSourceSecretStore,
        registrationStore: any ReminderBridgeRegistrationStore,
        wireAdapter: EventKitReminderSnapshotWireAdapter = EventKitReminderSnapshotWireAdapter(),
        deviceName: String,
        applicationVersion: String,
        automaticPolling: Bool = true,
        retryDelaysNanoseconds: [UInt64] = [2_000_000_000, 5_000_000_000, 15_000_000_000, 30_000_000_000]
    ) {
        self.clientFactory = clientFactory
        self.secretStore = secretStore
        self.registrationStore = registrationStore
        self.wireAdapter = wireAdapter
        self.deviceName = Self.boundedNonempty(deviceName, maximumUTF16Length: 80, fallback: "iPhone")
        self.applicationVersion = Self.boundedNonempty(
            applicationVersion,
            maximumUTF16Length: 40,
            fallback: "1.0"
        )
        self.automaticPolling = automaticPolling
        self.retryDelaysNanoseconds = retryDelaysNanoseconds
    }

    isolated deinit {
        pairingPollTask?.cancel()
        uploadTask?.cancel()
    }

    func attachSnapshotRefresher(_ refresher: any ReminderSnapshotRefreshing) {
        snapshotRefresher = refresher
    }

    func start() async {
        guard !hasStarted else { return }
        hasStarted = true
        guard let saved = registrationStore.load() else {
            connectionState = .notPaired
            return
        }

        registration = saved
        originInput = saved.origin.displayString
        client = clientFactory.makeClient(origin: saved.origin)
        do {
            guard try secretStore.encodedSecret() != nil else {
                connectionState = .needsPairing(
                    message: "This iPhone no longer has its protected Hearth source secret. Pair it again."
                )
                return
            }
        } catch {
            connectionState = .needsPairing(message: error.localizedDescription)
            return
        }

        if saved.session != nil {
            await refreshCurrentSession()
        } else {
            await resumePairing()
        }
    }

    func startPairing() async {
        pairingPollTask?.cancel()
        uploadTask?.cancel()
        pendingUpload = nil
        uploadState = .idle

        do {
            let origin = try HearthServerOrigin(originInput)
            _ = try secretStore.replaceWithNewSecret().base64URLEncodedStringForHearth()
            let saved = ReminderBridgeRegistration(
                origin: origin,
                createRequestId: ReminderContractV1.makeIdentifier(prefix: "request"),
                exchangeRequestId: ReminderContractV1.makeIdentifier(prefix: "request"),
                deviceName: deviceName.isEmpty ? "iPhone" : deviceName,
                applicationVersion: applicationVersion.isEmpty ? "1.0" : applicationVersion,
                pairing: nil,
                session: nil
            )
            registration = saved
            registrationStore.save(saved)
            client = clientFactory.makeClient(origin: origin)
            await createOrRetryPairing()
        } catch {
            connectionState = .failure(message: error.localizedDescription)
        }
    }

    func retryConnection() async {
        guard registration != nil else {
            await startPairing()
            return
        }
        if registration?.session != nil {
            await refreshCurrentSession()
        } else {
            await resumePairing()
        }
    }

    func checkApproval() async {
        guard let pairing = registration?.pairing, let client else {
            await resumePairing()
            return
        }
        do {
            let updated = try await client.pairingStatus(id: pairing.id)
            guard updated.isValidV1Pairing,
                  updated.id == pairing.id,
                  updated.requestId == pairing.requestId else {
                throw ReminderSnapshotClientError.responseDecodingFailed
            }
            updatePairing(updated)
            await handlePairingStatus(updated)
        } catch {
            handleConnectionError(error)
        }
    }

    func refreshCurrentSession() async {
        guard let client else {
            connectionState = .notPaired
            return
        }
        connectionState = .checking
        do {
            let session = try await client.currentSession()
            try accept(session: session)
            scheduleUploadIfPossible()
        } catch {
            handleConnectionError(error)
        }
    }

    func resumeOnForeground() async {
        guard hasStarted, registration != nil else { return }
        if registration?.session != nil {
            await refreshCurrentSession()
        } else {
            await resumePairing()
        }
    }

    func refreshAndUpload() async {
        guard case .paired = connectionState else { return }
        await snapshotRefresher?.refreshForBridge()
    }

    func retryUpload() {
        guard uploadTask == nil else { return }
        if let pendingUpload {
            beginUpload(pendingUpload)
        } else {
            scheduleUploadIfPossible()
        }
    }

    func clearInvalidPairing() {
        pairingPollTask?.cancel()
        uploadTask?.cancel()
        do {
            try secretStore.deleteSecret()
        } catch {
            connectionState = .failure(message: error.localizedDescription)
            return
        }
        registrationStore.clear()
        registration = nil
        client = nil
        pendingUpload = nil
        uploadState = .idle
        connectionState = .notPaired
    }

    func changeUnpairedOrigin() {
        guard canChangeUnpairedOrigin else { return }
        clearInvalidPairing()
    }

    func reminderSnapshotDidChange(_ snapshot: ReminderSnapshot) {
        latestSnapshot = snapshot
        latestSnapshotRevision += 1
        scheduleUploadIfPossible()
    }

    private func resumePairing() async {
        guard let pairing = registration?.pairing else {
            await createOrRetryPairing()
            return
        }
        await handlePairingStatus(pairing)
        if pairing.status == .pending {
            await checkApproval()
        }
    }

    private func createOrRetryPairing() async {
        guard let registration, let client else {
            connectionState = .notPaired
            return
        }
        connectionState = .creatingPairing
        do {
            guard let secret = try secretStore.encodedSecret() else {
                throw ReminderSnapshotClientError.missingSourceSecret
            }
            let request = CreateReminderSourcePairingRequest(
                requestId: registration.createRequestId,
                deviceName: registration.deviceName,
                platform: "ios",
                applicationVersion: registration.applicationVersion,
                pairingSecret: secret
            )
            let pairing = try await client.createPairing(request)
            guard pairing.isValidV1Pairing,
                  pairing.requestId == request.requestId,
                  pairing.deviceName == request.deviceName,
                  pairing.platform == request.platform,
                  pairing.applicationVersion == request.applicationVersion else {
                throw ReminderSnapshotClientError.responseDecodingFailed
            }
            updatePairing(pairing)
            await handlePairingStatus(pairing)
        } catch {
            handleConnectionError(error)
        }
    }

    private func handlePairingStatus(_ pairing: ReminderSourcePairingRequest) async {
        switch pairing.status {
        case .pending:
            connectionState = .waitingForApproval(pairing)
            schedulePairingPoll(before: pairing.expiresAt)
        case .approved, .exchanged:
            await exchange(pairing)
        case .expired:
            connectionState = .needsPairing(
                message: "That pairing code expired. Start again to create a fresh ten-minute code."
            )
        case .cancelled:
            connectionState = .needsPairing(
                message: "That pairing request was cancelled. Start again when you are ready."
            )
        }
    }

    private func exchange(_ pairing: ReminderSourcePairingRequest) async {
        guard let registration, let client else { return }
        pairingPollTask?.cancel()
        connectionState = .exchanging(pairing)
        do {
            guard let secret = try secretStore.encodedSecret() else {
                throw ReminderSnapshotClientError.missingSourceSecret
            }
            let request = ExchangeReminderSourcePairingRequest(
                requestId: registration.exchangeRequestId,
                pairingSecret: secret
            )
            let session = try await client.exchange(id: pairing.id, request: request)
            try accept(session: session)
            scheduleUploadIfPossible()
        } catch {
            handleConnectionError(error)
        }
    }

    private func accept(session: ReminderSourceDeviceSession) throws {
        guard session.isValidV1SourceSession else {
            throw ReminderSnapshotClientError.responseDecodingFailed
        }
        if let existingSourceID = registration?.session?.sourceId,
           existingSourceID != session.sourceId {
            throw ReminderSnapshotClientError.responseDecodingFailed
        }
        registration?.session = session
        if let registration {
            registrationStore.save(registration)
        }
        connectionState = .paired(session)
        if latestSnapshot == nil {
            uploadState = .waitingForReminderRead
        }
    }

    private func updatePairing(_ pairing: ReminderSourcePairingRequest) {
        registration?.pairing = pairing
        if let registration {
            registrationStore.save(registration)
        }
    }

    private func schedulePairingPoll(before expiry: Date) {
        guard automaticPolling, Date() < expiry else { return }
        pairingPollTask?.cancel()
        pairingPollTask = Task { [weak self] in
            do {
                try await Task.sleep(nanoseconds: 2_000_000_000)
                guard !Task.isCancelled else { return }
                await self?.checkApproval()
            } catch {
                return
            }
        }
    }

    private func scheduleUploadIfPossible() {
        guard uploadTask == nil,
              pendingUpload == nil,
              let snapshot = latestSnapshot,
              latestSnapshotRevision > lastUploadedRevision,
              case .paired(let session) = connectionState else { return }

        do {
            let request = try wireAdapter.makeRequest(
                from: snapshot,
                sequence: session.nextSnapshotSequence
            )
            let pending = PendingUpload(
                revision: latestSnapshotRevision,
                sourceID: session.sourceId,
                request: request
            )
            pendingUpload = pending
            beginUpload(pending)
        } catch {
            uploadState = .failure(message: error.localizedDescription)
        }
    }

    private func beginUpload(_ pending: PendingUpload) {
        guard uploadTask == nil else { return }
        uploadTask = Task { [weak self] in
            await self?.performUpload(pending)
        }
    }

    private func performUpload(_ pending: PendingUpload) async {
        defer {
            uploadTask = nil
            if pendingUpload == nil {
                scheduleUploadIfPossible()
            }
        }
        guard let client else { return }

        var retryIndex = 0
        while !Task.isCancelled {
            uploadState = .uploading(sequence: pending.request.sequence)
            do {
                let receipt = try await client.replaceSnapshot(
                    sourceID: pending.sourceID,
                    request: pending.request
                )
                try accept(receipt: receipt, pending: pending)
                pendingUpload = nil
                lastUploadedRevision = max(lastUploadedRevision, pending.revision)
                uploadState = .success(receipt)
                return
            } catch is CancellationError {
                return
            } catch let error as ReminderSnapshotClientError {
                if error.code == "STALE_SNAPSHOT" {
                    pendingUpload = nil
                    await reconcileStaleSnapshot()
                    return
                }
                if error.code == "UNAUTHENTICATED" || error.code == "NOT_FOUND" {
                    pendingUpload = nil
                    handleConnectionError(error)
                    return
                }
                if error.isTemporary, retryIndex < retryDelaysNanoseconds.count {
                    let baseDelay = retryDelaysNanoseconds[retryIndex]
                    retryIndex += 1
                    let jitteredDelay = jitter(baseDelay)
                    uploadState = .retrying(
                        sequence: pending.request.sequence,
                        delaySeconds: Int((jitteredDelay + 999_999_999) / 1_000_000_000)
                    )
                    do {
                        try await Task.sleep(nanoseconds: jitteredDelay)
                    } catch {
                        return
                    }
                    continue
                }
                uploadState = .failure(message: error.localizedDescription)
                return
            } catch {
                uploadState = .failure(message: error.localizedDescription)
                return
            }
        }
    }

    private func accept(receipt: ReminderSnapshotReceipt, pending: PendingUpload) throws {
        guard receipt.contractVersion == ReminderContractV1.version,
              receipt.sourceId == pending.sourceID,
              receipt.snapshotId == pending.request.snapshotId,
              receipt.sequence == pending.request.sequence,
              receipt.nextSnapshotSequence > receipt.sequence,
              var session = registration?.session else {
            throw ReminderSnapshotClientError.responseDecodingFailed
        }
        session = ReminderSourceDeviceSession(
            contractVersion: session.contractVersion,
            householdId: session.householdId,
            deviceId: session.deviceId,
            sourceId: session.sourceId,
            scopes: session.scopes,
            pairedAt: session.pairedAt,
            nextSnapshotSequence: receipt.nextSnapshotSequence
        )
        registration?.session = session
        if let registration {
            registrationStore.save(registration)
        }
        connectionState = .paired(session)
    }

    private func reconcileStaleSnapshot() async {
        guard let client else { return }
        uploadState = .waitingForReminderRead
        do {
            let session = try await client.currentSession()
            try accept(session: session)
            await snapshotRefresher?.refreshForBridge()
        } catch {
            handleConnectionError(error)
        }
    }

    private func handleConnectionError(_ error: Error) {
        pairingPollTask?.cancel()
        if let clientError = error as? ReminderSnapshotClientError,
           (clientError.code == "UNAUTHENTICATED" || clientError.code == "NOT_FOUND") {
            uploadTask?.cancel()
            pendingUpload = nil
            uploadState = .idle
            connectionState = .needsPairing(
                message: "This Reminders source is no longer authorised by Hearth. Confirm the source is revoked, then pair this iPhone again."
            )
            return
        }
        connectionState = .failure(message: error.localizedDescription)
    }

    private func jitter(_ delay: UInt64) -> UInt64 {
        guard delay > 0 else { return 0 }
        return UInt64(Double(delay) * Double.random(in: 0.85...1.15))
    }

    private static func boundedNonempty(
        _ input: String,
        maximumUTF16Length: Int,
        fallback: String
    ) -> String {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return fallback }
        var result = ""
        for character in trimmed {
            let candidate = result + String(character)
            guard candidate.utf16.count <= maximumUTF16Length else { break }
            result = candidate
        }
        return result.isEmpty ? fallback : result
    }
}

private extension Data {
    func base64URLEncodedStringForHearth() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
