import SwiftUI

struct PrivacyView: View {
    @Environment(HearthTheme.self) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("A deliberately small proof")
                    .font(.title2.weight(.semibold))
                Text("Hearth Companion is a native iPhone surface for Apple integrations that iOS protects behind its own permission system.")
                    .font(.body)
                privacySection(title: "What this proof reads", systemImage: "checklist") {
                    Text("Only the reminder lists you select, plus each reminder’s title, list, due date or time, and completion state.")
                }
                privacySection(title: "What stays on this iPhone", systemImage: "iphone") {
                    Text("Hearth saves only the identifiers of the reminder lists you select so that choice survives relaunch. It does not persist reminder titles, dates, completion states, or Apple credentials.")
                }
                privacySection(title: "What it never does", systemImage: "hand.raised") {
                    Text("It never creates, edits, completes, or deletes EventKit reminders. It has no server write path, background sync, APNs, two-way completion, Apple ID request, iCloud app-specific password, private URL, or NAS credential.")
                }
                privacySection(title: "Future Hearth direction", systemImage: "arrow.forward.circle") {
                    Text("One installed Hearth Companion app can eventually combine native Apple integrations with access to the existing responsive Hearth web administration UI, avoiding a full duplicate native rewrite. Hearth will evaluate a carefully scoped WKWebView against opening an authenticated web session; neither is part of this proof.")
                }
                Text("EventKit permission is controlled by iOS. Turning permission off in Settings makes the proof stop reading without changing your Reminders data.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .background(theme.background.ignoresSafeArea())
        .navigationTitle("Privacy & scope")
    }

    @ViewBuilder
    private func privacySection<Content: View>(title: String, systemImage: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .foregroundStyle(theme.accent)
            content()
                .font(.body)
        }
        .padding(16)
        .background(theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
