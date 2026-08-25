import Foundation
import Security

enum ReminderContractV1 {
    static let version = 1
    static let maximumLists = 50
    static let maximumReminders = 1_000
    static let maximumJSONBytes = 1_500_000

    static func makeIdentifier(prefix: String) -> String {
        let random = UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "")
        return "\(prefix)_\(random)"
    }

    static func isOpaqueIdentifier(_ value: String) -> Bool {
        guard (3...96).contains(value.utf16.count),
              let first = value.unicodeScalars.first,
              (97...122).contains(first.value) else { return false }
        return value.unicodeScalars.dropFirst().allSatisfy { scalar in
            (97...122).contains(scalar.value)
                || (48...57).contains(scalar.value)
                || scalar.value == 95
                || scalar.value == 45
        }
    }
}

enum ReminderContractJSON {
    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            guard let date = parseDate(value) else {
                throw DecodingError.dataCorruptedError(
                    in: container,
                    debugDescription: "Expected an ISO 8601 timestamp with an explicit offset."
                )
            }
            return date
        }
        return decoder
    }

    static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(formatDate(date))
        }
        return encoder
    }

    private static func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) {
            return date
        }
        let wholeSeconds = ISO8601DateFormatter()
        wholeSeconds.formatOptions = [.withInternetDateTime]
        return wholeSeconds.date(from: value)
    }

    private static func formatDate(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}

enum ReminderSourcePairingStatus: String, Codable, Equatable, Sendable {
    case pending
    case approved
    case exchanged
    case expired
    case cancelled
}

struct CreateReminderSourcePairingRequest: Codable, Equatable, Sendable {
    let requestId: String
    let deviceName: String
    let platform: String
    let applicationVersion: String
    let pairingSecret: String
}

struct ReminderSourcePairingRequest: Codable, Equatable, Sendable {
    let id: String
    let requestId: String
    let code: String
    let deviceName: String
    let platform: String
    let applicationVersion: String
    let status: ReminderSourcePairingStatus
    let expiresAt: Date

    var isValidV1Pairing: Bool {
        ReminderContractV1.isOpaqueIdentifier(id)
            && ReminderContractV1.isOpaqueIdentifier(requestId)
            && code.utf16.count == 6
            && code.unicodeScalars.allSatisfy {
                (65...90).contains($0.value) || (48...57).contains($0.value)
            }
            && !deviceName.isEmpty
            && deviceName.utf16.count <= 80
            && platform == "ios"
            && !applicationVersion.isEmpty
            && applicationVersion.utf16.count <= 40
    }
}

struct ExchangeReminderSourcePairingRequest: Codable, Equatable, Sendable {
    let requestId: String
    let pairingSecret: String
}

enum ReminderSourceScope: String, Codable, Equatable, Sendable {
    case snapshotWrite = "reminders.snapshot.write"
}

struct ReminderSourceDeviceSession: Codable, Equatable, Sendable {
    let contractVersion: Int
    let householdId: String
    let deviceId: String
    let sourceId: String
    let scopes: [ReminderSourceScope]
    let pairedAt: Date
    let nextSnapshotSequence: Int

    var isValidV1SourceSession: Bool {
        contractVersion == ReminderContractV1.version
            && ReminderContractV1.isOpaqueIdentifier(householdId)
            && ReminderContractV1.isOpaqueIdentifier(deviceId)
            && ReminderContractV1.isOpaqueIdentifier(sourceId)
            && scopes == [.snapshotWrite]
            && nextSnapshotSequence > 0
    }
}

struct ReminderSnapshotListInput: Codable, Equatable, Sendable {
    let sourceListId: String
    let title: String
}

struct ReminderSnapshotItemInput: Codable, Equatable, Sendable {
    let sourceReminderId: String
    let sourceListId: String
    let title: String
    let dueLocalDate: String?
    let dueAt: Date?
    let hasDueTime: Bool
    let isCompleted: Bool
    let completedAt: Date?
    let sourceUpdatedAt: Date?
}

struct ReplaceReminderSnapshotRequest: Codable, Equatable, Sendable {
    let requestId: String
    let contractVersion: Int
    let snapshotId: String
    let sequence: Int
    let generatedAt: Date
    let lists: [ReminderSnapshotListInput]
    let reminders: [ReminderSnapshotItemInput]
}

