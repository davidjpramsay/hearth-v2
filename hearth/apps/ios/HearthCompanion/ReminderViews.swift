import SwiftUI
import UIKit

struct ReminderHomeView: View {
    let model: ReminderViewModel

    @Environment(RouterPath.self) private var router
    @Environment(HearthTheme.self) private var theme
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                stateContent
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
        .background(theme.background.ignoresSafeArea())
        .navigationTitle("Reminders")
        .toolbar {
            if model.snapshot?.lists.isEmpty == false {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        router.presentedSheet = .listPicker
                    } label: {
                        Label("Choose lists", systemImage: "line.3.horizontal.decrease.circle")
                    }
                    .accessibilityIdentifier("choose-reminder-lists")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.refresh() }
                } label: {
                    Label("Refresh reminders", systemImage: "arrow.clockwise")
                }
                .disabled(isLoading)
                .accessibilityIdentifier("refresh-reminders")
            }
        }
        .refreshable { await model.refresh() }
        .task { await model.start() }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, model.snapshot != nil else { return }
            Task { await model.refresh() }
        }
    }

    @ViewBuilder
    private var stateContent: some View {
        switch model.state {
        case .firstUse:
            PermissionIntroView {
                Task { await model.requestAccess() }
            }
        case .requestingPermission:
            PermissionRequestingView()
        case .unavailable(let authorization):
            UnavailablePermissionView(authorization: authorization) {
                if authorization == .denied {
                    if let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                        openURL(settingsURL)
                    }
                } else {
                    Task { await model.refresh() }
                }
            }
        case .loading:
            LoadingRemindersView()
        case .empty(let snapshot):
            ReminderSummaryView(snapshot: snapshot, isStale: false)
            EmptyRemindersView(snapshot: snapshot) {
                router.presentedSheet = .listPicker
            }
        case .success(let snapshot):
            ReminderSummaryView(snapshot: snapshot, isStale: false)
            ReminderListView(snapshot: snapshot) { id in
                router.path.append(.reminder(id: id))
            }
        case .stale(let snapshot, let message):
            StaleBanner(message: message, updatedAt: snapshot.updatedAt)
            ReminderSummaryView(snapshot: snapshot, isStale: true)
            ReminderListView(snapshot: snapshot) { id in
                router.path.append(.reminder(id: id))
            }
        case .failure(let message):
            FailureView(message: message) {
                Task { await model.refresh() }
            }
        }
    }

    private var isLoading: Bool {
        if model.isRefreshing { return true }
        if case .loading = model.state { return true }
        if case .requestingPermission = model.state { return true }
        return false
    }
}

private struct PermissionIntroView: View {
    let request: () -> Void
    @Environment(HearthTheme.self) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            IconBadge(systemName: "checklist", color: theme.accent)
            Text("Bring your Apple reminders into Hearth")
                .font(.title2.weight(.semibold))
            Text("This first proof reads the reminder lists you choose and shows each title, list, due date or time, and completion state.")
                .font(.body)
            Text("iOS requires full Reminders access for apps that read reminders. Hearth Companion uses that permission only for reading: it never creates, edits, completes, or deletes a reminder. After you separately pair with your private Hearth, it can send only selected list titles and each reminder’s title, due fields, and completion state—never your Apple ID or Apple credentials.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Button("Allow Reminders access", action: request)
                .buttonStyle(.borderedProminent)
                .tint(theme.accent)
                .accessibilityIdentifier("request-reminders-access")
        }
        .cardSurface()
        .accessibilityElement(children: .contain)
    }
}

private struct PermissionRequestingView: View {
    var body: some View {
        StateCard {
            ProgressView()
                .controlSize(.large)
            Text("Waiting for Apple Reminders permission…")
                .font(.headline)
            Text("Choose Allow in the system prompt. Hearth will read your lists after permission is granted.")
                .font(.body)
                .foregroundStyle(.secondary)
        }
    }
}

private struct UnavailablePermissionView: View {
    let authorization: ReminderAuthorization
    let action: () -> Void
    @Environment(HearthTheme.self) private var theme

    var body: some View {
        StateCard {
            IconBadge(systemName: authorization == .restricted ? "lock.fill" : "hand.raised.fill", color: theme.warmAccent)
            Text(title)
                .font(.title3.weight(.semibold))
            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
            Button(buttonTitle, action: action)
                .buttonStyle(.bordered)
                .accessibilityIdentifier(authorization == .denied ? "open-settings" : "retry-reminders-access")
        }
    }

