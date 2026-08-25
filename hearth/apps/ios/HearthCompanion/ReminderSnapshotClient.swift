import Foundation

protocol ReminderSnapshotClient: Sendable {
    func createPairing(_ request: CreateReminderSourcePairingRequest) async throws
        -> ReminderSourcePairingRequest
    func pairingStatus(id: String) async throws -> ReminderSourcePairingRequest
    func exchange(id: String, request: ExchangeReminderSourcePairingRequest) async throws
        -> ReminderSourceDeviceSession
    func currentSession() async throws -> ReminderSourceDeviceSession
    func replaceSnapshot(sourceID: String, request: ReplaceReminderSnapshotRequest) async throws
        -> ReminderSnapshotReceipt
}

protocol ReminderSnapshotClientFactory: Sendable {
    func makeClient(origin: HearthServerOrigin) -> any ReminderSnapshotClient
}

enum ReminderSnapshotClientError: LocalizedError, Equatable, Sendable {
    case missingSourceSecret
    case invalidResponse
    case transport(URLError.Code)
    case api(status: Int, code: String, message: String, retryable: Bool)
    case requestEncodingFailed
    case responseDecodingFailed

    var errorDescription: String? {
        switch self {
        case .missingSourceSecret:
            "The protected Hearth source secret is missing. Pair this iPhone again."
        case .invalidResponse:
            "Hearth returned an invalid network response."
        case .transport(let code):
            switch code {
            case .notConnectedToInternet, .networkConnectionLost:
                "This iPhone cannot currently reach Hearth. The last safe Hearth snapshot remains unchanged."
            case .timedOut:
                "Hearth did not respond in time. The exact snapshot will be retried while the app is open."
            default:
                "This iPhone could not reach Hearth. The last safe Hearth snapshot remains unchanged."
            }
        case .api(_, _, let message, _):
            message
        case .requestEncodingFailed:
            "Hearth could not prepare the reminder snapshot safely."
        case .responseDecodingFailed:
            "Hearth returned data that does not match the frozen Reminders contract."
        }
    }

    var code: String? {
        if case .api(_, let code, _, _) = self { return code }
        return nil
    }

    var isTemporary: Bool {
        switch self {
        case .transport:
            true
        case .api(let status, _, _, let retryable):
            retryable || status == 503
        default:
            false
        }
    }
}

struct URLSessionReminderSnapshotClientFactory: ReminderSnapshotClientFactory {
    let secretStore: any ReminderSourceSecretStore
    let session: URLSession

    init(
        secretStore: any ReminderSourceSecretStore,
        session: URLSession = ReminderSourceTransportSession.make()
    ) {
        self.secretStore = secretStore
        self.session = session
    }

    func makeClient(origin: HearthServerOrigin) -> any ReminderSnapshotClient {
        URLSessionReminderSnapshotClient(
            origin: origin,
            secretStore: secretStore,
            session: session
        )
    }
}

enum ReminderSourceTransportSession {
    static func make() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.waitsForConnectivity = true
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        return URLSession(
            configuration: configuration,
            delegate: ReminderSourceRedirectRejectingDelegate(),
            delegateQueue: nil
        )
    }
}

private final class ReminderSourceRedirectRejectingDelegate: NSObject,
    URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

final class URLSessionReminderSnapshotClient: ReminderSnapshotClient, @unchecked Sendable {
    private let origin: HearthServerOrigin
    private let secretStore: any ReminderSourceSecretStore
    private let session: URLSession

    init(
        origin: HearthServerOrigin,
        secretStore: any ReminderSourceSecretStore,
        session: URLSession = ReminderSourceTransportSession.make()
    ) {
        self.origin = origin
        self.secretStore = secretStore
        self.session = session
    }

    func createPairing(_ request: CreateReminderSourcePairingRequest) async throws
        -> ReminderSourcePairingRequest {
        try await send(
            method: "POST",
            path: ["api", "v1", "reminder-source-pairing-requests"],
            body: request,
            authorized: false
        )
    }

    func pairingStatus(id: String) async throws -> ReminderSourcePairingRequest {
        try await send(
            method: "GET",
            path: ["api", "v1", "reminder-source-pairing-requests", id],
            authorized: false
        )
    }

    func exchange(
        id: String,
        request: ExchangeReminderSourcePairingRequest
    ) async throws -> ReminderSourceDeviceSession {
        try await send(
            method: "POST",
            path: ["api", "v1", "reminder-source-pairing-requests", id, "exchanges"],
            body: request,
            authorized: false
        )
    }

    func currentSession() async throws -> ReminderSourceDeviceSession {
        try await send(
            method: "GET",
            path: ["api", "v1", "reminder-source-sessions", "current"],
            authorized: true
        )
    }

    func replaceSnapshot(
        sourceID: String,
        request: ReplaceReminderSnapshotRequest
    ) async throws -> ReminderSnapshotReceipt {
        try await send(
            method: "PUT",
            path: ["api", "v1", "reminder-sources", sourceID, "snapshots", "current"],
            body: request,
            authorized: true
        )
    }