struct ReminderSnapshotReceipt: Codable, Equatable, Sendable {
    let contractVersion: Int
    let sourceId: String
    let snapshotId: String
    let sequence: Int
    let generatedAt: Date
    let acceptedAt: Date
    let listCount: Int
    let reminderCount: Int
    let incompleteCount: Int
    let nextSnapshotSequence: Int
    let replayed: Bool
}

struct ReminderAPIErrorEnvelope: Codable, Equatable, Sendable {
    struct Detail: Codable, Equatable, Sendable {
        let code: String
        let message: String
        let retryable: Bool
        let requestId: String?
    }

    let error: Detail
}

enum HearthServerOriginError: LocalizedError, Equatable, Sendable {
    case invalid

    var errorDescription: String? {
        "Enter the trusted HTTPS address for your private Hearth server."
    }
}

struct HearthServerOrigin: Codable, Equatable, Hashable, Sendable {
    let url: URL

    init(_ input: String) throws {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed),
              components.scheme?.lowercased() == "https",
              components.host?.isEmpty == false,
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil,
              components.path.isEmpty || components.path == "/" else {
            throw HearthServerOriginError.invalid
        }
        components.scheme = "https"
        components.path = ""
        guard let normalized = components.url else {
            throw HearthServerOriginError.invalid
        }
        url = normalized
    }

    var displayString: String {
        url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        try self.init(container.decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(displayString)
    }
}

enum ReminderSourceSecretStoreError: LocalizedError, Equatable, Sendable {
    case randomGenerationFailed(Int32)
    case keychainFailure(Int32)
    case invalidSecretLength

    var errorDescription: String? {
        switch self {
        case .randomGenerationFailed:
            "Hearth could not create a secure pairing secret."
        case .keychainFailure:
            "Hearth could not access its protected pairing secret in Keychain."
        case .invalidSecretLength:
            "The saved Hearth pairing secret is invalid. Pair this iPhone again."
        }
    }
}

protocol ReminderSourceSecretStore: Sendable {
    func loadSecret() throws -> Data?
    func replaceWithNewSecret() throws -> Data
    func deleteSecret() throws
}

extension ReminderSourceSecretStore {
    func encodedSecret() throws -> String? {
        guard let data = try loadSecret() else { return nil }
        guard data.count == 32 else { throw ReminderSourceSecretStoreError.invalidSecretLength }
        return data.base64URLEncodedString()
    }
}

final class KeychainReminderSourceSecretStore: ReminderSourceSecretStore, @unchecked Sendable {
    private let service: String
    private let account: String

    init(
        service: String = "app.hearth.companion.reminder-source",
        account: String = "snapshot-secret-v1"
    ) {
        self.service = service
        self.account = account
    }

    func loadSecret() throws -> Data? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw ReminderSourceSecretStoreError.keychainFailure(status)
        }
        return data
    }

    func replaceWithNewSecret() throws -> Data {
        var data = Data(count: 32)
        let status = data.withUnsafeMutableBytes { bytes in
            guard let address = bytes.baseAddress else { return errSecParam }
            return SecRandomCopyBytes(kSecRandomDefault, bytes.count, address)
        }
        guard status == errSecSuccess else {
            throw ReminderSourceSecretStoreError.randomGenerationFailed(status)
        }

        let updateStatus = SecItemUpdate(
            baseQuery as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if updateStatus == errSecItemNotFound {
            var insert = baseQuery
            insert[kSecValueData as String] = data
            insert[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            insert[kSecAttrSynchronizable as String] = false
            let insertStatus = SecItemAdd(insert as CFDictionary, nil)
            guard insertStatus == errSecSuccess else {
                throw ReminderSourceSecretStoreError.keychainFailure(insertStatus)
            }
        } else if updateStatus != errSecSuccess {
            throw ReminderSourceSecretStoreError.keychainFailure(updateStatus)
        }
        return data
    }

    func deleteSecret() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw ReminderSourceSecretStoreError.keychainFailure(status)
        }
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: false
        ]
    }
}

