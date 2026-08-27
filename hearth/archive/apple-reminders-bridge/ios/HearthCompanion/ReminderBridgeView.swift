import SwiftUI

struct ReminderBridgeView: View {
    let model: ReminderBridgeViewModel

    @State private var confirmsPairingReset = false
    @Environment(HearthTheme.self) private var theme

    var body: some View {
        Form {
            Section {
                Label("Read Apple Reminders. Share only the selected safe fields with your private Hearth.", systemImage: "lock.iphone")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .accessibilityElement(children: .combine)
            }

            connectionSection

            if case .paired = model.connectionState {
                uploadSection
            }

            Section("Privacy boundary") {
                Label("No Apple ID, iCloud password, calendar credential, reminder notes, URLs, alarms or attachments", systemImage: "hand.raised")
                Label("No reminder creation, editing, completion or deletion", systemImage: "checkmark.shield")
                Label("Foreground refresh only—no background sync or notifications", systemImage: "sun.max")
            }
            .font(.subheadline)
        }
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .navigationTitle("Hearth bridge")
        .task { await model.start() }
        .confirmationDialog(
            "Clear this invalid pairing?",
            isPresented: $confirmsPairingReset,
            titleVisibility: .visible
        ) {
            Button("Clear and pair again", role: .destructive) {
                model.clearInvalidPairing()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes the source secret from this iPhone. If the source was not already revoked in Hearth, an adult must revoke it before a new pairing can be approved.")
        }
    }

    @ViewBuilder
    private var connectionSection: some View {
        switch model.connectionState {
        case .notPaired:
            Section("Pair with Hearth") {
                Text("Enter the trusted HTTPS origin for your private Hearth server. iOS may ask for Local Network access when you connect; Hearth does not discover or expose the address publicly.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                TextField(
                    "https://hearth.example",
                    text: Binding(
                        get: { model.originInput },
                        set: { model.originInput = $0 }
                    )
                )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .accessibilityLabel("Private Hearth HTTPS address")
                    .accessibilityIdentifier("hearth-origin")
                Button {
                    Task { await model.startPairing() }
                } label: {
                    Label("Create pairing code", systemImage: "link.badge.plus")
                }
                .buttonStyle(.borderedProminent)
                .tint(theme.accent)
                .disabled(model.originInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityIdentifier("create-reminder-source-pairing")
            }

        case .checking:
            progressSection(title: "Checking Hearth connection…", detail: "The source credential remains protected in Keychain.")

        case .creatingPairing:
            progressSection(title: "Creating a pairing code…", detail: "Hearth will store only a SHA-256 digest of this iPhone’s new source secret.")

        case .waitingForApproval(let pairing):
            pairingCodeSection(pairing)

        case .exchanging:
            progressSection(title: "Finishing pairing…", detail: "Hearth is granting only reminders.snapshot.write to this iPhone source.")

        case .paired(let session):
            Section("Connection") {
                Label("Paired with private Hearth", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(theme.success)
                    .font(.headline)
                LabeledContent("Permission", value: "Reminders snapshot only")
                LabeledContent("Next snapshot", value: "\(session.nextSnapshotSequence)")
                Text("This source credential cannot sign in as an adult or television.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

        case .needsPairing(let message):
            Section("Pairing required") {
                Label("Hearth source disconnected", systemImage: "link.badge.plus")
                    .font(.headline)
                    .foregroundStyle(theme.warmAccent)
                Text(message)
                    .foregroundStyle(.secondary)
                Button("Clear invalid pairing…", role: .destructive) {
                    confirmsPairingReset = true
                }
                .accessibilityIdentifier("clear-invalid-reminder-source-pairing")
            }

        case .failure(let message):
            Section("Connection unavailable") {
                Label("Couldn’t reach Hearth", systemImage: "exclamationmark.triangle")
                    .font(.headline)
                    .foregroundStyle(theme.warmAccent)
                Text(message)
                    .foregroundStyle(.secondary)
                Text("If Local Network access was denied, enable Hearth Companion in Settings → Privacy & Security → Local Network, then try again.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button("Try again") {
                    Task { await model.retryConnection() }
                }
                .accessibilityIdentifier("retry-reminder-source-connection")
                if model.canChangeUnpairedOrigin {
                    Button("Use a different server address") {
                        model.changeUnpairedOrigin()
                    }
                    .accessibilityIdentifier("change-reminder-source-origin")
                }
            }
        }
    }

    @ViewBuilder
    private var uploadSection: some View {
        Section("Selected reminder snapshot") {
            switch model.uploadState {
            case .idle, .waitingForReminderRead:
                Label("Waiting for a successful Reminders read", systemImage: "checklist")
                    .foregroundStyle(.secondary)

            case .uploading(let sequence):
                HStack {
                    ProgressView()
                    Text("Sending full snapshot \(sequence)…")
                }
                .accessibilityElement(children: .combine)

            case .retrying(let sequence, let delaySeconds):
                Label(
                    "Snapshot \(sequence) will retry in about \(delaySeconds) seconds with the exact same payload.",
                    systemImage: "arrow.clockwise"
                )
                .foregroundStyle(theme.warmAccent)

            case .success(let receipt):
                Label("Snapshot accepted by Hearth", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(theme.success)
                LabeledContent("Accepted", value: receipt.acceptedAt.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("Lists", value: "\(receipt.listCount)")
                LabeledContent("Reminders", value: "\(receipt.reminderCount)")
                LabeledContent("Open", value: "\(receipt.incompleteCount)")
                if receipt.replayed {
                    Text("Hearth confirmed an exact safe retry.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

            case .failure(let message):
                Label("Snapshot not sent", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(theme.warmAccent)
                Text(message)
                    .foregroundStyle(.secondary)
                Button("Retry exact snapshot") {
                    model.retryUpload()
                }
                .accessibilityIdentifier("retry-reminder-snapshot")
            }

            Button {
                Task { await model.refreshAndUpload() }
            } label: {
                Label("Refresh Reminders and send", systemImage: "arrow.triangle.2.circlepath")
            }
            .disabled(isUploadBusy)
            .accessibilityIdentifier("refresh-and-upload-reminders")

            Text("Every successful EventKit read while the app is open also sends a bounded full snapshot automatically. A failed read never clears Hearth.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private func pairingCodeSection(_ pairing: ReminderSourcePairingRequest) -> some View {
        Section("Approve in Hearth") {
            Text("On a signed-in Hearth administration screen, approve this six-character code:")
                .font(.subheadline)
            Text(pairing.code)
                .font(.system(.largeTitle, design: .monospaced, weight: .bold))
                .tracking(4)
                .frame(maxWidth: .infinity)
                .textSelection(.enabled)
                .accessibilityLabel("Pairing code \(pairing.code.map(String.init).joined(separator: " "))")
                .accessibilityIdentifier("reminder-source-pairing-code")
            LabeledContent("Expires", value: pairing.expiresAt.formatted(date: .omitted, time: .shortened))
            Button("Check approval now") {
                Task { await model.checkApproval() }
            }
            .accessibilityIdentifier("check-reminder-source-approval")
            Text("Hearth checks automatically while this app remains open. Approval creates no adult session on this iPhone.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private func progressSection(title: String, detail: String) -> some View {
        Section {
            HStack(alignment: .top, spacing: 12) {
                ProgressView()
                VStack(alignment: .leading, spacing: 5) {
                    Text(title).font(.headline)
                    Text(detail).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    private var isUploadBusy: Bool {
        switch model.uploadState {
        case .uploading, .retrying:
            true
        default:
            false
        }
    }
}