    private func send<Response: Decodable>(
        method: String,
        path: [String],
        authorized: Bool
    ) async throws -> Response {
        try await perform(method: method, path: path, body: nil, authorized: authorized)
    }

    private func send<Response: Decodable, Body: Encodable>(
        method: String,
        path: [String],
        body: Body,
        authorized: Bool
    ) async throws -> Response {
        let data: Data
        do {
            data = try ReminderContractJSON.encoder().encode(body)
        } catch {
            throw ReminderSnapshotClientError.requestEncodingFailed
        }
        return try await perform(method: method, path: path, body: data, authorized: authorized)
    }

    private func perform<Response: Decodable>(
        method: String,
        path: [String],
        body: Data?,
        authorized: Bool
    ) async throws -> Response {
        var url = origin.url
        for component in path {
            url.append(path: component)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authorized {
            guard let secret = try secretStore.encodedSecret() else {
                throw ReminderSnapshotClientError.missingSourceSecret
            }
            request.setValue("HearthReminderSource \(secret)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            throw ReminderSnapshotClientError.transport(error.code)
        } catch {
            throw ReminderSnapshotClientError.transport(.unknown)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ReminderSnapshotClientError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            if let envelope = try? ReminderContractJSON.decoder().decode(
                ReminderAPIErrorEnvelope.self,
                from: data
            ) {
                throw ReminderSnapshotClientError.api(
                    status: httpResponse.statusCode,
                    code: envelope.error.code,
                    message: envelope.error.message,
                    retryable: envelope.error.retryable
                )
            }
            throw ReminderSnapshotClientError.api(
                status: httpResponse.statusCode,
                code: "HTTP_\(httpResponse.statusCode)",
                message: "Hearth could not accept that request.",
                retryable: httpResponse.statusCode >= 500
            )
        }

        do {
            return try ReminderContractJSON.decoder().decode(Response.self, from: data)
        } catch {
            throw ReminderSnapshotClientError.responseDecodingFailed
        }
    }
}

struct FixedReminderSnapshotClientFactory: ReminderSnapshotClientFactory {
    let client: any ReminderSnapshotClient

    func makeClient(origin: HearthServerOrigin) -> any ReminderSnapshotClient {
        client
    }
}

actor PreviewReminderSnapshotClient: ReminderSnapshotClient {
    private let pairedAt = Date(timeIntervalSince1970: 1_787_624_000)
    private var nextSequence = 1
    private var pairingRequestID = "request_preview_pairing"
    private var deviceName = "Preview iPhone"
    private var applicationVersion = "1.0"

    func createPairing(_ request: CreateReminderSourcePairingRequest) async throws
        -> ReminderSourcePairingRequest {
        pairingRequestID = request.requestId
        deviceName = request.deviceName
        applicationVersion = request.applicationVersion
        return ReminderSourcePairingRequest(
            id: "pairing_preview",
            requestId: request.requestId,
            code: "A1B2C3",
            deviceName: request.deviceName,
            platform: "ios",
            applicationVersion: request.applicationVersion,
            status: .pending,
            expiresAt: Date().addingTimeInterval(600)
        )
    }

    func pairingStatus(id: String) async throws -> ReminderSourcePairingRequest {
        ReminderSourcePairingRequest(
            id: id,
            requestId: pairingRequestID,
            code: "A1B2C3",
            deviceName: deviceName,
            platform: "ios",
            applicationVersion: applicationVersion,
            status: .approved,
            expiresAt: Date().addingTimeInterval(600)
        )
    }

    func exchange(
        id: String,
        request: ExchangeReminderSourcePairingRequest
    ) async throws -> ReminderSourceDeviceSession {
        session()
    }

    func currentSession() async throws -> ReminderSourceDeviceSession {
        session()
    }

    func replaceSnapshot(
        sourceID: String,
        request: ReplaceReminderSnapshotRequest
    ) async throws -> ReminderSnapshotReceipt {
        nextSequence = request.sequence + 1
        return ReminderSnapshotReceipt(
            contractVersion: 1,
            sourceId: sourceID,
            snapshotId: request.snapshotId,
            sequence: request.sequence,
            generatedAt: request.generatedAt,
            acceptedAt: Date(),
            listCount: request.lists.count,
            reminderCount: request.reminders.count,
            incompleteCount: request.reminders.filter { !$0.isCompleted }.count,
            nextSnapshotSequence: nextSequence,
            replayed: false
        )
    }

    private func session() -> ReminderSourceDeviceSession {
        ReminderSourceDeviceSession(
            contractVersion: 1,
            householdId: "household_preview",
            deviceId: "reminder_device_preview",
            sourceId: "reminder_source_preview",
            scopes: [.snapshotWrite],
            pairedAt: pairedAt,
            nextSnapshotSequence: nextSequence
        )
    }
}