final class InMemoryReminderSourceSecretStore: ReminderSourceSecretStore, @unchecked Sendable {
    private let lock = NSLock()
    private var secret: Data?

    init(secret: Data? = nil) {
        self.secret = secret
    }

    func loadSecret() throws -> Data? {
        lock.withLock { secret }
    }

    func replaceWithNewSecret() throws -> Data {
        let data = Data(repeating: 0x41, count: 32)
        lock.withLock { secret = data }
        return data
    }

    func deleteSecret() throws {
        lock.withLock { secret = nil }
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

struct ReminderBridgeRegistration: Codable, Equatable, Sendable {
    let origin: HearthServerOrigin
    let createRequestId: String
    let exchangeRequestId: String
    let deviceName: String
    let applicationVersion: String
    var pairing: ReminderSourcePairingRequest?
    var session: ReminderSourceDeviceSession?
}

@MainActor
protocol ReminderBridgeRegistrationStore: AnyObject {
    func load() -> ReminderBridgeRegistration?
    func save(_ registration: ReminderBridgeRegistration)
    func clear()
}

@MainActor
final class UserDefaultsReminderBridgeRegistrationStore: ReminderBridgeRegistrationStore {
    static let defaultKey = "reminders.bridge.registration.v1"

    private let defaults: UserDefaults
    private let key: String

    init(defaults: UserDefaults = .standard, key: String = defaultKey) {
        self.defaults = defaults
        self.key = key
    }

    func load() -> ReminderBridgeRegistration? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? ReminderContractJSON.decoder().decode(ReminderBridgeRegistration.self, from: data)
    }

    func save(_ registration: ReminderBridgeRegistration) {
        guard let data = try? ReminderContractJSON.encoder().encode(registration) else { return }
        defaults.set(data, forKey: key)
    }

    func clear() {
        defaults.removeObject(forKey: key)
    }
}

@MainActor
final class InMemoryReminderBridgeRegistrationStore: ReminderBridgeRegistrationStore {
    private(set) var registration: ReminderBridgeRegistration?

    init(registration: ReminderBridgeRegistration? = nil) {
        self.registration = registration
    }

    func load() -> ReminderBridgeRegistration? { registration }
    func save(_ registration: ReminderBridgeRegistration) { self.registration = registration }
    func clear() { registration = nil }
}

enum ReminderSnapshotMappingError: LocalizedError, Equatable, Sendable {
    case tooManyLists
    case tooManyReminders
    case payloadTooLarge
    case invalidExternalIdentifier
    case duplicateExternalIdentifier
    case invalidTitle
    case invalidDueDate
    case missingList

