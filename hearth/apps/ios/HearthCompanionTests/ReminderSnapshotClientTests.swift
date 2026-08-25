import Foundation
import Testing
@testable import HearthCompanion

@Suite("Reminder snapshot URL transport", .serialized)
struct ReminderSnapshotClientTests {
    @Test("source session uses the distinct HearthReminderSource authorization scheme")
    func sourceAuthorizationHeader() async throws {
        let session = makeURLSession()
        let secretStore = InMemoryReminderSourceSecretStore(secret: Data(repeating: 0, count: 32))
        let client = URLSessionReminderSnapshotClient(
            origin: try HearthServerOrigin("https://hearth.example"),
            secretStore: secretStore,
            session: session
        )
        StubURLProtocol.handler = { request in
            #expect(request.url?.path == "/api/v1/reminder-source-sessions/current")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "HearthReminderSource AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
            #expect(request.value(forHTTPHeaderField: "Authorization")?.hasPrefix("Bearer ") == false)
            return (200, try ReminderContractJSON.encoder().encode(Self.deviceSession(sequence: 4)))
        }

        let sourceSession = try await client.currentSession()
        #expect(sourceSession.nextSnapshotSequence == 4)
    }

    @Test("pairing creation is unauthenticated and uses the frozen JSON body")
    func pairingCreateRequest() async throws {
        let session = makeURLSession()
        let client = URLSessionReminderSnapshotClient(
            origin: try HearthServerOrigin("https://hearth.example"),
            secretStore: InMemoryReminderSourceSecretStore(),
            session: session
        )
        let request = CreateReminderSourcePairingRequest(
            requestId: "request_pairing_transport",
            deviceName: "Test iPhone",
            platform: "ios",
            applicationVersion: "1.0",
            pairingSecret: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        )
        StubURLProtocol.handler = { urlRequest in
            #expect(urlRequest.value(forHTTPHeaderField: "Authorization") == nil)
            #expect(urlRequest.httpMethod == "POST")
            let decoded = try ReminderContractJSON.decoder().decode(
                CreateReminderSourcePairingRequest.self,
                from: try Self.bodyData(from: urlRequest)
            )
            #expect(decoded == request)
            let response = ReminderSourcePairingRequest(
                id: "pairing_transport",
                requestId: request.requestId,
                code: "A1B2C3",
                deviceName: request.deviceName,
                platform: "ios",
                applicationVersion: request.applicationVersion,
                status: .pending,
                expiresAt: Date(timeIntervalSince1970: 1_787_624_600)
            )
            return (200, try ReminderContractJSON.encoder().encode(response))
        }

        let pairing = try await client.createPairing(request)
        #expect(pairing.code == "A1B2C3")
    }

    @Test("stable API errors retain code and retryability without exposing response bodies")
    func apiErrorMapping() async throws {
        let session = makeURLSession()
        let client = URLSessionReminderSnapshotClient(
            origin: try HearthServerOrigin("https://hearth.example"),
            secretStore: InMemoryReminderSourceSecretStore(secret: Data(repeating: 0, count: 32)),
            session: session
        )
        StubURLProtocol.handler = { _ in
            let envelope = ReminderAPIErrorEnvelope(
                error: .init(
                    code: "STALE_SNAPSHOT",
                    message: "A later snapshot already won.",
                    retryable: false,
                    requestId: nil
                )
            )
            return (409, try ReminderContractJSON.encoder().encode(envelope))
        }

        do {
            _ = try await client.currentSession()
            Issue.record("Expected the API error")
        } catch let error as ReminderSnapshotClientError {
            #expect(error.code == "STALE_SNAPSHOT")
            #expect(error.isTemporary == false)
            #expect(error.localizedDescription == "A later snapshot already won.")
        }
    }

    private func makeURLSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    private static func deviceSession(sequence: Int) -> ReminderSourceDeviceSession {
        ReminderSourceDeviceSession(
            contractVersion: 1,
            householdId: "household_test",
            deviceId: "reminder_device_test",
            sourceId: "reminder_source_test",
            scopes: [.snapshotWrite],
            pairedAt: Date(timeIntervalSince1970: 1_787_624_000),
            nextSnapshotSequence: sequence
        )
    }

    private static func bodyData(from request: URLRequest) throws -> Data {
        if let body = request.httpBody { return body }
        let stream = try #require(request.httpBodyStream)
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4_096)
        while true {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count > 0 {
                data.append(buffer, count: count)
            } else if count == 0 {
                return data
            } else {
                throw stream.streamError ?? URLError(.cannotDecodeContentData)
            }
        }
    }
}

private final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (Int, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let (status, data) = try handler(request)
            let response = HTTPURLResponse(
                url: try #require(request.url),
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
            )!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