    private var title: String {
        switch authorization {
        case .denied: "Reminders access is off"
        case .restricted: "Reminders access is restricted"
        case .writeOnly, .unknown: "Full Reminders access is needed"
        default: "Reminders access is unavailable"
        }
    }

    private var message: String {
        switch authorization {
        case .denied:
            "Open Settings → Privacy & Security → Reminders and turn on Hearth Companion. This app will still remain read-only in this proof."
        case .restricted:
            "This iPhone or its parental controls currently prevent Hearth Companion from reading reminders. No data was changed."
        case .writeOnly, .unknown:
            "Hearth Companion needs full access to read existing reminders. iOS does not provide a read-only EventKit permission."
        default:
            "Check the permission in Settings, then try again."
        }
    }

    private var buttonTitle: String {
        authorization == .denied ? "Open Settings" : "Try again"
    }
}

private struct LoadingRemindersView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Reading your selected lists…")
                .font(.headline)
            ForEach(0..<3, id: \.self) { _ in
                HStack(spacing: 12) {
                    Image(systemName: "circle")
                    VStack(alignment: .leading, spacing: 6) {
                        RoundedRectangle(cornerRadius: 4).frame(height: 16)
                        RoundedRectangle(cornerRadius: 4).frame(width: 160, height: 12)
                    }
                }
                .foregroundStyle(.secondary)
            }
        }
        .cardSurface()
        .redacted(reason: .placeholder)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Reading reminders")
    }
}

private struct ReminderSummaryView: View {
    let snapshot: ReminderSnapshot
    let isStale: Bool
    @Environment(HearthTheme.self) private var theme

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Selected lists")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text("\(snapshot.selectedListIDs.count) of \(snapshot.lists.count)")
                    .font(.title3.weight(.semibold))
            }
            Divider()
                .frame(height: 38)
            VStack(alignment: .leading, spacing: 4) {
                Text("Visible reminders")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text("\(snapshot.reminders.count)")
                    .font(.title3.weight(.semibold))
            }
            Spacer()
            if isStale {
                Label("Stale", systemImage: "clock.badge.exclamationmark")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(theme.warmAccent)
            }
        }
        .cardSurface()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(snapshot.selectedListIDs.count) of \(snapshot.lists.count) lists selected, \(snapshot.reminders.count) reminders visible\(isStale ? ", showing cached data" : "")")
    }
}

private struct EmptyRemindersView: View {
    let snapshot: ReminderSnapshot
    let chooseLists: () -> Void

    var body: some View {
        StateCard {
            Image(systemName: snapshot.lists.isEmpty ? "tray" : "checklist")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text(title)
                .font(.title3.weight(.semibold))
            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if !snapshot.lists.isEmpty {
                Button("Choose lists") { chooseLists() }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("choose-lists-empty-state")
            }
        }
    }

    private var title: String {
        if snapshot.lists.isEmpty { return "No reminder lists found" }
        if snapshot.selectedListIDs.isEmpty { return "No lists selected" }
        return "No reminders in these lists"
    }

    private var message: String {
        if snapshot.lists.isEmpty {
            return "Apple reported no reminder-capable lists for Hearth Companion. Try again after checking that Reminders is set up on this iPhone."
        }
        if snapshot.selectedListIDs.isEmpty {
            return "Choose one or more lists to read. Hearth will not change any list or reminder."
        }
        return "The selected lists are currently empty. New reminders will appear the next time you refresh."
    }
}

private struct ReminderListView: View {
    let snapshot: ReminderSnapshot
    let select: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your reminders")
                .font(.title3.weight(.semibold))
            LazyVStack(spacing: 10) {
                ForEach(snapshot.reminders) { reminder in
                    Button { select(reminder.id) } label: {
                        ReminderRow(reminder: reminder)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("reminder-\(reminder.id)")
                }
            }
        }
    }
}