    var errorDescription: String? {
        switch self {
        case .tooManyLists:
            "The selected snapshot contains more than 50 lists. Choose fewer lists."
        case .tooManyReminders:
            "The selected snapshot contains more than 1,000 reminders. Choose fewer lists."
        case .payloadTooLarge:
            "The selected snapshot is larger than Hearth's 1.5 MB limit. Choose fewer lists."
        case .invalidExternalIdentifier, .duplicateExternalIdentifier:
            "Apple Reminders returned an identifier that cannot be sent safely."
        case .invalidTitle:
            "One selected list or reminder has a title longer than Hearth can safely display."
        case .invalidDueDate:
            "One selected reminder has an inconsistent due date."
        case .missingList:
            "One selected reminder no longer belongs to an available selected list. Refresh and try again."
        }
    }
}

struct EventKitReminderSnapshotWireAdapter: Sendable {
    func makeRequest(
        from snapshot: ReminderSnapshot,
        sequence: Int,
        requestId: String = ReminderContractV1.makeIdentifier(prefix: "request"),
        snapshotId: String = ReminderContractV1.makeIdentifier(prefix: "snapshot")
    ) throws -> ReplaceReminderSnapshotRequest {
        let selectedLists = snapshot.lists
            .filter { snapshot.selectedListIDs.contains($0.id) }
            .sorted { $0.id < $1.id }
        guard selectedLists.count <= ReminderContractV1.maximumLists else {
            throw ReminderSnapshotMappingError.tooManyLists
        }

        var seenListIDs = Set<String>()
        let lists = try selectedLists.map { list in
            try validateExternalIdentifier(list.id)
            guard seenListIDs.insert(list.id).inserted else {
                throw ReminderSnapshotMappingError.duplicateExternalIdentifier
            }
            return ReminderSnapshotListInput(
                sourceListId: list.id,
                title: try normalizedTitle(list.title, maximumLength: 120, fallback: "Reminders")
            )
        }

        let remindersToMap = snapshot.reminders
            .filter { snapshot.selectedListIDs.contains($0.listID) }
            .sorted { $0.id < $1.id }
        guard remindersToMap.count <= ReminderContractV1.maximumReminders else {
            throw ReminderSnapshotMappingError.tooManyReminders
        }

        var seenReminderIDs = Set<String>()
        let reminders = try remindersToMap.map { reminder in
            try validateExternalIdentifier(reminder.id)
            try validateExternalIdentifier(reminder.listID)
            guard seenReminderIDs.insert(reminder.id).inserted else {
                throw ReminderSnapshotMappingError.duplicateExternalIdentifier
            }
            guard seenListIDs.contains(reminder.listID) else {
                throw ReminderSnapshotMappingError.missingList
            }
            try validateDueFields(reminder)
            return ReminderSnapshotItemInput(
                sourceReminderId: reminder.id,
                sourceListId: reminder.listID,
                title: try normalizedTitle(reminder.title, maximumLength: 240, fallback: "Untitled reminder"),
                dueLocalDate: reminder.dueLocalDate,
                dueAt: reminder.hasDueTime ? reminder.dueDate : nil,
                hasDueTime: reminder.hasDueTime,
                isCompleted: reminder.isCompleted,
                completedAt: reminder.isCompleted ? reminder.completedAt : nil,
                sourceUpdatedAt: reminder.sourceUpdatedAt
            )
        }

        let request = ReplaceReminderSnapshotRequest(
            requestId: requestId,
            contractVersion: ReminderContractV1.version,
            snapshotId: snapshotId,
            sequence: sequence,
            generatedAt: snapshot.updatedAt,
            lists: lists,
            reminders: reminders
        )
        let payloadSize = try ReminderContractJSON.encoder().encode(request).count
        guard payloadSize <= ReminderContractV1.maximumJSONBytes else {
            throw ReminderSnapshotMappingError.payloadTooLarge
        }
        return request
    }

    private func validateExternalIdentifier(_ value: String) throws {
        guard !value.isEmpty, value.utf16.count <= 255,
              value.unicodeScalars.allSatisfy({ $0.value > 0x1f && $0.value != 0x7f }) else {
            throw ReminderSnapshotMappingError.invalidExternalIdentifier
        }
    }

    private func normalizedTitle(_ value: String, maximumLength: Int, fallback: String) throws -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.utf16.count <= maximumLength else {
            throw ReminderSnapshotMappingError.invalidTitle
        }
        return trimmed.isEmpty ? fallback : trimmed
    }

    private func validateDueFields(_ reminder: HearthReminder) throws {
        if reminder.hasDueTime {
            guard reminder.dueLocalDate != nil, reminder.dueDate != nil else {
                throw ReminderSnapshotMappingError.invalidDueDate
            }
        } else if reminder.dueLocalDate == nil, reminder.dueDate != nil {
            throw ReminderSnapshotMappingError.invalidDueDate
        }
        if let dueLocalDate = reminder.dueLocalDate, !Self.isLocalDate(dueLocalDate) {
            throw ReminderSnapshotMappingError.invalidDueDate
        }
    }

    private static func isLocalDate(_ value: String) -> Bool {
        guard value.count == 10 else { return false }
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts[0].count == 4,
              parts[1].count == 2,
              parts[2].count == 2,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2]) else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let requested = DateComponents(year: year, month: month, day: day)
        guard let date = calendar.date(from: requested) else { return false }
        let resolved = calendar.dateComponents([.year, .month, .day], from: date)
        return resolved.year == year && resolved.month == month && resolved.day == day
    }
}

@MainActor
protocol ReminderSnapshotConsumer: AnyObject {
    func reminderSnapshotDidChange(_ snapshot: ReminderSnapshot)
}