private struct ReminderRow: View {
    let reminder: HearthReminder
    @Environment(HearthTheme.self) private var theme

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: reminder.isCompleted ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .foregroundStyle(reminder.isCompleted ? theme.success : .secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                Text(reminder.title)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                Label(reminder.listTitle, systemImage: "list.bullet")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let dueDate = reminder.dueDate {
                    Label(dueDate.formatted(date: .abbreviated, time: reminder.hasDueTime ? .shortened : .omitted), systemImage: "calendar")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    Label("No due date", systemImage: "calendar")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            Text(reminder.isCompleted ? "Completed" : "Open")
                .font(.caption.weight(.semibold))
                .foregroundStyle(reminder.isCompleted ? theme.success : .secondary)
        }
        .padding(16)
        .background(theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        let due = reminder.dueDate.map { $0.formatted(date: .abbreviated, time: reminder.hasDueTime ? .shortened : .omitted) } ?? "no due date"
        return "\(reminder.title), \(reminder.listTitle), due \(due), \(reminder.isCompleted ? "completed" : "open")"
    }
}

struct ReminderDetailView: View {
    let reminderID: String
    let model: ReminderViewModel

    var body: some View {
        Group {
            if let reminder = model.snapshot?.reminders.first(where: { $0.id == reminderID }) {
                ScrollView {
                    ReminderRow(reminder: reminder)
                        .padding()
                }
            } else {
                ContentUnavailableView("Reminder unavailable", systemImage: "questionmark.circle", description: Text("Refresh to read the latest selected lists."))
            }
        }
        .navigationTitle("Reminder detail")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ReminderListPickerSheet: View {
    let model: ReminderViewModel
    @State private var selectedListIDs: Set<String>
    @State private var isSaving = false
    @Environment(\.dismiss) private var dismiss
    @Environment(HearthTheme.self) private var theme

    init(model: ReminderViewModel) {
        self.model = model
        _selectedListIDs = State(initialValue: model.selectedListIDs)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Choose which reminder lists Hearth Companion may read. This selection stays on this iPhone. No reminder is changed.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Section("Reminder lists") {
                    ForEach(model.snapshot?.lists ?? []) { list in
                        Toggle(isOn: binding(for: list.id)) {
                            Label(list.title, systemImage: "list.bullet")
                        }
                        .accessibilityIdentifier("reminder-list-\(list.id)")
                    }
                }

                Section {
                    Button("Select all") {
                        selectedListIDs = Set((model.snapshot?.lists ?? []).map(\.id))
                    }
                    Button("Clear selection", role: .destructive) {
                        selectedListIDs.removeAll()
                    }
                }
            }
            .navigationTitle("Choose lists")
            .navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden)
            .background(theme.background)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Reading…" : "Done") {
                        Task {
                            isSaving = true
                            await model.selectLists(selectedListIDs)
                            isSaving = false
                            dismiss()
                        }
                    }
                    .disabled(isSaving)
                    .accessibilityIdentifier("save-reminder-list-selection")
                }
            }
        }
    }

    private func binding(for id: String) -> Binding<Bool> {
        Binding(
            get: { selectedListIDs.contains(id) },
            set: { isSelected in
                if isSelected {
                    selectedListIDs.insert(id)
                } else {
                    selectedListIDs.remove(id)
                }
            }
        )
    }
}

private struct StaleBanner: View {
    let message: String
    let updatedAt: Date
    @Environment(HearthTheme.self) private var theme

    var body: some View {
        Label {
            Text("Showing the last successful read from \(updatedAt.formatted(date: .abbreviated, time: .shortened)). Refresh when the iPhone is online.")
        } icon: {
            Image(systemName: "clock.badge.exclamationmark")
        }
        .font(.footnote)
        .foregroundStyle(theme.warmAccent)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(theme.warmAccent.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Stale reminders. Showing the last successful read from \(updatedAt.formatted(date: .abbreviated, time: .shortened)).")
        .help(message)
    }
}

private struct FailureView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        StateCard {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(.orange)
            Text("Couldn’t read reminders")
                .font(.title3.weight(.semibold))
            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Try again", action: retry)
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("retry-reminders")
        }
    }
}

private struct IconBadge: View {
    let systemName: String
    let color: Color

    var body: some View {
        Image(systemName: systemName)
            .font(.title2.weight(.semibold))
            .foregroundStyle(color)
            .padding(12)
            .background(color.opacity(0.12), in: Circle())
            .accessibilityHidden(true)
    }
}

private struct StateCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .center, spacing: 12) {
            content
        }
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
            .cardSurface()
    }
}

private extension View {
    func cardSurface() -> some View {
        modifier(CardSurfaceModifier())
    }
}

private struct CardSurfaceModifier: ViewModifier {
    @Environment(HearthTheme.self) private var theme

    func body(content: Content) -> some View {
        content
            .padding(20)
            .background(theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
